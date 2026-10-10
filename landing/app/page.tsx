"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Lenis from "lenis";
import { ArrowDown, Bot, Mic, Move3d, Sparkles } from "lucide-react";
import HeroStage, { type HeroStageHandle } from "@/components/HeroStage";
import DemoControls from "@/components/DemoControls";
import ScatterText from "@/components/ScatterText";
import { useMascotProximity, type MascotPoint, type TouchInfo } from "@/lib/mascot-proximity";
import {
  BOOP_LINES,
  DODGE_AUDIO,
  DEMO_ACTIONS,
  DODGE_LINE,
  PERSONAS,
  SCROLL_LINES,
  THINK_AUDIO,
  TOUCH_LINES,
  boopAudio,
  gagAudio,
  greetAudio,
  touchAudio,
  type DemoKind,
  type PersonaId,
} from "@/lib/demo-script";

const fadeUp = {
  initial: { opacity: 0, y: 36 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7 },
} as const;

const CARD_DEMO: Record<string, DemoKind | "switch"> = {
  "card-knowledge": "rahim",
  "card-voice": "dance",
  "card-stage": "wow",
  "how-1": "hi",
  "how-2": "switch",
  "how-3": "hiphop",
};

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

export default function Landing() {
  const stageRef = useRef<HeroStageHandle>(null);
  const [caption, setCaption] = useState("Meet Aiko — click Say Hi to wake her up. 🔊 needs one tap first.");
  const [amp, setAmp] = useState(0);
  const [models, setModels] = useState<{ name: string; url: string }[]>([]);
  const [anims, setAnims] = useState<{ name: string; url: string }[]>([]);
  const [status, setStatus] = useState("Starting…");
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [persona, setPersona] = useState<PersonaId>("aiko");
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [gag, setGag] = useState<string | null>(null);
  const [hearts, setHearts] = useState(0);
  const [ghost, setGhost] = useState(false);
  const [canvasFront, setCanvasFront] = useState(false);
  const animUrl = useRef(new Map<string, string>());
  const gagFired = useRef(new Set<string>());
  const zoneRef = useRef("hero");
  const personaRef = useRef<PersonaId>("aiko");
  personaRef.current = persona;
  const mascotRef = useRef<MascotPoint>({ x: -9999, y: -9999, scale: 1 });
  const lastPtr = useRef({ x: 0, y: 0, t: 0 });
  const dodgeAt = useRef(0);
  const exprToken = useRef(0);
  const unlockedRef = useRef(false);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const poseRef = useRef({ x: 0, rot: 0, depth: 0 });
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    animUrl.current = new Map(anims.map((a) => [a.name.replace(/\.fbx$/i, ""), a.url]));
  }, [anims]);

  // smooth scroll
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.1 });
    let id = requestAnimationFrame(function loop(time: number) {
      lenis.raf(time);
      id = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
    };
  }, []);

  // auto-load first model once list arrives
  const loadedFirst = useRef(false);
  useEffect(() => {
    if (!loadedFirst.current && models.length > 0) {
      loadedFirst.current = true;
      const m = models[0];
      stageRef.current?.engine()?.loadVRMURL(m.url, PERSONAS[0].animeName);
    }
  }, [models]);

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

  // ---- touch reactions (she bumps a widget) ----
  const speakIfFree = useCallback(async (url: string): Promise<boolean> => {
    const eng = stageRef.current?.engine();
    if (!eng || !unlockedRef.current || eng.isSpeaking()) return false;
    await eng.speak(url);
    return true;
  }, []);

  const handleTouch = useCallback(
    ({ id, kind }: TouchInfo) => {
      const eng = stageRef.current?.engine();
      // pushes still apply mid-stroll; reactions wait until she stands still
      if (eng?.isWalking()) return;
      const line =
        TOUCH_LINES[id] ??
        (kind === "char" ? (id.startsWith("hero") ? TOUCH_LINES["hero-title"] : TOUCH_LINES["section-title"]) : "Hey! Watch it!");
      showLine(line, `touch:${id}`);
      if (eng) {
        eng.juice(personaRef.current === "aiko" ? 0xff6ec7 : 0x22d3ee);
        flashExpr("surprised");
      }
      void speakIfFree(touchAudio(id, kind));
      setHearts((h) => h + 1);
    },
    [flashExpr, showLine, speakIfFree],
  );

  useMascotProximity(mascotRef, handleTouch, !reduced);

  // ---- scroll director: zones with depth + ghost + pass-through ----
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - innerHeight;
      const p = max > 0 ? scrollY / max : 0;
      const eng = stageRef.current?.engine();
      const mx = Math.sin(p * Math.PI * 2) * 0.9;
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
      const moving = dy / (dt / 1000) > 250;
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
      }

      const fire = (key: string, line: string, fn?: () => void) => {
        if (!gagFired.current.has(key)) {
          gagFired.current.add(key);
          showLine(line, key);
          // voice if free (post-first-tap), caption always — never overlaps
          void speakIfFree(gagAudio(key));
          fn?.();
        }
      };
      if (p > 0.12) fire("walk", SCROLL_LINES.walk);
      if (p > 0.28) fire("approach", SCROLL_LINES.approach);
      if (p > 0.44) {
        fire("climb", SCROLL_LINES.climb, () => stageRef.current?.engine()?.juice(0xff6ec7));
        fire("behind", SCROLL_LINES.behind);
      }
      if (p > 0.58) fire("passthrough", SCROLL_LINES.passthrough);
      if (p > 0.72)
        fire("pull", SCROLL_LINES.pull, () => {
          document.body.classList.remove("shake");
          void document.body.offsetWidth;
          document.body.classList.add("shake");
        });
      if (p > 0.88)
        fire("bye", SCROLL_LINES.bye, () => {
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
  }, [showLine, speakIfFree]);

  const unlockAudio = useCallback(() => {
    if (unlocked) return;
    setUnlocked(true);
    unlockedRef.current = true;
    try {
      const ctx = new AudioContext();
      void ctx.resume().then(() => void ctx.close());
    } catch { /* noop */ }
  }, [unlocked]);

  const onDemo = useCallback(
    async (kind: DemoKind) => {
      unlockAudio();
      const eng = stageRef.current?.engine();
      if (!eng || busy) return;
      const action = DEMO_ACTIONS.find((a) => a.kind === kind);
      if (!action) return;
      const p = personaRef.current;
      const persona = PERSONAS.find((x) => x.id === p)!;
      setBusy(true);
      eng.juice(kind === "rahim" ? 0xff6ec7 : 0x22d3ee);
      // Animation OR emote, never both (main-frontend rule): clips own the
      // bones while playing; the think beat is procedural (no clip → shows).
      if (kind === "rahim") {
        // voiced think beat before the punchline (5.8s, adapts via onended)
        eng.playEmote("think");
        setCaption("Hmm… Rahim? Let me think…");
        await eng.speak(THINK_AUDIO);
      }
      const url = action.animation ? animUrl.current.get(action.animation) : undefined;
      if (url && action.animation) void eng.playAnimation(url, action.animation, action.loop);
      else eng.playEmote(action.emote);
      eng.setExpr("happy", action.expression === "happy" ? 0.9 : 0);
      eng.setExpr("surprised", action.expression === "surprised" ? 0.9 : 0);
      const text = action.text(p);
      setCaption(text);
      setGag("demo");
      await eng.speak(action.audio(p));
      setGag(null);
      // Looped clips keep playing (frontend parity); one-shots auto-resume
      // the Idle loop via the mixer's finished handler.
      setBusy(false);
      if (kind === "rahim" || kind === "dance") {
        setHearts((h) => h + 1);
        void persona;
      }
    },
    [busy, unlockAudio],
  );

  const onStop = useCallback(() => {
    const eng = stageRef.current?.engine();
    eng?.stopSpeaking();
    eng?.stopAnimation(); // fades out, resets emote, resumes Idle loop
    setBusy(false);
    setGag(null);
  }, []);

  const switchPersona = useCallback(
    (p: PersonaId) => {
      unlockAudio();
      setPersona(p);
      const idx = PERSONAS.findIndex((x) => x.id === p);
      const m = models[idx] ?? models[0];
      if (m) {
        const eng = stageRef.current?.engine();
        eng?.stopSpeaking();
        eng?.stopAnimation();
        void eng?.loadVRMURL(m.url, PERSONAS[idx]?.animeName ?? m.name);
        setCaption(PERSONAS[idx]?.greeting ?? "Switched model.");
        // greetings speak (click = autoplay-safe, interrupts any line)
        if (unlockedRef.current) void eng?.speak(greetAudio(p));
      }
    },
    [models, unlockAudio],
  );

  const cardClick = useCallback(
    (id: string) => {
      if (busy) return;
      unlockAudio();
      const k = CARD_DEMO[id];
      if (!k) return;
      if (k === "switch") switchPersona(personaRef.current === "aiko" ? "yuki" : "aiko");
      else void onDemo(k);
    },
    [busy, onDemo, switchPersona, unlockAudio],
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
        void speakIfFree(DODGE_AUDIO);
        flashExpr("surprised");
      }
    }
    lastPtr.current = { x: e.clientX, y: e.clientY, t: now };
  }, [flashExpr, reduced, showLine, speakIfFree]);

  const onMainClick = useCallback(
    (e: React.MouseEvent) => {
      unlockAudio();
      const el = e.target as HTMLElement;
      if (el.closest("button, a, [data-interactive]")) return;
      const eng = stageRef.current?.engine();
      if (!eng || reduced) return;
      const m = mascotRef.current;
      const d = Math.hypot(e.clientX - m.x, e.clientY - m.y);
      if (d < 130 * m.scale && eng.boop()) {
        const p = personaRef.current;
        const i = Math.floor(Math.random() * BOOP_LINES[p].length);
        showLine(BOOP_LINES[p][i], "boop", 2200);
        void speakIfFree(boopAudio(p)[i]);
        setHearts((h) => h + 1);
      }
    },
    [reduced, showLine, speakIfFree, unlockAudio],
  );

  const activePersona = PERSONAS.find((x) => x.id === persona)!;

  return (
    <main className="relative" onClick={onMainClick} onPointerMove={onPointerMove}>
      {/* 3D canvas — behind content, except the scripted pass-through */}
      <div className={`fixed inset-0 ${canvasFront ? "pointer-events-none z-20" : "z-0"}`}>
        <HeroStage
          ref={stageRef}
          caption={caption}
          onCaption={setCaption}
          onAmp={setAmp}
          onModels={setModels}
          onAnims={setAnims}
          onStatus={setStatus}
          onNowPlaying={setNowPlaying}
          onSpeaking={setSpeaking}
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

      <div className="relative z-10">
        {/* ── HERO ── */}
        <section className="flex min-h-screen flex-col items-center justify-end px-4 pb-10 pt-24">
          <motion.div {...fadeUp} className="pointer-events-none mb-auto pt-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-black/50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200 backdrop-blur">
              <span className="live-dot inline-block h-2 w-2 rounded-full bg-cyan-300" />
              MindMate · Live static demo
            </div>
            <h1 className="text-5xl font-black leading-tight md:text-7xl">
              Meet <ScatterText id="hero-title" text="Aiko & Yuki" className="glow-text" />
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 md:text-base">
              Your anime companions for knowledge, tasks and vibes. They talk, dance, and — fair warning — they walk off the stage.
            </p>
          </motion.div>

          {/* speech bubble */}
          <div key={caption} className="bubble-pop pointer-events-none mb-3 w-full max-w-lg rounded-2xl border border-white/15 bg-black/60 p-3.5 text-[13px] leading-relaxed shadow-2xl backdrop-blur-xl">
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ color: activePersona.color }}>
              <span>{activePersona.animeName} · {activePersona.title}</span>
              <span className="flex gap-[3px]">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className="inline-block w-[3px] rounded bg-current transition-all" style={{ height: `${4 + Math.min(14, (amp / 100) * 16 * Math.abs(Math.sin(i)))}px`, opacity: speaking ? 1 : 0.35 }} />
                ))}
              </span>
            </div>
            {caption}
            {gag && <div className="mt-1 text-[11px] text-white/50">🎬 4th-wall gag: {gag}</div>}
          </div>

          <DemoControls persona={persona} setPersona={switchPersona} busy={busy} speaking={speaking} nowPlaying={nowPlaying} onDemo={onDemo} onStop={onStop} />

          <div className="pointer-events-none mt-3 flex items-center gap-2 text-[11px] text-white/50">
            <ArrowDown size={13} className="animate-bounce" /> scroll — she walks on the page <span className="text-white/30">· {status}</span>
          </div>
        </section>

        {/* ── FEATURES (she shoves these, then sends them behind her) ── */}
        <section className="mx-auto grid max-w-5xl gap-4 px-4 py-28 md:grid-cols-3" data-ghost={ghost}>
          {[
            { id: "card-knowledge", icon: Bot, t: "Knowledge-aware", d: "Hardcoded knowledge base today, Obsidian + semantic search on the roadmap. Ask her anything in her domain." },
            { id: "card-voice", icon: Mic, t: "Voice-first", d: "Kokoro TTS streams 24kHz PCM with lip-sync, expressions and Mixamo-choreographed gestures." },
            { id: "card-stage", icon: Move3d, t: "Agentic stage", d: "VRM + three.js + emote state machine. She idles, thinks, performs — and commits A/V atomically." },
          ].map((f, i) => (
            <motion.div
              key={f.t}
              {...fadeUp}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              data-interactive="card"
              data-interactive-id={f.id}
              onClick={() => cardClick(f.id)}
              className="tilt-card cursor-pointer rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl"
            >
              <f.icon size={22} className="mb-2 text-cyan-300" />
              <div className="text-base font-extrabold">{f.t}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-white/65">{f.d}</div>
              <div className="mt-2 text-[11px] font-bold text-white/35">click → she demos it</div>
            </motion.div>
          ))}
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="mx-auto max-w-4xl px-4 py-24">
          <motion.h2 {...fadeUp} className="text-center text-3xl font-black md:text-4xl">
            Static demo, <ScatterText id="section-how" text="real feel" className="glow-text" />
          </motion.h2>
          <div className="mt-8 space-y-3">
            {[
              ["how-1", "1 · Press a button", "Say Hi / Dance / Hip-Hop / Who is Rahim — every press plays a staged FBX clip + emote + expression + pre-generated Kokoro line."],
              ["how-2", "2 · Switch models", "Aiko (cheerful idol) ↔ Yuki (cool kuudere). Same lines, different energy. VRM crossfade with entrance pop."],
              ["how-3", "3 · Scroll", "The character leaves the stage: walks, pokes cards (they tilt!), climbs the headlines, shakes the page. Pure scroll-linked theatre."],
            ].map(([id, t, d], i) => (
              <motion.div
                key={t}
                {...fadeUp}
                transition={{ duration: 0.6, delay: i * 0.08 }}
                data-interactive="row"
                data-interactive-id={id}
                onClick={() => cardClick(id)}
                className="tilt-card flex cursor-pointer gap-4 rounded-2xl border border-white/10 bg-black/50 p-4 backdrop-blur-xl"
              >
                <div className="text-sm font-black text-fuchsia-300">{t}</div>
                <div className="text-[13px] text-white/70">{d}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="mx-auto max-w-3xl px-4 pb-24 pt-10 text-center">
          <motion.div {...fadeUp} data-interactive="panel" data-interactive-id="cta-box" className="rounded-3xl border border-white/12 bg-gradient-to-br from-fuchsia-500/15 via-black/60 to-cyan-400/15 p-8 backdrop-blur-xl">
            <Sparkles size={26} className="mx-auto mb-2 text-amber-300" />
            <div className="text-2xl font-black md:text-3xl">This was just the trailer.</div>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-white/65">
              The full MindMate app adds live chat, mic input, Gemini brain and real-time TTS. Same stage, no script.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <a href="http://localhost:3000" className="rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold text-black transition hover:scale-105">
                Open the live app
              </a>
              <button onClick={() => onDemo("rahim")} className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/10">
                Ask about Rahim 💘
              </button>
            </div>
            <div className="mt-4 text-[11px] text-white/40">landing demo · static audio · {models.length} models · {anims.length} animations</div>
          </motion.div>
          <footer className="mt-10 text-[11px] text-white/35">MindMate landing — Aiko & Yuki will remember you scrolled. 👀</footer>
        </section>
      </div>
    </main>
  );
}

function _keepInViewRef() {
  // keeps useInView import used for future section reveals
  return useInView;
}
void _keepInViewRef;
