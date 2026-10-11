"use client";

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { loadMixamoAnimation } from "@/lib/three/retarget";
import { EMOTE_MAP, baseIdle, type EmoteId } from "@/lib/three/emotes";

export type Framing = "closeup" | "mid" | "full";

// Same idle-clip matcher as the main frontend (StageEngine).
const IDLE_PATTERNS = [/idle/i, /standing.*idle/i, /stand.*neutral/i, /breathing/i, /waiting/i];

const FRAMING_PRESETS: Record<Framing, { dist: number; ty: number }> = {
  closeup: { dist: 1.9, ty: 1.42 },
  mid: { dist: 2.7, ty: 1.22 },
  full: { dist: 3.4, ty: 1.0 },
};

export type LandingEvents = {
  onCaption: (t: string) => void;
  onAmp: (pct: number) => void;
  onModels: (l: { name: string; url: string }[]) => void;
  onAnims: (l: { name: string; url: string }[]) => void;
  onStatus: (s: string) => void;
  onNowPlaying: (n: string | null) => void;
  onSpeaking: (b: boolean) => void;
  onMascotScreen?: (x: number, y: number, scale: number) => void;
};

/**
 * LandingEngine — slim fork of StageEngine for the static landing demo.
 * No Socket.IO / no Gemini. Audio = static <audio> files + AnalyserNode lip-sync.
 * Adds scroll-driven stage pose (walk the page, 4th-wall gags).
 */
export class LandingEngine {
  private wrap: HTMLElement;
  private ev: LandingEvents;
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
  private emote: EmoteId = "idle";
  // Animation state machine — ported from the main frontend:
  // an FBX clip OR a procedural emote drives the bones, never both.
  private fbxPlaying = false;
  private autoIdle = false;
  private idleCycleAt = Infinity;
  private autoBlink = true;
  private blinkT = 0;
  loopAnimation = true;

  // audio (static files)
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private timeBuf: Uint8Array<ArrayBuffer> | null = null;
  private speaking = false;
  private mouth = 0;
  private mouthSeed = Math.random() * 1000;

  // scroll pose
  private targetX = 0;
  private targetRotY = 0;
  private targetDepth = 0; // 0 back on stage → 1 right up at the glass
  private depth = 0;
  private nudgeX = 0; // dodge impulse, decays in tick
  private walkAmt = 0; // 0 idle → 1 walking (eased toward walkTarget)
  private walkTarget = 0;
  private flash = 0;
  private rim: THREE.DirectionalLight | null = null;
  // gaze + boop
  private lookNX = 0;
  private lookNY = 0;
  private lookX = 0;
  private lookY = 0;
  private vy = 0;
  private hopping = false;
  private frame = 0;
  // camera framing: chapter default + temporary clip override (auto pull-back)
  private framing: Framing = "closeup";
  private framingAuto: Framing | null = null;

  private gltfLoader = new GLTFLoader();
  charRoot = new THREE.Group();

