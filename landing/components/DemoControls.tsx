"use client";

import { motion } from "framer-motion";
import { Heart, Music2, Play, Sparkles, UserSearch } from "lucide-react";
import { DEMO_ACTIONS, PERSONAS, type DemoKind, type PersonaId } from "@/lib/demo-script";

type Props = {
  persona: PersonaId;
  setPersona: (p: PersonaId) => void;
  busy: boolean;
  speaking: boolean;
  nowPlaying: string | null;
  onDemo: (kind: DemoKind) => void;
  onStop: () => void;
};

const ICONS: Record<string, typeof Play> = {
  hi: Sparkles,
  dance: Music2,
  hiphop: Music2,
  rahim: UserSearch,
  wow: Heart,
};

export default function DemoControls({ persona, setPersona, busy, speaking, nowPlaying, onDemo, onStop }: Props) {
  return (
    <div data-interactive="panel" data-interactive-id="demo-panel" className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/12 bg-black/55 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      {/* model switcher */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        {PERSONAS.map((p, i) => {
          const active = persona === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPersona(p.id)}
              className={`group rounded-xl border p-2.5 text-left transition-all duration-300 ${active ? "scale-[1.02] border-transparent" : "border-white/10 bg-white/5 hover:border-white/25"}`}
              style={active ? { background: `linear-gradient(135deg, ${p.color}33, #00000088)`, boxShadow: `0 0 24px ${p.color}55` } : undefined}
            >
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: p.color }}>
                Model {i + 1} {active ? "● live" : ""}
              </div>
              <div className="text-sm font-extrabold text-white">{p.animeName}</div>
              <div className="text-[11px] text-white/60">{p.title}</div>
            </button>
          );
        })}
      </div>

      {/* demo buttons */}
      <div className="grid grid-cols-2 gap-2">
        {DEMO_ACTIONS.map((a) => {
          const Icon = ICONS[a.kind] ?? Play;
          return (
            <motion.button
              key={a.kind}
              whileTap={{ scale: 0.93 }}
              whileHover={{ scale: 1.03 }}
              disabled={busy}
              onClick={() => onDemo(a.kind)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500/80 to-fuchsia-500/80 px-3 py-2.5 text-left text-[13px] font-bold text-white shadow-lg transition-opacity disabled:opacity-50"
            >
              <Icon size={15} />
              {a.label}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-white/60">
        <span>
          {speaking ? "● speaking…" : nowPlaying ? `♫ ${nowPlaying}` : "idle — click a demo"}
        </span>
        <button onClick={onStop} className="rounded-full border border-white/15 px-2.5 py-1 hover:bg-white/10">
          Stop
        </button>
      </div>
    </div>
  );
}
