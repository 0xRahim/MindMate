"use client";

import { motion } from "framer-motion";
import { Heart, Music2, Play, Sparkles, Square, UserSearch } from "lucide-react";
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

/** Bottom media-remote bar: model toggle + demo triggers + stop. */
export default function PillRemote({ persona, setPersona, busy, speaking, nowPlaying, onDemo, onStop }: Props) {
  const active = PERSONAS.find((p) => p.id === persona)!;
  return (
    <div
      data-interactive="panel"
      data-interactive-id="demo-panel"
      className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/15 bg-black/60 py-1.5 pl-2 pr-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
    >
      {/* model toggle */}
      <div className="flex shrink-0 items-center rounded-full bg-white/8 p-0.5">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPersona(p.id)}
            title={`${p.animeName} — ${p.title}`}
            className={`rounded-full px-2.5 py-1.5 text-[11px] font-extrabold transition-all ${
              persona === p.id ? "text-black" : "text-white/55 hover:text-white"
            }`}
            style={persona === p.id ? { background: p.color, boxShadow: `0 0 16px ${p.color}88` } : undefined}
          >
            {p.id === "aiko" ? "Aiko" : "Yuki"}
          </button>
        ))}
      </div>

      <div className="h-5 w-px shrink-0 bg-white/15" />

      {/* demo triggers */}
      {DEMO_ACTIONS.map((a) => {
        const Icon = ICONS[a.kind] ?? Play;
        return (
          <motion.button
            key={a.kind}
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.08 }}
            disabled={busy}
            onClick={() => onDemo(a.kind)}
            title={`${a.label} — ${active.animeName}`}
            className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1 text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <Icon size={15} />
            <span className="text-[8px] font-bold uppercase tracking-wider">{a.label}</span>
          </motion.button>
        );
      })}

      <div className="h-5 w-px shrink-0 bg-white/15" />

      <button
        onClick={onStop}
        title={speaking ? "● speaking…" : nowPlaying ? `♫ ${nowPlaying}` : "Stop"}
        className="flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-2.5 py-1.5 text-[10px] font-bold text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <Square size={10} />
        {speaking ? "Live" : "Stop"}
      </button>
    </div>
  );
}