  constructor(wrap: HTMLElement, ev: LandingEvents) {
    this.wrap = wrap;
    this.ev = ev;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 1.55, 1.9); // giant close-up default
    this.gltfLoader.register((p) => new VRMLoaderPlugin(p));
    this.initScene();
    this.tick();
  }

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
    this.controls.maxDistance = 6;
    this.controls.target.set(0, 1.42, 0);
    this.controls.update();

    this.scene.add(new THREE.HemisphereLight(0xffe8ff, 0x14092b, 0.9));
    const key = new THREE.DirectionalLight(0xfff1de, 2.2);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc4b5fd, 0.7);
    fill.position.set(-2.5, 2, 2);
    this.scene.add(fill);
    this.rim = new THREE.DirectionalLight(0x22d3ee, 1.1);
    this.rim.position.set(0, 3, -2.5);
    this.scene.add(this.rim);

    // stylized disc stage + glow ring
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

  async fetchAssets() {
    try {
      const [m, a] = await Promise.all([
        fetch("/api/models").then((r) => r.json()),
        fetch("/api/animations").then((r) => r.json()),
      ]);
      this.ev.onModels(m ?? []);
      this.ev.onAnims(a ?? []);
    } catch {
      this.ev.onStatus("Asset list failed");
    }
  }

  async loadVRMURL(url: string, name: string) {
    this.ev.onStatus(`Loading ${name}…`);
    try {
      const gltf = await this.gltfLoader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM;
      if (!vrm) throw new Error("Not a VRM");
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      vrm.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).castShadow = true;
          (o as THREE.Mesh).frustumCulled = false;
        }
      });
      if (this.vrm) {
        this.charRoot.remove(this.vrm.scene);
        VRMUtils.deepDispose(this.vrm.scene);
      }
      this.vrm = vrm;
      this.mixer = new THREE.AnimationMixer(vrm.scene);
      this.activeAction = null;
      this.fbxPlaying = false;
      this.autoIdle = false;
      this.idleCycleAt = Infinity;
      // Single PI flip (same as main frontend) — charRoot stays at 0 so she faces the camera.
      vrm.scene.rotation.y = Math.PI;
      this.charRoot.add(vrm.scene);
      this.charRoot.rotation.y = 0;
      this.charRoot.position.x = 0;
      this.resetFace();
      this.emote = "idle";
      this.clipCache.clear();
      this.ev.onStatus(`${name} ready`);
      this.ev.onCaption("Model loaded — try Say Hi, Dance, or Who is Rahim?");
      // entrance pop
      vrm.scene.scale.setScalar(0.01);
      // Preload all FBX clips, then loop Idle by default (main-frontend behavior).
      void this.preloadAnimations();
    } catch (e) {
      this.ev.onStatus(`VRM failed: ${(e as Error).message}`);
    }
  }

  async playAnimation(url: string, name: string, loop?: boolean) {
    if (!this.vrm || !this.mixer) return;
    const doLoop = loop ?? this.loopAnimation;
    try {
      let clip = this.clipCache.get(name) ?? this.clipCache.get(url);
      if (!clip) {
        this.ev.onNowPlaying(`Loading ${name}…`);
        clip = await loadMixamoAnimation(url, this.vrm);
        this.clipCache.set(name, clip);
        this.clipCache.set(url, clip);
      }
      this.activateAction(this.mixer.clipAction(clip), name, doLoop);
    } catch (e) {
      this.ev.onNowPlaying(null);
      this.ev.onStatus(`Anim failed: ${(e as Error).message}`);
    }
  }

  /** Crossfade onto a clip — mirrors StageEngine.activateAction. Emote is
   *  neutralised while the FBX drives so the two never fight over bones. */
  private activateAction(action: THREE.AnimationAction, name: string, doLoop: boolean) {
    if (!this.mixer) return;
    this.autoIdle = false;
    this.idleCycleAt = Infinity;
    action.setLoop(doLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !doLoop;
    if (this.activeAction && this.activeAction !== action) {
      action.reset();
      action.crossFadeFrom(this.activeAction, 0.3, true);
    } else action.reset();
    action.play();
    this.activeAction = action;
    this.fbxPlaying = true;
    this.emote = "idle";
    // auto pull-back: full-body stage for performances, chapter framing for idles
    this.framingAuto = IDLE_PATTERNS.some((p) => p.test(name)) ? null : "full";
    this.ev.onNowPlaying(name);
    if (!doLoop) {
      const done = (e: { action: THREE.AnimationAction }) => {
        if (e.action === action) {
          this.mixer?.removeEventListener("finished", done as never);
          if (this.activeAction === action) {
            this.activeAction = null;
            this.fbxPlaying = false;
            this.ev.onNowPlaying(null);
            setTimeout(() => this.startIdleLoop(), 400);
          }
        }
      };
      this.mixer.removeEventListener("finished", done as never);
      this.mixer.addEventListener("finished", done as never);
    }
  }

  stopAnimation() {
    this.activeAction?.fadeOut(0.3);
    const cur = this.activeAction;
    setTimeout(() => cur?.stop(), 350);
    this.activeAction = null;
    this.fbxPlaying = false;
    this.autoIdle = false;
    this.idleCycleAt = Infinity;
    this.emote = "idle";
    this.framingAuto = null; // back to chapter framing
    this.ev.onNowPlaying(null);
    setTimeout(() => this.startIdleLoop(), 400);
  }

  /** Procedural emote — stops any FBX first (main-frontend parity:
   *  animation OR emote, never both). */
  playEmote(id: EmoteId) {
    this.emote = id;
    this.autoIdle = false;
    this.idleCycleAt = Infinity;
    this.framingAuto = null;
    if (this.fbxPlaying) {
      this.activeAction?.fadeOut(0.3);
      const cur = this.activeAction;
      setTimeout(() => cur?.stop(), 350);
      this.activeAction = null;
      this.fbxPlaying = false;
      this.ev.onNowPlaying(null);
    }
  }

  // ── idle machinery (ported from StageEngine) ──────────────────────────
  private idleNames(): string[] {
    return [...this.clipCache.keys()]
      .filter((k) => !k.startsWith("http") && !k.startsWith("/") && !k.includes("\\"))
      .filter((n) => IDLE_PATTERNS.some((p) => p.test(n)));
  }

  /** Preload every FBX once, then start the Idle loop — page opens mid-motion. */
  async preloadAnimations() {
    if (!this.vrm) return;
    try {
      const r = await fetch("/api/animations");
      if (!r.ok) return;
      const list = (await r.json()) as { name: string; url: string }[];
      if (!list.length) return;
      this.ev.onStatus(`Loading animations…`);
      let done = 0;
      await Promise.allSettled(
        list.map(async (a) => {
          const name = a.name.replace(/\.fbx$/i, "");
          try {
            const clip = await loadMixamoAnimation(a.url, this.vrm!);
            this.clipCache.set(name, clip);
            this.clipCache.set(a.url, clip);
            done++;
          } catch (e) {
            console.warn("Preload fail:", name, (e as Error).message);
          }
        }),
      );
      this.ev.onStatus(`${done} animations ready`);
      setTimeout(() => this.startIdleLoop(), 400);
    } catch {
      /* asset list failed — procedural idle breathing still runs */
    }
  }

  /** Loop a random idle-pattern clip, re-cycling every 18–30 s. */
  startIdleLoop() {
    if (!this.vrm) return;
    if (this.fbxPlaying && !this.autoIdle) return;
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
    this.emote = "idle";
    this.framingAuto = null; // idle always plays in chapter framing
    this.ev.onNowPlaying(name);
    this.idleCycleAt = this.clock.elapsedTime + (18 + Math.random() * 12);
  }

  setExpr(name: string, v: number) {
    const m = this.vrm?.expressionManager as unknown as
      | { setValue?: (n: string, v: number) => void }
      | undefined;
    try {
      m?.setValue?.(name, v);
    } catch { /* noop */ }
  }

  resetFace() {
    ["aa", "ih", "ou", "ee", "oh", "blinkLeft", "blinkRight", "happy", "angry", "sad", "relaxed", "surprised"].forEach((n) => this.setExpr(n, 0));
    this.mouth = 0;
  }

  /** Button-press juice: rim flash (camera pull is handled by framing). */
  juice(color = 0x22d3ee) {
    this.flash = 1;
    if (this.rim) this.rim.color.setHex(color);
  }

  /** Scroll director pose. x in world units, rotY radians, walking 0..1, depth 0..1. */
  setStagePose(x: number, rotY: number, walking: number, depth = 0) {
    this.targetX = x;
    this.targetRotY = rotY;
    this.walkTarget = walking > 0.5 ? 1 : 0;
    this.targetDepth = Math.max(0, Math.min(1, depth));
  }

  isSpeaking() {
    return this.speaking;
  }

  isWalking() {
    return this.walkTarget > 0.5 || this.walkAmt > 0.4;
  }

  /** Dodge sidestep impulse (decays over ~1s). dir: -1 left, +1 right. */
  nudge(dir: number) {
    this.nudgeX = Math.max(-1.4, Math.min(1.4, this.nudgeX + dir * 0.9));
  }

  /** Chapter-level framing default (hero close-up, playground full…). */
  setFraming(f: Framing) {
    this.framing = f;
  }

  private effectiveFraming(): Framing {
    return this.framingAuto ?? this.framing;
  }

  /** Cursor gaze target in normalized -1..1 space. */
  setLook(nx: number, ny: number) {
    this.lookNX = Math.max(-1, Math.min(1, nx));
    this.lookNY = Math.max(-1, Math.min(1, ny));
  }

  /** Boop: hop impulse with gravity. Returns false if already airborne. */
  boop(): boolean {
    if (this.hopping || !this.vrm) return false;
    this.hopping = true;
    this.vy = 2.6;
    this.juice();
    return true;
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

  /** Static audio playback with lip-sync. Resolves when done. */
  async speak(url: string): Promise<void> {
    this.stopSpeaking(false);
    return new Promise((resolve) => {
      const el = new Audio(url);
      el.preload = "auto";
      this.audioEl = el;
      try {
        if (!this.audioCtx) {
          this.audioCtx = new AudioContext();
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = 2048; // ~43ms RMS window @48kHz — stable loudness
          this.analyser.smoothingTimeConstant = 0.4;
          this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
          this.timeBuf = new Uint8Array(this.analyser.fftSize);
          this.analyser.connect(this.audioCtx.destination);
        }
        if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
        const src = this.audioCtx.createMediaElementSource(el);
        src.connect(this.analyser!);
      } catch { /* analyser optional */ }
      this.speaking = true;
      this.ev.onSpeaking(true);
      el.onended = () => {
        this.speaking = false;
        this.ev.onSpeaking(false);
        this.resetLip();
        resolve();
      };
      el.onerror = () => {
        // Missing static file → fallback: just resolve after caption dwell.
        this.speaking = false;
        this.ev.onSpeaking(false);
        setTimeout(resolve, 1800);
      };
      void el.play().catch(() => setTimeout(resolve, 1800));
    });
  }

  stopSpeaking(resetExpr = true) {
    try {
      this.audioEl?.pause();
    } catch { /* noop */ }
    this.audioEl = null;
    this.speaking = false;
    this.ev.onSpeaking(false);
    if (resetExpr) this.resetLip();
    else this.ev.onAmp(0);
  }

  private resetLip() {
    this.mouth = 0;
    this.setExpr("aa", 0);
    this.setExpr("ou", 0);
    this.setExpr("ih", 0);
    this.ev.onAmp(0);
  }

  /** Jaw follows true loudness: RMS envelope, silence gate, syllable-rate
   *  flutter, capped range — flaps like speech instead of hanging open. */
  private updateLipSync(t: number) {
    let target = 0;
    if (this.speaking && this.analyser && this.timeBuf) {
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
    } else if (this.speaking) {
      // fallback flap when analyser unavailable (e.g. missing file)
      target = 0.1 + 0.45 * (0.5 + 0.5 * Math.sin(t * 13 + this.mouthSeed));
    }
    // fast attack (jaw snaps open), slow release (eases shut)
    const f = target > this.mouth ? 0.6 : 0.22;
    this.mouth += (target - this.mouth) * f;
    if (!this.speaking && this.mouth < 0.01) {
      this.resetLip();
      return;
    }
    // syllabic flutter so the jaw opens/closes per syllable
    const flap = 0.55 + 0.45 * Math.sin(t * 2 * Math.PI * 5.5 + this.mouthSeed);
    const jaw = Math.min(0.8, this.mouth * flap * 0.9 + this.mouth * 0.15);
    this.setExpr("aa", Math.max(0, jaw));
    this.setExpr("ou", Math.max(0, jaw * 0.25));
    this.setExpr("ih", Math.max(0, jaw * 0.12));
    this.ev.onAmp(Math.round(Math.min(1, this.mouth) * 100));
  }

  private getBone = (name: string): THREE.Object3D | null => {
    try {
      return (this.vrm?.humanoid.getNormalizedBoneNode(name as never) as unknown as THREE.Object3D) ?? null;
    } catch {
      return null;
    }
  };

  private tick = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // entrance scale pop
    if (this.vrm) {
      const s = this.vrm.scene.scale.x;
      if (s < 1) this.vrm.scene.scale.setScalar(Math.min(1, s + dt * 2.2));
    }

    // scroll pose easing + stroll (walk amount eases — no snapping)
    const k = 1 - Math.exp(-dt * 5);
    this.walkAmt += (this.walkTarget - this.walkAmt) * Math.min(1, dt * 6);
    if (this.walkAmt < 0.002) this.walkAmt = 0;
    this.nudgeX *= Math.max(0, 1 - dt * 1.8);
    this.charRoot.position.x += (this.targetX + this.nudgeX - this.charRoot.position.x) * k;
    // charRoot base is 0 (vrm.scene already carries the single PI flip) —
    // targetRotY is a relative turn, e.g. ±0.5 from the scroll director.
    const targetRot = this.targetRotY;
    let dr = targetRot - this.charRoot.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    this.charRoot.rotation.y += dr * k;
    // depth: glide toward the glass + grow (coming-forward moment)
    this.depth += (this.targetDepth - this.depth) * k;
    const ds = 1 + this.depth * 0.45;
    this.charRoot.scale.setScalar(ds);
    if (!this.hopping && this.walkAmt > 0.01) {
      // easy stroll: soft low bob, gentle sway, slight forward lean
      // (hop physics below takes priority when both are active)
      this.charRoot.position.y = Math.abs(Math.sin(t * 7)) * 0.035 * this.walkAmt;
      this.charRoot.rotation.z = Math.sin(t * 7) * 0.02 * this.walkAmt;
      this.charRoot.rotation.x = 0.07 * this.walkAmt;
    } else if (!this.hopping) {
      this.charRoot.position.y += (0 - this.charRoot.position.y) * k;
      this.charRoot.rotation.z *= 1 - k;
      this.charRoot.rotation.x *= 1 - k;
    }
    // boop hop physics (gravity, land + squash)
    if (this.hopping) {
      this.vy -= 9.5 * dt;
      this.charRoot.position.y += this.vy * dt;
      if (this.charRoot.position.y <= 0) {
        this.charRoot.position.y = 0;
        this.hopping = false;
        this.vy = 0;
        this.charRoot.scale.set(ds, ds * 0.88, ds); // landing squash
      }
    } else if (this.charRoot.scale.y < ds * 0.999) {
      // recover from squash
      const s = this.charRoot.scale;
      s.y += (ds - s.y) * Math.min(1, dt * 10);
      s.x += (ds - s.x) * Math.min(1, dt * 10);
      s.z += (ds - s.z) * Math.min(1, dt * 10);
    }

    // flash decay + framing ease (target tracks her, distance eases;
    // depth + button flash pull the camera in with her)
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.rim) this.rim.intensity = 1.1 + this.flash * 3;
    const preset = FRAMING_PRESETS[this.effectiveFraming()];
    const wantDist = Math.max(1.4, preset.dist - this.depth * 0.9 - Math.min(1, this.flash) * 0.35);
    const ck = Math.min(1, dt * 2.5);
    this.controls.target.x += (this.charRoot.position.x - this.controls.target.x) * ck;
    this.controls.target.y += (preset.ty - this.controls.target.y) * ck;
    const dir = this.camera.position.clone().sub(this.controls.target);
    const len = Math.max(0.001, dir.length());
    dir.multiplyScalar(1 / len);
    const wantPos = this.controls.target.clone().addScaledVector(dir, wantDist);
    this.camera.position.lerp(wantPos, ck);

    // mixer + exclusive motion layer (main-frontend parity):
    // an FBX clip OR a procedural emote drives the bones — never both.
    this.mixer?.update(dt);
    // Head/neck clip tracks are stripped in the retarget, so no clip writes
    // these bones — reset to neutral or the additive gaze below accumulates
    // every frame and the head spins. (Emotes overwrite absolutely after this.)
    const hd0 = this.getBone("head"), nk0 = this.getBone("neck");
    if (hd0) hd0.rotation.set(0, 0, 0);
    if (nk0) nk0.rotation.set(0, 0, 0);
    if (this.vrm) {
      if (this.fbxPlaying) {
        if (this.autoIdle && t > this.idleCycleAt) this.startIdleLoop();
      } else if (this.walkAmt > 0.5 && !this.hopping) {
        // no clip driving: procedural stroll arms
        const sw = Math.sin(t * 7) * 0.5;
        const lU = this.getBone("leftUpperArm"), rU = this.getBone("rightUpperArm");
        if (lU) { lU.rotation.x = sw; lU.rotation.z = -0.25; }
        if (rU) { rU.rotation.x = -sw; rU.rotation.z = 0.25; }
      } else if (!this.hopping) {
        const fn = EMOTE_MAP[this.emote] ?? EMOTE_MAP.idle;
        // breathing base only for idle; emotes own the pose
        if (this.emote === "idle") baseIdle(this.getBone, t);
        fn(this.getBone, t);
      }
      // stroll arm swing — small additive layer on top of any clip,
      // so she swings her arms even while the Idle FBX loops
      if (this.walkAmt > 0.3 && !this.hopping) {
        const sw = Math.sin(t * 7) * 0.28 * this.walkAmt;
        const lU = this.getBone("leftUpperArm"), rU = this.getBone("rightUpperArm");
        if (lU) lU.rotation.x += sw;
        if (rU) rU.rotation.x -= sw;
      }
      // gaze tracking — additive head/neck offset applied AFTER the mixer,
      // so she follows the cursor even while a clip is playing.
      this.lookX += (this.lookNX - this.lookX) * Math.min(1, dt * 4);
      this.lookY += (this.lookNY - this.lookY) * Math.min(1, dt * 4);
      const hd = this.getBone("head"), nk = this.getBone("neck");
      if (hd) {
        hd.rotation.y += this.lookX * 0.45;
        hd.rotation.x -= this.lookNY * 0.28; // +lookNY = cursor up
      }
      if (nk) {
        nk.rotation.y += this.lookX * 0.2;
        nk.rotation.x -= this.lookNY * 0.12;
      }
      // blink
      if (this.autoBlink) {
        this.blinkT -= dt;
        if (this.blinkT <= -0.12) this.blinkT = 2 + Math.random() * 3;
        const b = this.blinkT < 0 ? 1 : 0;
        this.setExpr("blinkLeft", b);
        this.setExpr("blinkRight", b);
      }
      // lip-sync: RMS loudness envelope + syllabic flutter.
      // (Old code averaged spectrum bins and saturated at 1 on hot masters,
      //  pegging the jaw fully open. Time-domain RMS can't saturate that way.)
      this.updateLipSync(t);
      this.vrm.update(dt);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    // mascot screen pos for DOM proximity (every 3rd frame is plenty)
    this.frame++;
    if (this.frame % 3 === 0 && this.vrm) {
      const p = this.mascotScreen();
      this.ev.onMascotScreen?.(p.x, p.y, this.charRoot.scale.x);
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.stopSpeaking();
    this.controls?.dispose();
    this.renderer?.dispose();
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    this.wrap.innerHTML = "";
  }
}
