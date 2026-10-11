"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import Lenis from "lenis";
import { ArrowDown, Bot, Mic, Move3d, X } from "lucide-react";
import Stage, { type StageHandle } from "@/components/Stage";
import PillRemote from "@/components/PillRemote";
import EdgeLinks from "@/components/EdgeLinks";
import ScatterText from "@/components/ScatterText";
import ChatBubble, { type UIMessage } from "@/components/ChatBubble";
import type { ChatState, Framing } from "@/lib/stage/engine";
import { useMascotProximity, type MascotPoint, type TouchInfo } from "@/lib/mascot-proximity";
import { DebugPanel, InteractPanel, JulesPanel, StatusPanel } from "@/components/Panels";
import type { ChatMessage } from "@/lib/chat/api";
import { createJulesSession, deleteJulesSession, sendJulesMessage } from "@/lib/jules/api";
import { useJulesPoll } from "@/lib/jules/useJulesPoll";
import { loadSettings, saveSettings } from "@/lib/settings";
import {
  BOOP_LINES,
  DODGE_AUDIO,
  DODGE_LINE,
  PERSONAS,
  PRESET_PROMPTS,
  TOUCH_LINES,
  boopAudio,
  touchAudio,
  type PersonaId,
  type PresetKind,
} from "@/lib/persona";

const DEFAULT_TTS =
  process.env.NEXT_PUBLIC_TTS_URL ?? "http://127.0.0.1:5000";

type OverlayId = "about" | "debug" | null;

const ABILITY_CARDS = [
  { id: "card-knowledge", icon: Bot, t: "Knowledge-aware", d: "Chat with her — answers come from the live API with a keyword fallback.", preset: "rahim" as PresetKind },
  { id: "card-voice", icon: Mic, t: "Voice-first", d: "Kokoro TTS streams live 24kHz PCM with lip-sync and gestures.", preset: "dance" as PresetKind },
  { id: "card-stage", icon: Move3d, t: "Agentic stage", d: "VRM + Mixamo + emote state machine. She idles, thinks, performs.", preset: "wow" as PresetKind },
];

const HOW_ROWS: [string, string, string, PresetKind | "switch"][] = [
  ["how-1", "1 · Talk to her", "Mic is default — text hides behind the keyboard key until you open it.", "hi"],
  ["how-2", "2 · Switch hosts", "Aiko ↔ Yuki. Model, voice and greeting change together.", "switch"],
  ["how-3", "3 · Touch everything", "Bump widgets, boop her nose, swipe past her. She reacts.", "hiphop"],
];

const fadeUp = {
  initial: { opacity: 0, y: 36 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7 },
} as const;

// scroll director: zones → chapters, poses, framing (landing parity)
const ZONE_POSE: Record<string, { x: number; rot: number; depth: number }> = {
  hero: { x: 0, rot: 0, depth: 0 },
  walk: { x: -1.5, rot: 0.5, depth: 0 },
  forward: { x: 0, rot: 0, depth: 1 },
  walk2: { x: 1.5, rot: -0.5, depth: 0 },
  passthrough: { x: 0.3, rot: -0.2, depth: 0.6 },
  pull: { x: 0.4, rot: -0.2, depth: 0 },
  bye: { x: 0, rot: 0, depth: 0 },
};
const WALK_ZONES = new Set(["walk", "walk2", "passthrough"]);
const ZONE_CHAPTER: Record<string, number> = {
  hero: 0,
  walk: 1,
  forward: 1,
  walk2: 1,
  passthrough: 2,
  pull: 2,
  bye: 3,
};
const CHAPTER_FRAMING: Framing[] = ["closeup", "mid", "full", "closeup"];
const CHAPTER_NAMES = ["Meet the host", "What she does", "Playground", "Say hello"];
const SCROLL_GAGS = {
  walk: "She's up — follow her down the page.",
  approach: "Closer… she sees you scrolling.",
  climb: "Careful — she's climbing over the cards.",
  behind: "She's behind the widgets now. Peekaboo.",
  passthrough: "Whoa — she just walked through the page.",
  pull: "She pulled the page with her. Iconic.",
  bye: "Don't go yet — the mic is still live below.",
} as const;

