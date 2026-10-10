"use client";
import { useState } from "react";
import { Mic, SendHorizontal } from "lucide-react";
import type { ChatState } from "@/lib/stage/engine";
import { cn } from "@/lib/design/cn";

export type UIMessage = { role: "user" | "bot" | "sys"; text: string };

function StateLine({ state }: { state: ChatState }) {
  if (state === "thinking")
    return (
      <span className="flex items-center gap-1.5 text-amber-600">
        Thinking
        <span className="inline-flex gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[3px] w-[3px] rounded-full bg-violet-500"
              style={{ animation: `tdots 0.9s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </span>
      </span>
    );
  if (state === "speaking") return <span className="text-cyan-600">▶ Speaking</span>;
  if (state === "listening") return <span className="text-rose-600">● Listening</span>;
  if (state) return <span className="text-rose-600">{state}</span>;
  return null;
}

export function ChatPanel(props: {
  history: UIMessage[];
  chatState: ChatState;
  micOn: boolean;
  onSend: (text: string) => void;
  onToggleMic: () => void;
}) {
  const [draft, setDraft] = useState("");
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    props.onSend(t);
  };
  return (
    <div className="pointer-events-auto fixed bottom-3.5 left-1/2 z-20 w-[min(640px,calc(100vw-28px))] -translate-x-1/2 overflow-hidden rounded-[13px] border bg-white/90 shadow-[0_8px_30px_rgba(15,10,40,0.14)] backdrop-blur-xl" style={{ borderColor: "var(--border)" }}>
      <div className="nice-scroll flex max-h-[165px] flex-col gap-1 overflow-y-auto px-3.5 pb-2 pt-2.5">
        {props.history.map((m, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[12px] leading-relaxed">
            <span className={cn("min-w-5 shrink-0 pt-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em]", m.role === "user" ? "text-violet-600" : m.role === "bot" ? "text-cyan-600" : "text-neutral-400")}>
              {m.role === "user" ? "You" : m.role === "bot" ? "Her" : "…"}
            </span>
            <span className={m.role === "user" ? "text-neutral-500" : m.role === "sys" ? "italic text-amber-600 text-[11px]" : "text-neutral-900"}>
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-200/70 px-3 pb-2.5 pt-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={props.onToggleMic}
            title="Voice input"
            className={cn(
              "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border transition",
              props.micOn
                ? "border-rose-500 bg-rose-600 text-white"
                : "border-neutral-200 bg-neutral-100 text-neutral-500 hover:text-violet-600",
            )}
          >
            <Mic size={15} />
          </button>
          {props.micOn ? (
            <div className="flex h-[38px] flex-1 items-center justify-center gap-[3px] rounded-lg border border-rose-300 bg-rose-50 px-3">
              {[7, 15, 11, 22, 13, 19, 9, 17].map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-rose-500"
                  style={{ height: h, animation: `lb-wave 0.58s ease-in-out ${i * 0.06}s infinite` }}
                />
              ))}
              <span className="ml-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-rose-600">Listening</span>
            </div>
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Jack in… type a message"
              className="h-[38px] flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-[13px] outline-none placeholder:text-neutral-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          )}
          <button
            onClick={send}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-500 active:scale-95"
          >
            <SendHorizontal size={15} />
          </button>
        </div>
        <div className="mt-1 flex min-h-[14px] items-center text-[10px] text-neutral-400">
          <StateLine state={props.chatState} />
        </div>
      </div>
    </div>
  );
}
