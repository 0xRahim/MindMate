"use client";

/**
 * StageEngine — owns the entire 3D stage + the A/V sync state machine.
 *
 * Sync contract (fixes the old misalignment):
 *   idle → thinking → arming → performing → idle
 *   - thinking:  placeholder motion only (Focus loop or think emote).
 *   - arming:    response received. Clip preloaded, expression + animation
 *                STAGED but nothing activates. synthesize emitted last.
 *   - performing: committed atomically on first scheduled audio chunk:
 *                animation.play() + expression ramp + caption + lip envelope
 *                all start on the same tick the voice starts.
 *   - No TTS connected → commit immediately (same code path, no wait).
 *   - Manual Speak routes through the same stage/commit path.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { io, type Socket } from "socket.io-client";
import { loadMixamoAnimation } from "@/lib/three/retarget";
import { EMOTE_MAP, type EmoteId } from "@/lib/three/emotes";
import type { ChatPreset } from "@/lib/chat/api";

export type ChatState = "" | "thinking" | "speaking" | "listening" | string;
export type Phase = "idle" | "thinking" | "arming" | "performing";
export type Framing = "closeup" | "mid" | "full";

const FRAMING_PRESETS: Record<Framing, { dist: number; ty: number }> = {
  closeup: { dist: 1.9, ty: 1.42 },
  mid: { dist: 2.7, ty: 1.22 },
  full: { dist: 3.4, ty: 1.0 },
};

export type EngineEvents = {
  onChatState: (s: ChatState) => void;
  onCaption: (text: string) => void;
  onNowPlaying: (name: string | null) => void;
  onAnimStatus: (s: string) => void;
  onTts: (label: string, connected: boolean) => void;
  onTtsMsg: (s: string) => void;
  onAmp: (pct: number) => void;
  onModels: (list: { name: string; url: string }[]) => void;
  onAnims: (list: { name: string; url: string }[]) => void;
  onVrmStatus: (s: string) => void;
  onStageStatus: (s: string) => void;
  onMessage: (role: "user" | "bot" | "sys", text: string) => void;
  onMascotScreen?: (x: number, y: number, scale: number) => void;
};

export type CharPos = { x: number; y: number; z: number; lift: number };

const IDLE_PATTERNS = [/idle/i, /standing.*idle/i, /stand.*neutral/i, /breathing/i, /waiting/i];
const LOOKAHEAD = 0.08;
const CLIP_TIMEOUT_MS = 2500;

type Staged = {
  action: THREE.AnimationAction | null;
  name: string | null;
  loop: boolean;
  emote: EmoteId;
  expression: string | null;
  text: string;
};

export class StageEngine {
  private wrap: HTMLElement;
  private ev: EngineEvents;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private activeAction: THREE.AnimationAction | null = null;
  private clipCache = new Map<string, THREE.AnimationClip>();
  private activeEmote: EmoteId = "idle";
  private autoBlink = true;
  private blinkV = 0;
  private blinkH = 0;

  // sync state
  private phase: Phase = "idle";
  private staged: Staged | null = null;
  private firstChunk = true;
  private armedForSpeech = false;

  // audio
  private socket: Socket | null = null;
  ttsConnected = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array | null = null;
  private timeBuf: Uint8Array<ArrayBuffer> | null = null;
  private nextStart = 0;
  private speaking = false;
  private synthActive = false;
  // static SFX (boop/dodge/touch reactions) — shares the analyser + lip path
  private sfxEl: HTMLAudioElement | null = null;
  private sfxSpeaking = false;
  // scheduled-envelope lip driver: each chunk registers {start, end, level}
  private chunks: { start: number; end: number; level: number }[] = [];
  private mouthDrive = 0;
  private mouthSeed = Math.random() * 1000;
  private sources: AudioBufferSourceNode[] = [];

  // idle
  private fbxPlaying = false;
  private autoIdle = false;
  private idleCycleAt = Infinity;
  loopAnimation = true;

  charPos: CharPos = { x: 0, y: 0, z: 0, lift: 0.02 };
  // Fixed origin stage (landing look) — feet rest on the disc at lift height.

  // ── landing stage systems ──────────────────────────────────────────
  // VRM lives under charRoot so position/rotation/scale tricks compose.
  private charRoot = new THREE.Group();
  private framing: Framing = "closeup";
  private framingAuto: Framing | null = null;
  private flash = 0;
  private rim: THREE.DirectionalLight | null = null;
  // gaze + boop + dodge
  private lookNX = 0;
  private lookNY = 0;
  private lookX = 0;
  private lookY = 0;
  private vy = 0;
  private hopY = 0;
  private hopping = false;
  private nudgeX = 0;
  // scroll director pose (landing parity): eased toward targets each tick
  private targetX = 0;
  private targetRotY = 0;
  private walkTarget = 0;
  private walkAmt = 0;
  private targetDepth = 0;
  private depth = 0;
  private mascotFrame = 0;
  private gltfLoader = new GLTFLoader();
  private blobUrl: string | null = null;

  constructor(wrap: HTMLElement, ev: EngineEvents) {
    this.wrap = wrap;
    this.ev = ev;
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 1.55, 1.9);
    this.gltfLoader.register((p) => new VRMLoaderPlugin(p));
    this.initScene();
    this.tick();
  }

  // ── scene ──────────────────────────────────────────────────────────────
  private initScene() {
    this.scene.background = null; // transparent — CSS gradient shows through
    this.scene.fog = new THREE.Fog(0x0a0618, 6, 14);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.wrap.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 8;
    this.controls.target.set(0, 1.42, 0);
    this.controls.update();
    this.scene.add(new THREE.HemisphereLight(0xffe8ff, 0x14092b, 0.9));
    const kl = new THREE.DirectionalLight(0xfff1de, 2.2);
    kl.position.set(2, 4, 3);
    kl.castShadow = true;
    kl.shadow.mapSize.set(1024, 1024);
    this.scene.add(kl);
    const fl = new THREE.DirectionalLight(0xc4b5fd, 0.7);
    fl.position.set(-2, 2, 2);
    this.scene.add(fl);
    this.rim = new THREE.DirectionalLight(0x22d3ee, 1.1);
    this.rim.position.set(0, 3, -2.5);
    this.scene.add(this.rim);
    // stylized disc stage + glow ring (landing look)
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 64),
      new THREE.MeshStandardMaterial({ color: 0x141024, roughness: 0.55, metalness: 0.35, transparent: true, opacity: 0.92 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    this.scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.72, 64),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    this.scene.add(ring);
    this.scene.add(this.charRoot);
    this.resize();
  }

  resize() {
    const w = this.wrap.clientWidth || 1;
    const h = this.wrap.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  // ── bones / face ───────────────────────────────────────────────────────
  private getBone = (name: string): THREE.Object3D | null => {
    try {
      return (
        (this.vrm?.humanoid.getNormalizedBoneNode(
          name as never,
        ) as unknown as THREE.Object3D) ?? null
      );
    } catch {
      return null;
    }
  };

  setExpr(name: string, val: number) {
    const m = this.vrm?.expressionManager as unknown as
      | { setValue?: (n: string, v: number) => void; setExpression?: (n: string, v: number) => void }
      | undefined;
    if (!m) return;
    try {
      m.setValue?.(name, val);
    } catch {
      try {
        m.setExpression?.(name, val);
      } catch {
        /* noop */
      }
    }
  }

  resetFace() {
    ["aa", "ih", "ou", "ee", "oh", "blinkLeft", "blinkRight", "happy", "angry", "sad", "relaxed", "surprised"].forEach(
      (n) => this.setExpr(n, 0),
    );
    this.mouthDrive = 0;
    this.blinkV = 0;
    this.blinkH = 0;
  }

  // ── audio plumbing ─────────────────────────────────────────────────────
  private ensureAudio() {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
      return;
    }
    this.audioCtx = new AudioContext({ sampleRate: 24000, latencyHint: "playback" });
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048; // ~85ms RMS window @24kHz — stable loudness
    this.analyser.smoothingTimeConstant = 0.4;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeBuf = new Uint8Array(this.analyser.fftSize);
    this.analyser.connect(this.audioCtx.destination);
  }

  /** Schedule one PCM chunk; returns the absolute start time. Registers lip envelope. */
  private scheduleChunk(buf: ArrayBuffer): number {
    this.ensureAudio();
    const ctx = this.audioCtx!;
    const p16 = new Int16Array(buf);
    const f32 = new Float32Array(p16.length);
    let peak = 0;
    for (let i = 0; i < p16.length; i++) {
      const v = p16[i] / 32768;
      f32[i] = v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const ab = ctx.createBuffer(1, f32.length, 24000);
    ab.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = ab;
    if (this.analyser) src.connect(this.analyser);
    else src.connect(ctx.destination);
    const when = Math.max(ctx.currentTime + LOOKAHEAD, this.nextStart);
    src.start(when);
    this.nextStart = when + ab.duration;
    this.speaking = true;
    this.sources.push(src);
    // envelope level from chunk peak so the jaw opens exactly with audible sound
    this.chunks.push({ start: when, end: when + ab.duration, level: THREE.MathUtils.clamp(peak * 3.2, 0, 1) });
    if (this.chunks.length > 64) this.chunks.splice(0, this.chunks.length - 64);
    src.onended = () => {
      if (this.audioCtx && this.audioCtx.currentTime >= this.nextStart - 0.05) {
        this.speaking = false;
        this.synthActive = false;
        this.ev.onChatState("");
        this.ev.onAmp(0);
        this.resolvePerformance();
      }
    };
    return when;
  }

  // ── landing life: gaze, boop, dodge, mascot tracking, SFX ──────────
  /** Cursor gaze target in normalized -1..1 space. */
  setLook(nx: number, ny: number) {
    this.lookNX = Math.max(-1, Math.min(1, nx));
    this.lookNY = Math.max(-1, Math.min(1, ny));
  }

  /** Boop: hop impulse with gravity. Returns false if already airborne. */
  boop(): boolean {
    if (this.hopping || !this.vrm) return false;
    this.hopping = true;
    this.hopY = 0;
    this.vy = 2.6;
    this.juice();
    return true;
  }

  /** Dodge sidestep impulse (decays over ~1s). dir: -1 left, +1 right. */
  nudge(dir: number) {
    this.nudgeX = Math.max(-1.4, Math.min(1.4, this.nudgeX + dir * 0.9));
  }

  /** Button-press juice: rim flash (camera pull is handled by framing). */
  juice(color = 0x22d3ee) {
    this.flash = 1;
    if (this.rim) this.rim.color.setHex(color);
  }

  /** Any voice active — live TTS, synthesis, or static SFX. */
  isSpeaking() {
    return this.speaking || this.synthActive || this.sfxSpeaking;
  }

  /** Scroll director pose. x in world units, rotY radians, walking 0..1, depth 0..1. */
  setStagePose(x: number, rotY: number, walking: number, depth = 0) {
    this.targetX = x;
    this.targetRotY = rotY;
    this.walkTarget = walking > 0.5 ? 1 : 0;
    this.targetDepth = Math.max(0, Math.min(1, depth));
  }

  isWalking() {
    return this.walkTarget > 0.5 || this.walkAmt > 0.4;
  }

  /** Current mascot screen position (px) — for DOM proximity + hit tests. */
  mascotScreen(): { x: number; y: number } {
    const v = new THREE.Vector3();
    this.charRoot.getWorldPosition(v);
    v.y += 1.2 * this.charRoot.scale.x;
    v.project(this.camera);
    const w = this.wrap.clientWidth || 1;
    const h = this.wrap.clientHeight || 1;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  /**
   * Static SFX playback (boop/dodge/touch reactions) through the shared
   * analyser so the RMS lip-sync drives the jaw. Resolves when done.
   * Never touches the live TTS socket or the stage/commit machine.
   */
  async speakStatic(url: string): Promise<void> {
    this.stopStatic();
    return new Promise((resolve) => {
      const el = new Audio(url);
      el.preload = "auto";
      this.sfxEl = el;
      try {
        this.ensureAudio();
        if (this.audioCtx!.state === "suspended") void this.audioCtx!.resume();
        const src = this.audioCtx!.createMediaElementSource(el);
        src.connect(this.analyser!);
      } catch { /* analyser optional — jaw falls back to flap */ }
      this.sfxSpeaking = true;
      const done = () => {
        if (this.sfxEl !== el) return;
        this.sfxSpeaking = false;
        this.sfxEl = null;
        if (!this.speaking) this.resetLip();
        resolve();
      };
      el.onended = done;
      el.onerror = () => setTimeout(done, 1200);
      void el.play().catch(() => setTimeout(done, 1200));
    });
  }

  stopStatic() {
    try {
      this.sfxEl?.pause();
    } catch { /* noop */ }
    this.sfxEl = null;
    this.sfxSpeaking = false;
  }

  // ── TTS socket ─────────────────────────────────────────────────────────
  connectTTS(url: string) {
    if (this.socket) this.socket.disconnect();
    this.ev.onTts("Connecting…", false);
    this.ev.onTtsMsg("");
    const socket = io(url, { transports: ["websocket"] });
    this.socket = socket;
    socket.on("connect", () => {
      this.ttsConnected = true;
      this.ev.onTts("Connected", true);
      this.ev.onTtsMsg("Ready.");
    });
    socket.on("disconnect", () => {
      this.ttsConnected = false;
      this.speaking = false;
      this.synthActive = false;
      this.ev.onTts("Disconnected", false);
      this.ev.onAmp(0);
      this.abortToIdle();
    });
    socket.on("connect_error", (err: Error) => {
      this.ttsConnected = false;
      this.ev.onTts("Failed: " + err.message, false);
    });
    // synthesis_start = generating. Deliberately NO motion here.
    socket.on("synthesis_start", () => {
      this.nextStart = 0;
      this.speaking = true;
      this.armedForSpeech = true;
      this.firstChunk = true;
      this.synthActive = true;
      this.ev.onChatState("speaking");
    });
    // audio_chunk[0] = voice actually exists → COMMIT staged performance now.
    socket.on("audio_chunk", (d: { pcm?: ArrayBuffer }) => {
      if (d.pcm) this.scheduleChunk(d.pcm);
      if (this.firstChunk) {
        this.firstChunk = false;
        this.commitStaged();
      }
    });
    socket.on("synthesis_done", () => {
      this.ev.onTtsMsg("Done.");
      this.synthActive = false;
    });
    socket.on("error", (d: { message?: string }) => {
      this.speaking = false;
      this.synthActive = false;
      this.ev.onTtsMsg("Error: " + (d.message ?? "unknown"));
      this.abortToIdle();
    });
    socket.on("cancelled", () => {
      this.speaking = false;
      this.synthActive = false;
      this.ev.onAmp(0);
      this.abortToIdle();
    });
  }

  disconnectTTS() {
    this.socket?.disconnect();
    this.socket = null;
    this.ttsConnected = false;
    this.speaking = false;
    this.synthActive = false;
    this.ev.onTts("Disconnected", false);
    this.ev.onAmp(0);
    this.abortToIdle();
  }

  // ── performance state machine ──────────────────────────────────────────
  private async ensureClip(name: string): Promise<THREE.AnimationClip | null> {
    const hit = this.clipCache.get(name);
    if (hit) return hit;
    // find URL from loaded anim list via DOM-free lookup: caller passes url map
    return null;
  }

  /** Stage expression+animation, then emit synthesize LAST (audio-gated commit). */
  async performPreset(preset: ChatPreset, animUrlByName: Map<string, string>, voice: string, speed: number) {
    this.ev.onCaption(preset.text);
    // Stage
    let action: THREE.AnimationAction | null = null;
    let stagedName: string | null = null;
    let loop = preset.animation_loop;
    if (preset.animation && this.vrm) {
      let clip = this.clipCache.get(preset.animation) ?? null;
      if (!clip) {
        const url = animUrlByName.get(preset.animation);
        if (url) {
          try {
            clip = await Promise.race([
              loadMixamoAnimation(url, this.vrm),
              new Promise<null>((_, rej) => setTimeout(() => rej(new Error("clip timeout")), CLIP_TIMEOUT_MS)),
            ]);
            if (clip) {
              this.clipCache.set(preset.animation, clip);
              this.clipCache.set(url, clip);
            }
          } catch (e) {
            console.warn("Clip preload failed, proceeding audio-only:", (e as Error).message);
          }
        }
      }
      if (clip) {
        if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.vrm.scene);
        action = this.mixer.clipAction(clip);
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        if (!loop) action.clampWhenFinished = true;
        stagedName = preset.animation;
      }
    }
    this.phase = "arming";
    this.staged = {
      action,
      name: stagedName,
      loop,
      emote: this.coerceEmote(preset.emote),
      expression: preset.expression,
      text: preset.text,
    };

    if (preset.text && this.socket?.connected) {
      this.synthActive = true;
      this.armedForSpeech = false;
      this.firstChunk = true;
      this.ensureAudio();
      this.socket.emit("synthesize", { text: preset.text, voice, speed });
      // Safety: if TTS never delivers (error path missed), fall back after 12s.
      const myStage = this.staged;
      setTimeout(() => {
        if (this.phase === "arming" && this.staged === myStage && this.firstChunk) {
          console.warn("No audio arrived — committing motion without voice.");
          this.firstChunk = false;
          this.commitStaged();
        }
      }, 12000);
    } else {
      // No TTS: same commit path, immediately.
      this.firstChunk = false;
      this.commitStaged();
    }
  }

  /** Manual Speak — identical gating: expression staged, motion+voice commit together. */
  speakManual(text: string, voice: string, speed: number, expression: string | null) {
    if (!text.trim() || !this.socket?.connected) return;
    this.ev.onCaption(text);
    this.phase = "arming";
    this.staged = { action: null, name: null, loop: true, emote: "idle", expression, text };
    this.synthActive = true;
    this.armedForSpeech = false;
    this.firstChunk = true;
    this.ensureAudio();
    this.socket.emit("synthesize", { text, voice, speed });
  }

  /** Atomic commit — called exactly once: on first audio chunk (or no-TTS fallback). */
  private commitStaged() {
    const s = this.staged;
    this.staged = null;
    if (!s) return;
    // Cancel thinking placeholder explicitly.
    this.cancelThinkingMotion();
    this.phase = "performing";
    // 1. expression ramps in tick via target (set instantly here; smoothing in tick)
    if (s.expression) {
      this.resetFaceSoft();
      this.setExpr(s.expression, 1.0);
      this.expressionHold = s.expression;
    } else {
      this.expressionHold = null;
    }
    // 2. animation OR emote — never both fighting
    if (s.action && s.name) {
      if (this.mixer) {
        this.autoIdle = false;
        this.idleCycleAt = Infinity;
        const a = s.action;
        if (this.activeAction && this.activeAction !== a) {
          a.reset();
          a.crossFadeFrom(this.activeAction, 0.3, true);
        } else a.reset();
        a.play();
        this.activeAction = a;
        this.fbxPlaying = true;
        this.activeEmote = null as unknown as EmoteId;
        // auto pull-back: full-body stage for performances, keep framing for idles
        this.framingAuto = s.name && IDLE_PATTERNS.some((p) => p.test(s.name ?? "")) ? null : "full";
        this.ev.onAnimStatus("> " + s.name);
        this.ev.onNowPlaying(s.name);
        if (!s.loop) {
          this.mixer.removeEventListener("finished", this.onAnimDone);
          this.mixer.addEventListener("finished", this.onAnimDone);
        } else {
          this.mixer.removeEventListener("finished", this.onAnimDone);
        }
      }
      // looped FBX + emote hint: emote ignored while FBX drives (prevents bone fight)
    } else {
      this.playEmote(s.emote);
    }
    this.ev.onChatState(this.socket?.connected ? "speaking" : "");
  }

  private expressionHold: string | null = null;

  private onAnimDone = () => {
    this.fbxPlaying = false;
    this.autoIdle = false;
    this.playEmote("idle");
    this.ev.onAnimStatus("");
    this.ev.onNowPlaying(null);
    this.resolvePerformance();
  };

  /** End of voice (or one-shot end): hold expression briefly, then idle. */
  private resolvePerformance() {
    if (this.phase !== "performing") {
      // still return to idle loop if appropriate
      if (!this.speaking && !this.synthActive) this.startIdleLoop();
      return;
    }
    this.phase = "idle";
    this.framingAuto = null;
    const hold = this.expressionHold;
    this.expressionHold = null;
    setTimeout(() => {
      if (this.phase === "idle" && hold) {
        // gentle release rather than snap
        this.setExpr(hold, 0);
      }
      this.startIdleLoop();
    }, 450);
  }

  private abortToIdle() {
    this.staged = null;
    this.phase = "idle";
    this.expressionHold = null;
    this.framingAuto = null;
    this.ev.onChatState("");
    this.startIdleLoop();
  }

  stopSpeaking() {
    this.socket?.emit("cancel");
    this.stopStatic();
    this.speaking = false;
    this.synthActive = false;
    this.staged = null;
    this.phase = "idle";
    this.expressionHold = null;
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources = [];
    this.chunks = [];
    if (this.audioCtx) {
      void this.audioCtx.suspend().then(() => this.audioCtx?.resume());
      this.nextStart = 0;
    }
    this.resetLip();
    this.ev.onChatState("");
    this.startIdleLoop();
  }

  // ── chat ───────────────────────────────────────────────────────────────
  private coerceEmote(e: string): EmoteId {
    return (Object.keys(EMOTE_MAP) as EmoteId[]).includes(e as EmoteId) ? (e as EmoteId) : "idle";
  }

  private playThinking() {
    this.phase = "thinking";
    this.ev.onChatState("thinking");
    if (this.vrm && this.clipCache.has("Focus")) {
      if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.vrm.scene);
      const a = this.mixer.clipAction(this.clipCache.get("Focus")!);
      a.setLoop(THREE.LoopRepeat, Infinity);
      if (this.activeAction && this.activeAction !== a) a.reset().crossFadeFrom(this.activeAction, 0.3, true);
      else a.reset();
      a.play();
      this.activeAction = a;
      this.fbxPlaying = true;
      this.autoIdle = false;
      this.idleCycleAt = Infinity;
    } else {
      this.playEmote("think");
    }
  }

  private cancelThinkingMotion() {
    // Thinking FBX is in activeAction; commitStaged crossfades away from it.
    // Procedural think emote is just activeEmote — overwritten by playEmote/commit.
  }

  async sendChat(msg: string, history: { role: "user" | "assistant"; content: string }[], animUrlByName: Map<string, string>, voice: string, speed: number, personaId: "aiko" | "yuki" = "aiko"): Promise<{ sessionId: string } | null> {
    const text = msg.trim();
    if (!text) return null;
    this.ev.onMessage("user", text);
    this.playThinking();
    try {
      const { postChat } = await import("@/lib/chat/api");
      const reply = await postChat(text, history, personaId);
      for (const w of reply.warnings ?? []) this.ev.onMessage("sys", w);
      if (reply.agent === "jules" && reply.sessionId) {
        // Long task handed to Jules — no instant performance; the page polls
        // the session and posts the PR link when it completes.
        this.ev.onMessage("bot", reply.text);
        this.ev.onMessage("sys", `⚙ Jules task started: ${reply.sessionTitle ?? "task"}${reply.sessionUrl ? ` — ${reply.sessionUrl}` : ""}`);
        this.phase = "idle";
        this.ev.onChatState("");
        this.playEmote("idle");
        this.startIdleLoop();
        return { sessionId: reply.sessionId };
      }
      this.ev.onMessage("bot", reply.text);
      await this.performPreset(reply, animUrlByName, voice, speed);
      return null;
    } catch (e) {
      console.error(e);
      this.ev.onMessage("sys", "Error: " + (e as Error).message);
      this.phase = "idle";
      this.ev.onChatState("");
      this.playEmote("idle");
      this.startIdleLoop();
      return null;
    }
  }

  // ── animations ─────────────────────────────────────────────────────────
  async preloadAnimations(onList: (names: { name: string; url: string }[]) => void) {
    if (!this.vrm) return;
    try {
      const r = await fetch("/api/animations");
      if (!r.ok) return;
      const list = (await r.json()) as { name: string; url: string }[];
      onList(list);
      this.ev.onAnims(list);
      if (!list.length) return;
      this.ev.onAnimStatus(`Preloading 0/${list.length}…`);
      let done = 0;
      await Promise.allSettled(
        list.map(async (a) => {
          const name = a.name.replace(/\.fbx$/i, "");
          try {
            const clip = await loadMixamoAnimation(a.url, this.vrm!);
            this.clipCache.set(name, clip);
            this.clipCache.set(a.url, clip);
            this.ev.onAnimStatus(`Preloading ${++done}/${list.length}…`);
          } catch (e) {
            console.warn("Preload fail:", name, (e as Error).message);
          }
        }),
      );
      this.ev.onAnimStatus(`${done} animations ready`);
      setTimeout(() => this.ev.onAnimStatus(""), 2500);
      setTimeout(() => this.startIdleLoop(), 400);
    } catch (e) {
      console.warn("preload:", (e as Error).message);
    }
  }

  playAnimation(url: string, name: string) {
    if (!this.vrm) {
      this.ev.onAnimStatus("Load a VRM first.");
      return;
    }
    const go = (clip: THREE.AnimationClip) => {
      if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.vrm!.scene);
      const action = this.mixer.clipAction(clip);
      action.setLoop(this.loopAnimation ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      if (!this.loopAnimation) action.clampWhenFinished = true;
      this.activateAction(action, name);
      this.mixer.removeEventListener("finished", this.onAnimDone);
      if (!this.loopAnimation) this.mixer.addEventListener("finished", this.onAnimDone);
    };
    const hit = this.clipCache.get(name);
    if (hit) go(hit);
    else {
      this.ev.onAnimStatus("Loading " + name + "…");
      loadMixamoAnimation(url, this.vrm)
        .then((clip) => {
          this.clipCache.set(name, clip);
          this.clipCache.set(url, clip);
          go(clip);
        })
        .catch((e: Error) => this.ev.onAnimStatus("Error: " + e.message));
    }
  }

  private activateAction(action: THREE.AnimationAction, name: string) {
    if (!this.mixer) return;
    this.autoIdle = false;
    this.idleCycleAt = Infinity;
    this.phase = "performing";
    if (this.activeAction && this.activeAction !== action) {
      action.reset();
      action.crossFadeFrom(this.activeAction, 0.3, true);
    } else action.reset();
    action.play();
    this.activeAction = action;
    this.fbxPlaying = true;
    this.activeEmote = null as unknown as EmoteId;
    this.framingAuto = IDLE_PATTERNS.some((p) => p.test(name)) ? null : "full";
    this.ev.onAnimStatus("> " + name);
    this.ev.onNowPlaying(name);
  }

  stopAnimation() {
    this.staged = null;
    this.autoIdle = false;
    this.idleCycleAt = Infinity;
    this.phase = "idle";
    this.framingAuto = null;
    this.activeAction?.fadeOut(0.3);
    const cur = this.activeAction;
    setTimeout(() => cur?.stop(), 350);
    this.activeAction = null;
    this.fbxPlaying = false;
    this.playEmote("idle");
    this.ev.onAnimStatus("");
    this.ev.onNowPlaying(null);
    setTimeout(() => this.startIdleLoop(), 400);
  }

  toggleLoop() {
    this.loopAnimation = !this.loopAnimation;
    if (this.activeAction) this.activeAction.setLoop(this.loopAnimation ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    return this.loopAnimation;
  }

  playEmote(id: EmoteId) {
    this.activeEmote = id;
    this.autoIdle = false;
    this.idleCycleAt = Infinity;
    this.framingAuto = null;
    if (this.fbxPlaying) {
      this.activeAction?.fadeOut(0.3);
      const cur = this.activeAction;
      setTimeout(() => cur?.stop(), 350);
      this.activeAction = null;
      this.fbxPlaying = false;
      this.ev.onAnimStatus("");
      this.ev.onNowPlaying(null);
    }
  }

  private resetFaceSoft() {
    // Clear only emotion channels; lip channels are driven every tick.
    ["happy", "angry", "sad", "relaxed", "surprised"].forEach((n) => this.setExpr(n, 0));
  }

  // ── idle ───────────────────────────────────────────────────────────────
  private idleNames(): string[] {
    return [...this.clipCache.keys()]
      .filter((k) => !k.startsWith("http") && !k.startsWith("/") && !k.includes("\\"))
      .filter((n) => IDLE_PATTERNS.some((p) => p.test(n)));
  }

  startIdleLoop() {
    if (!this.vrm) return;
    if (this.speaking || this.synthActive) return;
    if (this.fbxPlaying && !this.autoIdle) return;
    if (this.phase === "thinking" || this.phase === "arming" || this.phase === "performing") return;
    this.idleCycleAt = Infinity;
    const names = this.idleNames();
    if (!names.length) {
      if (this.autoIdle) {
        this.autoIdle = false;
        this.fbxPlaying = false;
      }
      return;
    }
    if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.vrm.scene);
    const name = names[Math.floor(Math.random() * names.length)];
    const clip = this.clipCache.get(name);
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.timeScale = 1;
    if (this.activeAction && this.activeAction !== action) {
      action.reset();
      action.crossFadeFrom(this.activeAction, 0.7, true);
    } else action.reset();
    action.play();
    this.activeAction = action;
    this.fbxPlaying = true;
    this.autoIdle = true;
    this.activeEmote = null as unknown as EmoteId;
    this.framingAuto = null; // idle always plays in the default framing
    this.idleCycleAt = this.clock.elapsedTime + (18 + Math.random() * 12);
  }

  // ── position / camera (fixed origin stage) ───────────────────────────
  /** World Y of her feet: disc level + lift trim. */
  feetY() {
    return this.charPos.lift;
  }

  setCamHome() {
    const f = this.feetY();
    // Snap to the current framing preset (debug "Reset view").
    const preset = FRAMING_PRESETS[this.framingAuto ?? this.framing];
    this.camera.position.set(this.charPos.x, f + this.charPos.y + preset.ty, this.charPos.z + preset.dist);
    this.controls.target.set(this.charPos.x, f + this.charPos.y + preset.ty, this.charPos.z);
    this.controls.update();
  }

  /** Chapter-level framing default (dashboard opens on close-up). */
  setFraming(f: Framing) {
    this.framing = f;
  }

  // ── VRM ────────────────────────────────────────────────────────────────
  private onVRMLoaded(v: VRM, name: string) {
    if (this.vrm?.scene) {
      this.charRoot.remove(this.vrm.scene);
      this.disposeVRM(this.vrm.scene);
    }
    this.vrm = v;
    this.mixer = null;
    this.activeAction = null;
    this.fbxPlaying = false;
    this.autoIdle = false;
    this.idleCycleAt = Infinity;
    this.phase = "idle";
    this.staged = null;
    VRMUtils.removeUnnecessaryVertices(v.scene);
    (VRMUtils as unknown as { combineSkeletons?: (s: THREE.Object3D) => void }).combineSkeletons?.(v.scene);
    v.scene.rotation.y = Math.PI;
    v.scene.position.set(0, 0, 0);
    this.charRoot.add(v.scene);
    this.charRoot.rotation.set(0, 0, 0);
    this.charRoot.scale.setScalar(1);
    this.hopping = false;
    this.nudgeX = 0;
    v.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
      }
    });
    this.resetFace();
    this.charRoot.position.set(this.charPos.x, this.feetY(), this.charPos.z);
    this.setCamHome();
    this.clipCache.clear();
    this.ev.onVrmStatus("Loaded " + name);
    this.ev.onCaption(name + " ready.");
    this.activeEmote = "idle";
    // entrance pop
    v.scene.scale.setScalar(0.01);
    void this.preloadAnimations(() => {});
  }

  loadVRMBlob(file: File) {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = URL.createObjectURL(file);
    this.ev.onVrmStatus("Loading " + file.name + "…");
    this.gltfLoader.load(
      this.blobUrl,
      (g) => {
        const v = (g.userData as { vrm?: VRM }).vrm;
        if (v) this.onVRMLoaded(v, file.name);
        else this.ev.onVrmStatus("No VRM found.");
      },
      undefined,
      (e) => {
        console.error(e);
        this.ev.onVrmStatus("Failed.");
      },
    );
  }

  loadVRMURL(url: string, name: string) {
    this.ev.onVrmStatus("Loading " + name + "…");
    this.gltfLoader.load(
      url,
      (g) => {
        const v = (g.userData as { vrm?: VRM }).vrm;
        if (v) this.onVRMLoaded(v, name);
        else this.ev.onVrmStatus("No VRM found.");
      },
      undefined,
      (e) => {
        console.error(e);
        this.ev.onVrmStatus("Failed.");
      },
    );
  }

  private disposeVRM(root: THREE.Object3D) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mats = [mesh.material].flat() as THREE.Material[];
      for (const m of mats) {
        if (!m) continue;
        for (const v of Object.values(m)) {
          const t = v as THREE.Texture | undefined;
          if (t?.isTexture) t.dispose?.();
        }
        m.dispose?.();
      }
    });
  }

  async fetchServerAssets() {
    try {
      const r = await fetch("/api/animations");
      if (r.ok) this.ev.onAnims((await r.json()) as { name: string; url: string }[]);
    } catch { /* offline */ }
    try {
      const r = await fetch("/api/models");
      if (r.ok) this.ev.onModels((await r.json()) as { name: string; url: string }[]);
    } catch { /* offline */ }
  }

  // ── per-frame ──────────────────────────────────────────────────────────
  private envelopeLevel(now: number): number {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (now >= c.start - LOOKAHEAD && now <= c.end) return c.level;
    }
    return 0;
  }

  private resetLip() {
    this.mouthDrive = 0;
    this.setExpr("aa", 0);
    this.setExpr("ou", 0);
    this.setExpr("ih", 0);
    this.setExpr("ee", 0);
    this.ev.onAmp(0);
  }

  /**
   * Jaw follows true loudness: RMS envelope, silence gate, syllable-rate
   * flutter, capped range — flaps like speech instead of hanging open.
   * Driven by the shared analyser, so live TTS chunks and static SFX
   * both move the mouth through this one path.
   */
  private updateLipSync() {
    const voicing = this.speaking || this.sfxSpeaking;
    let target = 0;
    if (voicing && this.analyser && this.timeBuf) {
      this.analyser.getByteTimeDomainData(this.timeBuf);
      let sum = 0;
      for (let i = 0; i < this.timeBuf.length; i++) {
        const v = (this.timeBuf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.timeBuf.length);
      // speech RMS lives ~0.02–0.3; gate the floor, compress the rest
      const gated = Math.max(0, rms - 0.02);
      target = Math.pow(Math.min(1, gated / 0.18), 0.7);
    } else if (voicing) {
      target = THREE.MathUtils.clamp(0.1 + 0.45 * (0.5 + 0.5 * Math.sin((this.clock.elapsedTime + this.mouthSeed) * 13)), 0, 1);
    }
    // fast attack (jaw snaps open), slow release (eases shut)
    const f = target > this.mouthDrive ? 0.6 : 0.22;
    this.mouthDrive += (target - this.mouthDrive) * f;
    if (!voicing && this.mouthDrive < 0.01) {
      this.resetLip();
      return;
    }
    // syllabic flutter so the jaw opens/closes per syllable
    const t = this.clock.elapsedTime;
    const flap = 0.55 + 0.45 * Math.sin(t * 2 * Math.PI * 5.5 + this.mouthSeed);
    const jaw = Math.min(0.8, this.mouthDrive * flap * 0.9 + this.mouthDrive * 0.15);
    this.setExpr("aa", Math.max(0, jaw));
    this.setExpr("ou", Math.max(0, jaw * 0.25));
    this.setExpr("ih", Math.max(0, jaw * 0.12));
    this.setExpr("ee", Math.max(0, jaw * 0.07));
    this.ev.onAmp(Math.round(Math.min(1, this.mouthDrive) * 100));
  }

  private updateBlink(dt: number) {
    if (!this.autoBlink) return;
    this.blinkH += dt;
    const b = Math.sin(this.blinkH * 1.8) > 0.995 ? 1 : 0;
    this.blinkV = THREE.MathUtils.lerp(this.blinkV, b, 0.22);
    this.setExpr("blinkLeft", this.blinkV);
    this.setExpr("blinkRight", this.blinkV);
  }

  private tick = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    // entrance scale pop (+ landing-squash recovery after a boop)
    if (this.vrm) {
      const sc = this.vrm.scene.scale;
      if (sc.x < 1) {
        sc.setScalar(Math.min(1, sc.x + dt * 2.2));
      } else if (sc.y < sc.x * 0.999) {
        sc.y += (sc.x - sc.y) * Math.min(1, dt * 10);
      }
    }

    // scroll pose easing + stroll + dodge decay + hop offset
    this.walkAmt += (this.walkTarget - this.walkAmt) * Math.min(1, dt * 6);
    if (this.walkAmt < 0.002) this.walkAmt = 0;
    this.nudgeX *= Math.max(0, 1 - dt * 1.8);
    {
      const k = 1 - Math.exp(-dt * 5);
      this.depth += (this.targetDepth - this.depth) * k;
      const ds = 1 + this.depth * 0.45;
      this.charRoot.scale.setScalar(ds);
      if (this.vrm && this.charRoot.scale.y < ds * 0.999 && !this.hopping && this.walkAmt <= 0.01) {
        const s = this.charRoot.scale;
        s.y += (ds - s.y) * Math.min(1, dt * 10);
      }
      const targetX = this.charPos.x + this.targetX + this.nudgeX;
      this.charRoot.position.x += (targetX - this.charRoot.position.x) * k;
      let dr = this.targetRotY - this.charRoot.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      this.charRoot.rotation.y += dr * k;
      this.charRoot.position.z = this.charPos.z;
    }
    if (this.hopping) {
      this.vy -= 9.5 * dt;
      this.hopY += this.vy * dt;
      if (this.hopY <= 0) {
        this.hopY = 0;
        this.hopping = false;
        this.vy = 0;
        if (this.vrm) this.vrm.scene.scale.y *= 0.88; // landing squash
      }
    }
    if (this.vrm) {
      let y = this.feetY() + this.hopY;
      if (!this.hopping && this.walkAmt > 0.01) {
        y += Math.abs(Math.sin(t * 7)) * 0.035 * this.walkAmt;
        this.charRoot.rotation.z = Math.sin(t * 7) * 0.02 * this.walkAmt;
        this.charRoot.rotation.x = 0.07 * this.walkAmt;
      } else if (!this.hopping) {
        const k = 1 - Math.exp(-dt * 5);
        this.charRoot.rotation.z *= 1 - k;
        this.charRoot.rotation.x *= 1 - k;
      }
      this.charRoot.position.y = y;
    }

    // flash decay + framing ease (target tracks her, distance eases)
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.rim) this.rim.intensity = 1.1 + this.flash * 3;
    {
      const preset = FRAMING_PRESETS[this.framingAuto ?? this.framing];
      const baseY = this.feetY() + this.charPos.y;
      const ck = Math.min(1, dt * 2.5);
      if (this.vrm) {
        this.controls.target.x += (this.charRoot.position.x - this.controls.target.x) * ck;
        this.controls.target.y += (baseY + preset.ty - this.controls.target.y) * ck;
      }
      const dir = this.camera.position.clone().sub(this.controls.target);
      const len = Math.max(0.001, dir.length());
      dir.multiplyScalar(1 / len);
      const wantDist = Math.max(1.4, preset.dist - this.depth * 0.9 - Math.min(1, this.flash) * 0.35);
      this.camera.position.lerp(this.controls.target.clone().addScaledVector(dir, wantDist), ck);
    }

    this.controls.update();
    if (this.vrm) {
      if (this.mixer) this.mixer.update(dt);
      // Head/neck clip tracks are stripped in the retarget, so no clip writes
      // these bones — reset to neutral or the additive gaze below accumulates
      // every frame and the head spins. (Emotes overwrite absolutely after this.)
      const hd0 = this.getBone("head"), nk0 = this.getBone("neck");
      if (hd0) hd0.rotation.set(0, 0, 0);
      if (nk0) nk0.rotation.set(0, 0, 0);
      if (this.fbxPlaying) {
        if (this.autoIdle && t > this.idleCycleAt) this.startIdleLoop();
      } else if (this.activeEmote) {
        const fn = EMOTE_MAP[this.activeEmote];
        // breathing base only for idle; emotes own the pose
        if (this.activeEmote === "idle") {
          const { baseIdle } = require_emote_helpers();
          baseIdle(this.getBone, t);
        }
        (fn ?? EMOTE_MAP.idle)(this.getBone, t);
      }
      // stroll arm swing — small additive layer on top of any clip,
      // so she swings her arms even while the Idle FBX loops
      if (this.walkAmt > 0.3 && !this.hopping) {
        const sw = Math.sin(t * 7) * 0.28 * this.walkAmt;
        const lU = this.getBone("leftUpperArm");
        const rU = this.getBone("rightUpperArm");
        if (lU) lU.rotation.x += sw;
        if (rU) rU.rotation.x -= sw;
      }
      // gaze tracking — additive head/neck offset applied AFTER the mixer,
      // so she follows the cursor even while a clip is playing.
      this.lookX += (this.lookNX - this.lookX) * Math.min(1, dt * 4);
      this.lookY += (this.lookNY - this.lookY) * Math.min(1, dt * 4);
      try {
        const hd = this.vrm.humanoid.getNormalizedBoneNode("head" as never) as unknown as THREE.Object3D | null;
        const nk = this.vrm.humanoid.getNormalizedBoneNode("neck" as never) as unknown as THREE.Object3D | null;
        if (hd) {
          hd.rotation.y += this.lookX * 0.45;
          hd.rotation.x -= this.lookNY * 0.28; // +lookNY = cursor up
        }
        if (nk) {
          nk.rotation.y += this.lookX * 0.2;
          nk.rotation.x -= this.lookNY * 0.12;
        }
      } catch { /* humanoid not ready */ }
      this.updateLipSync();
      this.updateBlink(dt);
      this.vrm.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
    // mascot screen pos for DOM proximity (every 3rd frame is plenty)
    this.mascotFrame++;
    if (this.mascotFrame % 3 === 0 && this.vrm) {
      const p = this.mascotScreen();
      this.ev.onMascotScreen?.(p.x, p.y, this.charRoot.scale.x);
    }
  };

  setAutoBlink(v: boolean) {
    this.autoBlink = v;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.socket?.disconnect();
    this.stopStatic();
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.renderer.dispose();
    // Remove only our own canvas — never nuke the wrapper, it may hold React DOM.
    this.renderer.domElement.remove();
  }
}

// baseIdle imported lazily to avoid a circular import edge in some bundlers.
import { baseIdle } from "@/lib/three/emotes";
function require_emote_helpers() {
  return { baseIdle };
}
