"use client";
import { Activity, BrainCircuit, Gamepad2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/design/cn";

export type PanelId = "status" | "interact" | "debug";

export function TopBar({
  active,
  onToggle,
  ttsConnected,
}: {
  active: PanelId | null;
  onToggle: (p: PanelId | null) => void;
  ttsConnected: boolean;
}) {
  const tabs: { id: PanelId; label: string; icon: React.ReactNode }[] = [
    { id: "status", label: "Status", icon: <Activity size={15} /> },
    { id: "interact", label: "Interact", icon: <Gamepad2 size={15} /> },
    { id: "debug", label: "Debug", icon: <SlidersHorizontal size={15} /> },
  ];
  return (
    <header className="pointer-events-auto fixed inset-x-0 top-0 z-40 flex h-[52px] items-center justify-between bg-gradient-to-b from-[#08090f] via-[#08090fee] to-transparent px-3.5">
      <div className="flex select-none items-center gap-2.5">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_20px_rgba(124,58,237,0.5)]">
          <BrainCircuit size={18} />
        </div>
        <div>
          <div className="bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-[15px] font-black tracking-tight text-transparent">
            MindMate
          </div>
          <div className="mt-px text-[9px] uppercase tracking-[0.1em] text-neutral-400">
            AI · Kokoro TTS · Mixamo · Real-time
          </div>
        </div>
      </div>
      <nav className="flex items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onToggle(active === t.id ? null : t.id)}
            title={t.label}
            className={cn(
              "relative flex h-10 w-[52px] flex-col items-center justify-center gap-0.5 rounded-lg border text-neutral-400 transition",
              active === t.id
                ? "border-violet-400 bg-violet-500/15 text-violet-300 shadow-[0_0_18px_rgba(124,58,237,0.3)]"
                : "border-white/10 bg-white/5 hover:border-violet-400/40 hover:text-violet-300",
            )}
          >
            {t.icon}
            <span className="text-[7.5px] font-bold uppercase tracking-[0.06em]">{t.label}</span>
            {t.id === "status" && (
              <span
                className={cn(
                  "absolute right-[5px] top-[5px] h-1.5 w-1.5 rounded-full",
                  ttsConnected ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-rose-500",
                )}
              />
            )}
          </button>
        ))}
      </nav>
    </header>
  );
}