export default function Home() {
  const stageRef = useRef<StageHandle>(null);
  const animUrlByName = useRef(new Map<string, string>());
  const historyRef = useRef<ChatMessage[]>([]);
  const [stored] = useState(loadSettings);

  const [overlay, setOverlay] = useState<OverlayId>(null);
  const [ttsUrl, setTtsUrl] = useState(stored.ttsUrl ?? DEFAULT_TTS);
  const [ttsConnected, setTtsConnected] = useState(false);
  const [ttsLabel, setTtsLabel] = useState("Not connected");
  const [ttsMsg, setTtsMsg] = useState("");
  const [amp, setAmp] = useState(0);
  const [models, setModels] = useState<{ name: string; url: string }[]>([]);
  const [anims, setAnims] = useState<{ name: string; url: string }[]>([]);
  const [vrmStatus, setVrmStatus] = useState("");
  const [stageStatus, setStageStatus] = useState("");
  const [caption, setCaption] = useState("Waking up… connecting voice.");
  const [gag, setGag] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [animStatus, setAnimStatus] = useState("");
  const [replyText, setReplyText] = useState("");
  const [voice, setVoice] = useState(stored.voice ?? PERSONAS[0].voice);
  const [speed, setSpeed] = useState(stored.speed ?? 1.0);
  const [loop, setLoop] = useState(stored.loop ?? true);
  const [activeEmote, setActiveEmote] = useState("idle");
  const [history, setHistory] = useState<UIMessage[]>([]);
  const [chatState, setChatState] = useState<ChatState>("");
  const [face, setFace] = useState<Record<string, number>>({});
  const [blinkAuto, setBlinkAuto] = useState(stored.blinkAuto ?? true);
  const [micOn, setMicOn] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaId>("aiko");
  const [hearts, setHearts] = useState(0);
  const [ghost, setGhost] = useState(false);
  const [canvasFront, setCanvasFront] = useState(false);
  const [chapter, setChapter] = useState(0);
  const recogRef = useRef<{ stop: () => void; start: () => void } | null>(null);
  const personaRef = useRef<PersonaId>("aiko");
  personaRef.current = persona;
  const mascotRef = useRef<MascotPoint>({ x: -9999, y: -9999, scale: 1 });
  const lastPtr = useRef({ x: 0, y: 0, t: 0 });
  const dodgeAt = useRef(0);
  const exprToken = useRef(0);
  const audioUnlocked = useRef(false);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poseRef = useRef(ZONE_POSE.hero);
  const zoneRef = useRef("hero");
  const gagFired = useRef(new Set<string>());

  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const busy = chatState === "thinking" || chatState === "speaking";
  const speaking = chatState === "speaking";

  const pushMsg = useCallback((role: UIMessage["role"], text: string) => {
    setHistory((h) => [...h, { role, text }]);
    if (role !== "sys")
      historyRef.current.push({ role: role === "bot" ? "assistant" : "user", content: text });
  }, []);

  const unlockAudio = useCallback(() => {
    if (audioUnlocked.current) return;
    audioUnlocked.current = true;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      void ctx.resume().then(() => void ctx.close()).catch(() => {});
    } catch { /* noop */ }
  }, []);

  // engine lifecycle is owned by <Stage/>; here: assets, settings, auto TTS, drop-VRM
  useEffect(() => {
    const engine = stageRef.current?.engine();
    if (!engine) return;
    engine.loopAnimation = stored.loop ?? true;
    engine.setAutoBlink(stored.blinkAuto ?? true);
    engine.setFraming("closeup");
    engine.fetchServerAssets();
    engine.connectTTS((stored.ttsUrl ?? DEFAULT_TTS).trim());
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f?.name.toLowerCase().endsWith(".vrm")) engine.loadVRMBlob(f);
    };
    const onDrag = (e: DragEvent) => e.preventDefault();
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragover", onDrag);
    return () => {
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragover", onDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // smooth scroll (landing parity) — skipped for reduced motion
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ lerp: 0.1 });
    let id = requestAnimationFrame(function loop(time: number) {
      lenis.raf(time);
      id = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
    };
  }, [reduced]);

  // auto-load first model once list arrives
  const loadedFirst = useRef(false);
  useEffect(() => {
    if (!loadedFirst.current && models.length > 0) {
      loadedFirst.current = true;
      const m = models[0];
      stageRef.current?.engine()?.loadVRMURL(m.url, PERSONAS[0].animeName);
    }
  }, [models]);

  // keep anim URL map in sync
  useEffect(() => {
    animUrlByName.current = new Map(anims.map((a) => [a.name.replace(/\.fbx$/i, ""), a.url]));
  }, [anims]);

  // persist settings across reloads
  useEffect(() => {
    saveSettings({ voice, speed, loop, blinkAuto, ttsUrl });
  }, [voice, speed, loop, blinkAuto, ttsUrl]);

  const flashExpr = useCallback((name: "surprised" | "happy", ms = 1300) => {
    const eng = stageRef.current?.engine();
    if (!eng) return;
    eng.setExpr(name, 1);
    const t = ++exprToken.current;
    setTimeout(() => {
      if (exprToken.current === t) eng.setExpr(name, 0);
    }, ms);
  }, []);

  const showLine = useCallback((line: string, tag: string, ms = 2600) => {
    setCaption(line);
    setGag(tag);
    setTimeout(() => setGag((g) => (g === tag ? null : g)), ms);
  }, []);

  /** Static SFX voice — only when the live voice is free, never overlaps chat. */
  const speakSfxIfFree = useCallback(async (url: string): Promise<boolean> => {
    const eng = stageRef.current?.engine();
    if (!eng || eng.isSpeaking()) return false;
    await eng.speakStatic(url);
    return true;
  }, []);

  const handleTouch = useCallback(
    ({ id, kind }: TouchInfo) => {
      const eng = stageRef.current?.engine();
      // pushes still apply mid-stroll; reactions wait until she stands still
      if (eng?.isWalking()) return;
      const baseId = id.endsWith("-char") ? id.slice(0, -5) : id;
      const line =
        TOUCH_LINES[id] ?? TOUCH_LINES[baseId] ??
        (kind === "char" ? (id.startsWith("hero") ? TOUCH_LINES["hero-title"] : TOUCH_LINES["section-title"] ?? "Hey! Watch it!") : "Hey! Watch it!");
      showLine(line, `touch:${id}`);
      if (eng) {
        eng.juice(personaRef.current === "aiko" ? 0xff6ec7 : 0x22d3ee);
        flashExpr("surprised");
      }
      void speakSfxIfFree(touchAudio(id));
      setHearts((h) => h + 1);
    },
    [flashExpr, showLine, speakSfxIfFree],
  );

  useMascotProximity(mascotRef, handleTouch, !reduced);

  // ---- Jules long tasks: poll in background, notify in chat ----
  const { sessions: julesSessions, watch: watchJules, unwatch: unwatchJules, activeCount: julesActive } =
    useJulesPoll({ onEvent: pushMsg });
  const [julesCreating, setJulesCreating] = useState(false);
  const [julesCreateError, setJulesCreateError] = useState<string | null>(null);

  const handleJulesCreate = useCallback(
    (prompt: string) => {
      const t = prompt.trim();
      if (!t || julesCreating) return;
      unlockAudio();
      setJulesCreating(true);
      setJulesCreateError(null);
      pushMsg("user", t);
      createJulesSession(t)
        .then((s) => {
          pushMsg("sys", `⚙ Jules task started: ${s.title ?? "task"}${s.url ? ` — ${s.url}` : ""}`);
          watchJules(s.id);
        })
        .catch((e) => {
          const msg = (e as Error).message;
          setJulesCreateError(msg);
          pushMsg("sys", `Jules failed (${msg}) — try again or phrase it as chat.`);
        })
        .finally(() => setJulesCreating(false));
    },
    [julesCreating, pushMsg, unlockAudio, watchJules],
  );

  const handleJulesCancel = useCallback(
    (id: string) => {
      deleteJulesSession(id)
        .then(() => {
          unwatchJules(id);
          pushMsg("sys", `Jules task ${id} cancelled.`);
        })
        .catch((e) => pushMsg("sys", `Jules cancel failed: ${(e as Error).message}`));
    },
    [pushMsg, unwatchJules],
  );

  const handleJulesMessage = useCallback(
    (id: string, text: string) => {
      sendJulesMessage(id, text)
        .then(() => pushMsg("sys", `Sent follow-up to Jules task ${id}.`))
        .catch((e) => pushMsg("sys", `Jules message failed: ${(e as Error).message}`));
    },
    [pushMsg],
  );

  const handleSend = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      unlockAudio();
      // Instant path (Gemini/rules) vs long Jules task is decided server-side;
      // the user message is posted by the engine. A Jules starter returns its
      // session id here so background polling can notify on completion.
      void stageRef.current
        ?.engine()
        ?.sendChat(t, historyRef.current, animUrlByName.current, voice, speed, persona)
        .then((r) => {
          if (r?.sessionId) watchJules(r.sessionId);
        });
    },
    [unlockAudio, voice, speed, persona, watchJules],
  );

  const handlePreset = useCallback(
    (kind: PresetKind) => {
      if (busy) return;
      unlockAudio();
      handleSend(PRESET_PROMPTS[kind].prompt);
    },
    [busy, handleSend, unlockAudio],
  );

  const handleStop = useCallback(() => {
    stageRef.current?.engine()?.stopSpeaking();
    setGag(null);
  }, []);

  const switchPersona = useCallback(
    (p: PersonaId) => {
      unlockAudio();
      setPersona(p);
      const idx = PERSONAS.findIndex((x) => x.id === p);
      const meta = PERSONAS[idx] ?? PERSONAS[0];
      setVoice(meta.voice);
      const m = models[idx] ?? models[0];
      const eng = stageRef.current?.engine();
      if (m && eng) {
        eng.stopSpeaking();
        eng.stopAnimation();
        void eng.loadVRMURL(m.url, meta.animeName);
        setCaption(meta.greeting);
        // greet through the LIVE voice when connected, caption otherwise
        if (eng.ttsConnected) eng.speakManual(meta.greeting, meta.voice, speed, "happy");
      } else {
        setCaption(meta.greeting);
      }
    },
    [models, speed, unlockAudio],
  );

  type SpeechRec = {
    continuous: boolean; interimResults: boolean; lang: string;
    onstart: (() => void) | null; onend: (() => void) | null;
    onerror: ((e: { error?: string }) => void) | null;
    onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
    start(): void; stop(): void;
  };

  const startMic = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setMicSupported(false);
      setVoiceHint("Mic unavailable — open text input");
      pushMsg("sys", "Speech recognition not supported.");
      return false;
    }
    if (recogRef.current) return true;
    try {
      const rec: SpeechRec = new SR();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onstart = () => { setMicOn(true); setChatState("listening"); setVoiceHint(null); };
      rec.onend = () => { setMicOn(false); recogRef.current = null; setChatState(""); };
      rec.onerror = (e: { error?: string }) => {
        setMicOn(false);
        recogRef.current = null;
        setChatState("");
        const err = e.error ?? "?";
        setVoiceHint(err === "not-allowed" || err === "service-not-allowed"
          ? "Tap mic to enable voice — browser blocked auto-listen"
          : "Mic error: " + err);
        pushMsg("sys", "Mic error: " + err);
      };
      rec.onresult = (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => {
        const last = e.results[e.results.length - 1];
        const transcript = last[0].transcript;
        if (last.isFinal) {
          rec.stop();
          setTimeout(() => handleSend(transcript), 80);
        }
      };
      recogRef.current = rec;
      rec.start();
      return true;
    } catch (e) {
      setVoiceHint("Tap mic to enable voice");
      pushMsg("sys", "Mic error: " + (e as Error).message);
      return false;
    }
  }, [handleSend, pushMsg]);

  const toggleMic = useCallback(() => {
    unlockAudio();
    if (recogRef.current) {
      recogRef.current.stop();
      recogRef.current = null;
      setMicOn(false);
      setChatState("");
      return;
    }
    // barge-in: stop her speech before listening
    stageRef.current?.engine()?.stopSpeaking();
    startMic();
  }, [startMic, unlockAudio]);

  // voice-first: attempt auto-listen shortly after load; browsers without a
  // prior gesture block mic — hint degrades gracefully to tap-to-enable.
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
      setMicSupported(false);
      setVoiceHint("Mic unavailable — open text input");
      return;
    }
    const t = setTimeout(() => {
      unlockAudio();
      startMic();
    }, 800);
    return () => clearTimeout(t);
  }, [startMic, unlockAudio]);

  // ---- scroll director: zones → chapters, poses, framing, gags ----
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - innerHeight;
      const p = max > 0 ? scrollY / max : 0;
      const eng = stageRef.current?.engine();
      const mx = reduced ? 0 : Math.sin(p * Math.PI * 2) * 0.9;
      doc.style.setProperty("--mascot-x", mx.toFixed(3));

      const zone =
        p < 0.1 ? "hero"
        : p < 0.26 ? "walk"
        : p < 0.42 ? "forward"
        : p < 0.56 ? "walk2"
        : p < 0.7 ? "passthrough"
        : p < 0.86 ? "pull"
        : "bye";

      // velocity-gated walking: she strolls only while the page moves,
      // eases to a stand ~220ms after scrolling stops (no more jumping).
      const now = performance.now();
      const dy = Math.abs(scrollY - lastY.current);
      const dt = Math.max(1, now - (lastT.current || now));
      lastY.current = scrollY;
      lastT.current = now;
      const moving = !reduced && dy / (dt / 1000) > 250;
      const base = ZONE_POSE[zone];
      poseRef.current = base;
      eng?.setStagePose(base.x, base.rot, WALK_ZONES.has(zone) && moving ? 1 : 0, base.depth);
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => {
        const b = poseRef.current;
        stageRef.current?.engine()?.setStagePose(b.x, b.rot, 0, b.depth);
      }, 220);

      if (zone !== zoneRef.current) {
        zoneRef.current = zone;
        setGhost(zone === "forward");
        setCanvasFront(zone === "passthrough");
        const ch = ZONE_CHAPTER[zone];
        setChapter(ch);
        eng?.setFraming(CHAPTER_FRAMING[ch]);
      }

      const fire = (key: string, line: string, fn?: () => void) => {
        if (!gagFired.current.has(key)) {
          gagFired.current.add(key);
          showLine(line, key);
          fn?.();
        }
      };
      if (p > 0.12) fire("walk", SCROLL_GAGS.walk);
      if (p > 0.28) fire("approach", SCROLL_GAGS.approach);
      if (p > 0.44) {
        fire("climb", SCROLL_GAGS.climb, () => stageRef.current?.engine()?.juice(0xff6ec7));
        fire("behind", SCROLL_GAGS.behind);
      }
      if (p > 0.58) fire("passthrough", SCROLL_GAGS.passthrough);
      if (p > 0.72)
        fire("pull", SCROLL_GAGS.pull, () => {
          document.body.classList.remove("shake");
          void document.body.offsetWidth;
          document.body.classList.add("shake");
        });
      if (p > 0.88)
        fire("bye", SCROLL_GAGS.bye, () => {
          setHearts((h) => h + 1);
          const e2 = stageRef.current?.engine();
          e2?.playEmote("wave");
          setTimeout(() => e2?.startIdleLoop(), 5000);
        });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
  }, [reduced, showLine]);

  const scrollTo = useCallback((id: string) => {
    unlockAudio();
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [reduced, unlockAudio]);

  const onResetView = () => {
    const eng = stageRef.current?.engine();
    if (!eng) return;
    eng.setFraming("closeup");
    eng.setCamHome();
  };

  const FACE_MAP: Record<string, string[]> = {
    mouthOpen: ["aa"], smile: ["happy"], blink: ["blinkLeft", "blinkRight"], surprise: ["surprised"],
  };
  const onFace = (k: string, v: number) => {
    setFace((f) => ({ ...f, [k]: v }));
    for (const n of FACE_MAP[k] ?? []) stageRef.current?.engine()?.setExpr(n, v);
  };

  const cardClick = useCallback(
    (id: string, preset: PresetKind | "switch") => {
      if (busy) return;
      unlockAudio();
      if (preset === "switch") switchPersona(personaRef.current === "aiko" ? "yuki" : "aiko");
      else handlePreset(preset);
    },
    [busy, handlePreset, switchPersona, unlockAudio],
  );

  // ---- pointer: gaze tracking + dodge + boop ----
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const eng = stageRef.current?.engine();
    if (eng && !reduced) {
      eng.setLook((e.clientX / innerWidth) * 2 - 1, (0.5 - e.clientY / innerHeight) * 2);
    }
    const now = performance.now();
    const lp = lastPtr.current;
    const dt = (now - lp.t) / 1000;
    if (eng && dt > 0 && dt < 0.2 && !reduced) {
      const v = Math.hypot(e.clientX - lp.x, e.clientY - lp.y) / dt;
      const m = mascotRef.current;
      const d = Math.hypot(e.clientX - m.x, e.clientY - m.y);
      if (v > 2600 && d < 260 && now - dodgeAt.current > 5000) {
        dodgeAt.current = now;
        eng.nudge(e.clientX < m.x ? 1 : -1);
        showLine(DODGE_LINE, "dodge", 2200);
        void speakSfxIfFree(DODGE_AUDIO);
        flashExpr("surprised");
      }
    }
    lastPtr.current = { x: e.clientX, y: e.clientY, t: now };
  }, [flashExpr, reduced, showLine, speakSfxIfFree]);

  const onMainClick = useCallback(
    (e: React.MouseEvent) => {
      unlockAudio();
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select, [data-interactive]")) return;
      const eng = stageRef.current?.engine();
      if (!eng || reduced) return;
      const m = mascotRef.current;
      const d = Math.hypot(e.clientX - m.x, e.clientY - m.y);
      if (d < 130 * m.scale && eng.boop()) {
        const p = personaRef.current;
        const i = Math.floor(Math.random() * BOOP_LINES[p].length);
        showLine(BOOP_LINES[p][i], "boop", 2200);
        void speakSfxIfFree(boopAudio(p)[i]);
        setHearts((h) => h + 1);
      }
    },
    [reduced, showLine, speakSfxIfFree, unlockAudio],
  );

  const activePersona = PERSONAS.find((x) => x.id === persona)!;
  const displayState: ChatState = !chatState && julesActive > 0 ? "agent" : chatState;
  const toggleOverlay = (id: Exclude<OverlayId, null>) =>
    setOverlay((cur) => (cur === id ? null : id));

  return (
    <main className="relative" onClick={onMainClick} onPointerMove={onPointerMove}>
      {/* full-bleed live stage — she IS the page; brief front swap for pass-through */}
      <div className={`fixed inset-0 ${canvasFront ? "pointer-events-none z-20" : "z-0"}`}>
        <Stage
          ref={stageRef}
          onChatState={setChatState}
          onCaption={setCaption}
          onNowPlaying={setNowPlaying}
          onAnimStatus={setAnimStatus}
          onTts={(label, connected) => { setTtsLabel(label); setTtsConnected(connected); }}
          onTtsMsg={setTtsMsg}
          onAmp={setAmp}
          onModels={setModels}
          onAnims={(list) => {
            setAnims(list);
            animUrlByName.current = new Map(
              list.map((a) => [a.name.replace(/\.fbx$/i, ""), a.url]),
            );
          }}
          onVrmStatus={setVrmStatus}
          onStageStatus={setStageStatus}
          onMessage={pushMsg}
          onMascotScreen={(x, y, scale) => {
            mascotRef.current = { x, y, scale };
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a0618] to-transparent" />
      </div>

      {/* floating hearts burst */}
      {hearts > 0 && (
        <div key={hearts} className="pointer-events-none fixed inset-0 z-40">
          {["💘", "✨", "💖", "⭐", "💜"].map((e, i) => (
            <motion.span
              key={`${hearts}-${i}`}
              initial={{ opacity: 0, y: 40, x: (i - 2) * 40 }}
              animate={{ opacity: [0, 1, 0], y: -220 - i * 30 }}
              transition={{ duration: 1.6, delay: i * 0.08 }}
              className="absolute bottom-[30%] left-1/2 text-2xl"
            >
              {e}
            </motion.span>
          ))}
        </div>
      )}

      {/* ── persistent edge chrome (desktop) ── */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 hidden px-7 pt-5 md:block">
        <div className="flex items-start justify-between">
          <div className="flex gap-10">
            <EdgeLinks
              title="Explore"
              items={[
                { label: "The Host", onSelect: () => scrollTo("ch-hero"), hint: "Back to the top" },
                { label: "Abilities", onSelect: () => scrollTo("ch-features"), hint: "What she does" },
                { label: "Playground", onSelect: () => scrollTo("ch-playground"), hint: "Touch everything" },
                { label: "Contact", onSelect: () => scrollTo("ch-contact"), hint: "Say hello" },
              ]}
            />
            <EdgeLinks
              title="Elsewhere"
              items={[
                { label: "GitHub", href: "https://github.com/0xRahim/MindMate" },
                { label: ttsConnected ? "● Voice live" : "○ Voice offline" },
              ]}
            />
          </div>
          <div className="pt-1 text-center">
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/90">
              <span className="live-dot mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300" />
              MindMate
            </div>
            <div key={chapter} className="bubble-pop mt-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white/45">
              {CHAPTER_NAMES[chapter]}
            </div>
          </div>
          <div className="flex gap-10">
            <EdgeLinks
              title="Tiny stuff"
              align="right"
              items={[
                { label: `${models.length} models · ${anims.length} clips` },
                { label: speaking ? "● speaking…" : nowPlaying ? `♫ ${nowPlaying}` : (stageStatus || "Live") },
              ]}
            />
            <EdgeLinks
              title="Say hello"
              align="right"
              items={[
                { label: "Ask about Rahim", onSelect: () => handlePreset("rahim"), hint: "💘" },
                { label: "Make her dance", onSelect: () => handlePreset("dance"), hint: "♫" },
                { label: "Stop", onSelect: handleStop, hint: "Back to idle" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── mobile mini bar ── */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-4 md:hidden">
        <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/90">
          <span className="live-dot mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300" />
          MindMate
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">
            {activePersona.animeName.split(" ")[1]} ● {CHAPTER_NAMES[chapter]}
          </div>
          <button
            onClick={() => toggleOverlay("debug")}
            className="pointer-events-auto rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white/70"
          >
            Panels
          </button>
        </div>
      </div>

      {/* ── voice-first bottom stack (persists across chapters) ── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-4 pb-4">
        <ChatBubble
          caption={caption}
          gag={gag}
          personaName={activePersona.animeName}
          personaTitle={activePersona.title}
          personaColor={activePersona.color}
          amp={amp}
          speaking={speaking}
          chatState={displayState}
          micOn={micOn}
          micSupported={micSupported}
          voiceHint={voiceHint}
          history={history}
          onSend={handleSend}
          onToggleMic={toggleMic}
        />
        <PillRemote
          persona={persona}
          setPersona={switchPersona}
          busy={busy}
          speaking={speaking}
          nowPlaying={nowPlaying}
          onPreset={handlePreset}
          onStop={handleStop}
          debugOn={overlay === "debug"}
          onToggleDebug={() => toggleOverlay("debug")}
        />
        <div className="text-[10px] tracking-wide text-white/35">
          {vrmStatus || stageStatus || "Live"} · scroll — she walks on the page
        </div>
      </div>

      {/* ── overlay panels (right edge, debug/about only) ── */}
      {overlay && (
        <div className="fixed bottom-4 right-3 top-20 z-30 flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/12 bg-black/70 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
              {overlay === "about" ? "About" : "Dashboard"}
            </span>
            <button onClick={() => setOverlay(null)} title="Close" className="rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white">
              <X size={13} />
            </button>
          </div>
          <div className="nice-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            {overlay === "about" && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[12px] leading-relaxed text-white/70">
                <p><strong className="text-white">MindMate Live</strong> — a knowledge-aware VRM companion. Chat drives animation, emote, expression and Kokoro voice in one atomic performance.</p>
                <p className="mt-2 text-white/50">{models.length} models · {anims.length} clips · {ttsConnected ? "voice connected" : "voice offline"}</p>
              </div>
            )}
            {overlay === "debug" && (
              <div className="flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
                <StatusPanel
                  ttsUrl={ttsUrl} setTtsUrl={setTtsUrl}
                  connected={ttsConnected} ttsLabel={ttsLabel} ttsMsg={ttsMsg} amp={amp}
                  onConnect={() => stageRef.current?.engine()?.connectTTS(ttsUrl.trim())}
                  onDisconnect={() => stageRef.current?.engine()?.disconnectTTS()}
                  vrmStatus={vrmStatus} models={models}
                  onPickModel={(m) => stageRef.current?.engine()?.loadVRMURL(m.url, m.name)}
                  onFile={(f) => stageRef.current?.engine()?.loadVRMBlob(f)}
                />
                <JulesPanel
                  sessions={julesSessions}
                  creating={julesCreating}
                  createError={julesCreateError}
                  onCreate={handleJulesCreate}
                  onCancel={handleJulesCancel}
                  onMessage={handleJulesMessage}
                />
                <InteractPanel
                  replyText={replyText} setReplyText={setReplyText}
                  voice={voice} setVoice={setVoice} speed={speed} setSpeed={setSpeed}
                  canSpeak={ttsConnected}
                  onSpeak={() => stageRef.current?.engine()?.speakManual(replyText, voice, speed, "happy")}
                  onStop={() => stageRef.current?.engine()?.stopSpeaking()}
                  anims={anims}
                  onPlayAnim={(a) => stageRef.current?.engine()?.playAnimation(a.url, a.name)}
                  nowPlaying={nowPlaying} animStatus={animStatus}
                  canStopAnim={!!nowPlaying}
                  onStopAnim={() => stageRef.current?.engine()?.stopAnimation()}
                  loop={loop}
                  onToggleLoop={() => { const v = stageRef.current?.engine()?.toggleLoop(); if (v !== undefined) setLoop(v); }}
                  activeEmote={activeEmote}
                  onEmote={(id) => { setActiveEmote(id); stageRef.current?.engine()?.playEmote(id as "idle"); }}
                />
                <DebugPanel
                  onResetView={onResetView}
                  face={face} onFace={onFace}
                  onResetFace={() => { stageRef.current?.engine()?.resetFace(); setFace({}); }}
                  blinkAuto={blinkAuto}
                  onToggleBlink={() => { const v = !blinkAuto; setBlinkAuto(v); stageRef.current?.engine()?.setAutoBlink(v); }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── chapters (edge-anchored, she owns the middle) ── */}
      <div className="relative z-10">
        {/* CH 1 · HERO — headline + scroll cue */}
        <section id="ch-hero" className="pointer-events-none relative flex min-h-screen flex-col justify-end px-4 pb-56 md:px-8 md:pb-48">
          <div className="max-w-md">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Live companion</div>
            <h1 className="mt-2 text-4xl font-black leading-tight md:text-5xl">
              <span className="glow-text">
                <ScatterText id="hero-title" text="Meet your live host." />
              </span>
            </h1>
            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-white/65">
              Scroll — she walks the page with you. Tap the mic and just talk; text stays tucked behind the keyboard key.
            </p>
          </div>
          <div className="absolute bottom-40 right-5 hidden items-center gap-2 text-[11px] text-white/50 md:flex">
            scroll <ArrowDown size={13} className="animate-bounce" />
          </div>
        </section>

        {/* CH 2 · FEATURES — chips docked at the edges (stacked on mobile) */}
        <section id="ch-features" className="flex min-h-screen flex-col justify-center gap-3 px-4 py-24 md:flex-row md:items-center md:justify-between md:px-8" data-ghost={ghost}>
          <div className="pointer-events-none flex flex-col items-stretch justify-center gap-3 md:flex-1 md:items-start">
            {[ABILITY_CARDS[0], ABILITY_CARDS[1]].map((f, i) => (
              <motion.div
                key={f.id}
                {...fadeUp}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                data-interactive="card"
                data-interactive-id={f.id}
                onClick={() => cardClick(f.id, f.preset)}
                className="tilt-card edge-chip pointer-events-auto w-full cursor-pointer rounded-2xl border border-white/12 bg-white/[0.06] p-4 backdrop-blur-xl md:max-w-[250px]"
              >
                <f.icon size={20} className="mb-1.5 text-cyan-300" />
                <div className="text-sm font-extrabold">{f.t}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-white/65">{f.d}</div>
                <div className="mt-1.5 text-[10px] font-bold text-white/35">tap → she performs it live</div>
              </motion.div>
            ))}
          </div>
          <div className="pointer-events-none flex flex-col items-stretch justify-center gap-3 md:flex-1 md:items-end">
            {(() => {
              const f = ABILITY_CARDS[2];
              return (
                <motion.div
                  key={f.id}
                  {...fadeUp}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  data-interactive="card"
                  data-interactive-id={f.id}
                  onClick={() => cardClick(f.id, f.preset)}
                className="tilt-card edge-chip pointer-events-auto w-full cursor-pointer rounded-2xl border border-white/12 bg-white/[0.06] p-4 backdrop-blur-xl md:max-w-[250px]"
                >
                  <f.icon size={20} className="mb-1.5 text-cyan-300" />
                  <div className="text-sm font-extrabold">{f.t}</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-white/65">{f.d}</div>
                  <div className="mt-1.5 text-[10px] font-bold text-white/35">tap → she performs it live</div>
                </motion.div>
              );
            })()}
          </div>
        </section>

        {/* CH 3 · PLAYGROUND — how-rows stacked at the right edge */}
        <section id="ch-playground" className="flex min-h-screen items-center justify-end px-4 md:px-8">
          <div className="pointer-events-none flex w-full max-w-[300px] flex-col gap-2.5">
            <div className="mb-1 text-right text-[10px] font-black uppercase tracking-[0.25em] text-white/50">
              Touch everything
            </div>
            {HOW_ROWS.map(([id, t, d, k], i) => (
              <motion.div
                key={id}
                {...fadeUp}
                transition={{ duration: 0.6, delay: i * 0.08 }}
                data-interactive="row"
                data-interactive-id={id}
                onClick={() => cardClick(id, k)}
                className="tilt-card pointer-events-auto cursor-pointer rounded-2xl border border-white/10 bg-black/50 p-3.5 backdrop-blur-xl"
              >
                <div className="text-[13px] font-black text-fuchsia-300">{t}</div>
                <div className="mt-0.5 text-[12px] text-white/70">{d}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CH 4 · CONTACT — the one centered moment */}
        <section id="ch-contact" className="flex min-h-screen items-center justify-center px-4 pb-32">
          <motion.div {...fadeUp} data-interactive="panel" data-interactive-id="cta-box" onClick={() => cardClick("cta-box", "rahim")} className="pointer-events-auto w-full max-w-md cursor-pointer rounded-3xl border border-white/12 bg-gradient-to-br from-fuchsia-500/15 via-black/60 to-cyan-400/15 p-7 text-center backdrop-blur-xl">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Say hello</div>
            <div className="mt-1 text-2xl font-black md:text-3xl">
              <ScatterText id="cta-title" text="She is live — just talk." />
            </div>
            <p className="mx-auto mt-2 max-w-sm text-[13px] text-white/65">
              The mic is on by default. Tap it if the browser paused her, or open the keyboard key for text.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button onClick={(e) => { e.stopPropagation(); scrollTo("ch-playground"); }} className="rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold text-black transition hover:scale-105">
                Talk to her
              </button>
              <button onClick={(e) => { e.stopPropagation(); handlePreset("rahim"); }} className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/10">
                Ask about Rahim 💘
              </button>
            </div>
            <div className="mt-4 text-[11px] text-white/40">live app · Gemini brain · {models.length} models · {anims.length} animations</div>
          </motion.div>
        </section>
        <footer className="relative z-10 pb-48 text-center text-[11px] text-white/35">
          MindMate live — voice-first, scroll with her. 👀
        </footer>
      </div>
    </main>
  );
}
