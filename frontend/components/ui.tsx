"use client";
import { cn } from "@/lib/design/cn";
import type { ReactNode } from "react";

export function Panel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside
      aria-label={label}
      className="pointer-events-auto w-full rounded-2xl border border-white/12 bg-white/[0.05] shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl"
    >
      {children}
    </aside>
  );
}

export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-white/10 px-3.5 py-3 last:border-b-0">
      <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
        {title}
        <span className="ml-auto font-normal normal-case tracking-normal text-white/40">{right}</span>
      </div>
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "success";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-white text-black hover:scale-[1.02]",
    secondary: "bg-white/5 text-white/75 hover:bg-white/10 hover:text-white border border-white/15",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition active:scale-[0.97] disabled:cursor-default disabled:opacity-30",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-[10px] text-white/55">
        {label}
        <strong className="font-semibold text-cyan-300 tabular-nums">{display}</strong>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function Field({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls =
    "w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] text-white outline-none transition placeholder:text-white/35 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20";
  if (multiline)
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(cls, "min-h-16 leading-relaxed")}
      />
    );
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cls}
    />
  );
}
