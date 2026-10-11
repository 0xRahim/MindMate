"use client";

import { useState } from "react";
import { History, Keyboard, Mic, SendHorizontal, X } from "lucide-react";
import type { ChatState } from "@/lib/stage/engine";
import { cn } from "@/lib/design/cn";

export type UIMessage = { role: "user" | "bot" | "sys"; text: string };

function StateLine({ state }: { state: ChatState }) {
  if (state === "thinking")
    return (
      <span className="flex items-center gap-1.5 text-amber-300">
        Thinking
        <span className="inline-flex gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[3px] w-[3px] rounded-full bg-fuchsia-400"
              style={{ animation: `tdots 0.9s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </span>
      </span>
    );
  if (state === "speaking") return <span className="text-cyan-300">▶ Speaking</span>;
  if (state === "listening") return <span className="text-rose-300">● Listening</span>;
  if (state === "agent") return <span className="text-violet-300">⚙ Jules working…</span>;
  if (state) return <span className="text-rose-300">{state}</span>;
  return null;
}

/**
 * Voice-first chat: mic is the default input, text field stays hidden
 * until the user manually opens it via the keyboard toggle.
 */
export default function ChatBubble(props: {
  caption: string;
  gag: string | null;
  personaName: string;
  personaTitle: string;
  personaColor: string;
  amp: number;
  speaking: boolean;
  chatState: ChatState;
  micOn: boolean;
  micSupported: boolean;
  voiceHint: string | null;
  history: UIMessage[];
  onSend: (text: string) => void;
  onToggleMic: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [showText, setShowText] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    props.onSend(t);
  };

  return (
    <>
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/15 bg-black/60 p-3 text-[12px] leading-relaxed shadow-2xl backdrop-blur-xl">
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ color: props.personaColor }}>
          <span>{props.personaName} · {props.personaTitle}</span>
          <span className="flex items-center gap-2">
            <span className="flex gap-[3px]">
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} className="inline-block w-[3px] rounded bg-current transition-all" style={{ height: `${4 + Math.min(14, (props.amp / 100) * 16 * Math.abs(Math.sin(i)))}px`, opacity: props.speaking ? 1 : 0.35 }} />
              ))}
            </span>
            <button
              onClick={() => setShowText((v) => !v)}
              title={showText ? "Hide text input" : "Show text input"}
              className={cn("rounded-full p-1 transition hover:bg-white/10", showText ? "text-cyan-300" : "text-white/50 hover:text-white")}
            >
              {showText ? <X size={12} /> : <Keyboard size={12} />}
            </button>
            <button
              onClick={() => setShowHistory((v) => !v)}
              title={showHistory ? "Hide history" : "Show history"}
              className={cn("rounded-full p-1 transition hover:bg-white/10", showHistory ? "text-cyan-300" : "text-white/50 hover:text-white")}
            >
              <History size={12} />
            </button>
          </span>
        </div>
        <div key={props.caption} className="bubble-pop text-white/90">{props.caption}</div>
        {props.gag && <div className="mt-1 text-[11px] text-white/50">🎬 {props.gag}</div>}

        {/* voice-first row: big mic is the default input */}
        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={props.onToggleMic}
            title={props.micSupported ? "Voice input" : "Voice not supported — use text"}
            disabled={!props.micSupported}
            className={cn(
              "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border transition",
              props.micOn
                ? "border-rose-400 bg-rose-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.45)]"
                : "border-white/15 bg-white/5 text-white/70 hover:scale-105 hover:text-white active:scale-95",
              !props.micSupported && "opacity-40",
            )}
          >
            <Mic size={17} />
          </button>
          <div
            className={cn(
              "flex h-[42px] flex-1 items-center justify-center gap-[3px] rounded-xl border px-3",
              props.micOn
                ? "border-rose-400/50 bg-rose-500/10"
                : "border-white/10 bg-white/[0.03]",
            )}
          >
            {props.micOn ? (
              <>
                {[7, 15, 11, 22, 13, 19, 9, 17].map((h, i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full bg-rose-400"
                    style={{ height: h, animation: `lb-wave 0.58s ease-in-out ${i * 0.06}s infinite` }}
                  />
                ))}
                <span className="ml-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-rose-300">Listening</span>
              </>
            ) : (
              <span className="text-[11px] text-white/50">
                {props.voiceHint ?? (props.micSupported ? "Tap mic to talk — she auto-listens" : "Mic unavailable — open text input")}
              </span>
            )}
          </div>
        </div>

        {/* text input: hidden until manually opened */}
        {showText && (
          <div className="bubble-pop mt-2 flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Talk to her…"
              autoFocus
              className="h-[34px] flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
            />
            <button
              onClick={send}
              title="Send"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-white text-black transition hover:scale-105 active:scale-95"
            >
              <SendHorizontal size={14} />
            </button>
          </div>
        )}
        <div className="mt-1 flex min-h-[14px] items-center text-[10px] text-white/40">
          <StateLine state={props.chatState} />
        </div>
      </div>

      {/* history edge drawer */}
      {showHistory && (
        <div className="pointer-events-auto fixed bottom-4 right-3 top-20 z-30 flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/12 bg-black/70 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/10 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
            Conversation
          </div>
          <div className="nice-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto px-3.5 py-2.5">
            {props.history.length === 0 && (
              <div className="text-[12px] italic text-white/35">Nothing yet — say hi.</div>
            )}
            {props.history.map((m, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[12px] leading-relaxed">
                <span className={cn("min-w-5 shrink-0 pt-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]", m.role === "user" ? "text-fuchsia-300" : m.role === "bot" ? "text-cyan-300" : "text-white/30")}>
                  {m.role === "user" ? "You" : m.role === "bot" ? "Her" : "…"}
                </span>
                <span className={m.role === "user" ? "text-white/70" : m.role === "sys" ? "text-[11px] italic text-amber-300/80" : "text-white"}>
                  {m.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
