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
  onCharPos: (p: CharPos) => void;
  onSofa: (s: string) => void;
  onMessage: (role: "user" | "bot" | "sys", text: string) => void;
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
  private nextStart = 0;
  private speaking = false;
  private synthActive = false;
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

  charPos: CharPos = { x: 1.35, y: 0, z: 1.0, lift: 0.02 };
  // Living-floor height auto-detected from the sofa base (world Y).
  // Character feet sit at groundY + lift. Falls back to 0 (void) if no sofa found.
  groundY = 0;
  private gltfLoader = new GLTFLoader();
  // Dedicated plugin-free loader for the loft interior. The shared loader has
  // VRMLoaderPlugin registered (needed for VRM); it must not touch plain GLBs.
  private bgLoader = new GLTFLoader();
  private bgRetried = false;
  private blobUrl: string | null = null;

  constructor(wrap: HTMLElement, ev: EngineEvents) {
    this.wrap = wrap;
    this.ev = ev;
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 1.45, 3);
    this.gltfLoader.register((p) => new VRMLoaderPlugin(p));
    this.initScene();
    this.loadBackground();
    this.tick();
  }

  // ── scene ──────────────────────────────────────────────────────────────
  private initScene() {
    this.scene.background = new THREE.Color(0x08090f);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.wrap.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1.35, 0);
    this.controls.update();
    this.scene.add(new THREE.HemisphereLight(0xffe8cc, 0x1a1008, 0.65));
    const kl = new THREE.DirectionalLight(0xfff5e0, 2.0);
    kl.position.set(2, 4, 3);
    kl.castShadow = true;
    kl.shadow.mapSize.set(1024, 1024);
    this.scene.add(kl);
    const fl = new THREE.DirectionalLight(0xd0c8ff, 0.5);
    fl.position.set(-2, 2, 2);
    this.scene.add(fl);
    const rl = new THREE.DirectionalLight(0xffcf80, 0.45);
    rl.position.set(0, 3, -2);
    this.scene.add(rl);
    this.resize();
  }

  resize() {
    const w = this.wrap.clientWidth || 1;
    const h = this.wrap.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private loadBackground() {
    const URL = "/background/loft_5_interior_for_free.glb";
    this.ev.onStageStatus("Loading room…");
    this.bgLoader.load(
      URL,
      ({ scene: bg }) => {
        const box = new THREE.Box3().setFromObject(bg);
        const sz = box.getSize(new THREE.Vector3());
        const ctr = box.getCenter(new THREE.Vector3());
        let s = 4.0 / sz.y;
        if (!isFinite(s) || s <= 0) {
          console.warn("[BG] degenerate bounds, falling back to scale 1:", sz);
          this.ev.onStageStatus("Room has bad bounds — shown unscaled.");
          s = 1;
        }
        bg.scale.setScalar(s);
        bg.position.set(-ctr.x * s, -box.min.y * s, -ctr.z * s);
        bg.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            (o as THREE.Mesh).receiveShadow = true;
            const m = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (m) m.depthWrite = true;
          }
        });
        this.scene.add(bg);
        this.scene.background = null;
        this.ev.onStageStatus(
          `Room ready (${sz.x.toFixed(1)}×${sz.y.toFixed(1)}×${sz.z.toFixed(1)} m)`,
        );
        const SOFA_RE = /sofa|couch|settee|divan|loveseat|sectional/i;
        let sofa: THREE.Object3D | null = null;
        bg.traverse((o) => {
          if (!sofa && (o as THREE.Mesh).isMesh && SOFA_RE.test(o.name)) sofa = o;
        });
        if (sofa) {
          const sb = new THREE.Box3().setFromObject(sofa);
          const sc = sb.getCenter(new THREE.Vector3());
          // The sofa rests ON the living floor — its base is the floor height.
          // This is what lifts her out of the void under the room.
          this.groundY = sb.min.y;
          this.ev.onStageStatus(`Floor at +${this.groundY.toFixed(2)} m (sofa base)`);
          this.setCharPos(sc.x, this.charPos.y, sb.max.z + 0.5, this.charPos.lift, true);
        } else {
          this.ev.onSofa("(use sliders)");
        }
      },
      (xhr) => {
        if (xhr.total) this.ev.onStageStatus(`Loading room… ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
      },
      (e) => {
        console.error("[BG] failed:", e);
        if (!this.bgRetried) {
          this.bgRetried = true;
          this.ev.onStageStatus("Room load failed — retrying…");
          setTimeout(() => this.loadBackground(), 3000);
        } else {
          this.ev.onStageStatus(`Room failed to load: ${e instanceof Error ? e.message : "unknown error"}`);
          this.ev.onCaption("3D room failed to load — check console ([BG]). Character and chat still work.");
        }
      },
    );
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
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
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
    this.ev.onChatState("");
    this.startIdleLoop();
  }

  stopSpeaking() {
    this.socket?.emit("cancel");
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
    this.ev.onAmp(0);
    this.mouthDrive = 0;
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

  async sendChat(msg: string, history: { role: "user" | "assistant"; content: string }[], animUrlByName: Map<string, string>, voice: string, speed: number) {
    const text = msg.trim();
    if (!text) return;
    this.ev.onMessage("user", text);
    this.playThinking();
    try {
      const { postChat } = await import("@/lib/chat/api");
      const preset = await postChat(text, history);
      this.ev.onMessage("bot", preset.text);
      await this.performPreset(preset, animUrlByName, voice, speed);
    } catch (e) {
      console.error(e);
      this.ev.onMessage("sys", "Error: " + (e as Error).message);
      this.phase = "idle";
      this.ev.onChatState("");
      this.playEmote("idle");
      this.startIdleLoop();
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
    this.ev.onAnimStatus("> " + name);
    this.ev.onNowPlaying(name);
  }

  stopAnimation() {
    this.staged = null;
    this.autoIdle = false;
    this.idleCycleAt = Infinity;
    this.phase = "idle";
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
    this.idleCycleAt = this.clock.elapsedTime + (18 + Math.random() * 12);
  }

  // ── position / camera ──────────────────────────────────────────────────
  /** World Y of her feet: detected living floor + manual lift trim. */
  feetY() {
    return this.groundY + this.charPos.lift;
  }

  setCharPos(x: number, y: number, z: number, lift = this.charPos.lift, fromAuto = false) {
    this.charPos = { x, y, z, lift };
    if (fromAuto) this.ev.onSofa("✓ sofa detected");
    this.ev.onCharPos({ ...this.charPos });
    this.applyCharPos();
  }

  applyCharPos() {
    if (!this.vrm) return;
    const f = this.feetY();
    this.vrm.scene.position.set(this.charPos.x, f, this.charPos.z);
    this.controls.target.set(this.charPos.x, f + this.charPos.y + 1.35, this.charPos.z);
    this.controls.update();
  }

  setCamHome() {
    const f = this.feetY();
    // Closer interior framing: ~2.2 m back at eye level.
    this.camera.position.set(this.charPos.x, f + this.charPos.y + 1.45, this.charPos.z + 2.2);
    this.controls.target.set(this.charPos.x, f + this.charPos.y + 1.35, this.charPos.z);
    this.controls.update();
  }

  // ── VRM ────────────────────────────────────────────────────────────────
  private onVRMLoaded(v: VRM, name: string) {
    if (this.vrm?.scene) {
      this.scene.remove(this.vrm.scene);
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
    this.scene.add(v.scene);
    v.scene.position.set(this.charPos.x, this.feetY(), this.charPos.z);
    v.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
      }
    });
    this.resetFace();
    this.setCamHome();
    this.clipCache.clear();
    this.ev.onVrmStatus("Loaded " + name);
    this.ev.onCaption(name + " ready.");
    this.activeEmote = "idle";
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

  private updateLipSync() {
    let target = 0;
    if (this.speaking && this.ttsConnected && this.audioCtx) {
      // Scheduled-envelope driver: mouth opens exactly with audible sound.
      target = this.envelopeLevel(this.audioCtx.currentTime);
      const pct = Math.min(99, Math.round(target * 100));
      this.ev.onAmp(pct);
    } else if (this.speaking) {
      target = THREE.MathUtils.clamp(0.1 + 0.45 * (0.5 + 0.5 * Math.sin((this.clock.elapsedTime + this.mouthSeed) * 13)), 0, 1);
    }
    this.mouthDrive = THREE.MathUtils.lerp(this.mouthDrive, target, 0.35);
    this.setExpr("aa", this.mouthDrive * 0.9);
    this.setExpr("ih", this.mouthDrive * 0.22);
    this.setExpr("ou", this.mouthDrive * 0.15);
    this.setExpr("ee", this.mouthDrive * 0.07);
    if (!this.speaking) this.ev.onAmp(0);
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
    this.controls.update();
    if (this.vrm) {
      if (this.mixer) this.mixer.update(dt);
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
      this.updateLipSync();
      this.updateBlink(dt);
      this.vrm.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  setAutoBlink(v: boolean) {
    this.autoBlink = v;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.socket?.disconnect();
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
