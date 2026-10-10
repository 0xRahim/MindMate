"use client";
import { cn } from "@/lib/design/cn";
import type { ReactNode } from "react";

export function Panel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside
      aria-label={label}
      className="pointer-events-auto w-[300px] max-h-[calc(100vh-76px)] overflow-y-auto nice-scroll rounded-2xl border bg-white/90 shadow-[0_8px_30px_rgba(15,10,40,0.14)] backdrop-blur-xl"
      style={{ borderColor: "var(--border)" }}
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
    <div className="border-b px-3.5 py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
        {title}
        <span className="ml-auto font-normal normal-case tracking-normal text-neutral-400">{right}</span>
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
    primary: "bg-violet-600 text-white hover:bg-violet-500",
    secondary: "bg-neutral-100 text-neutral-800 hover:bg-violet-100 hover:text-violet-700 border",
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
        variant === "secondary" && "border-neutral-200",
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
      <label className="mb-1 flex items-center justify-between text-[10px] text-neutral-500">
        {label}
        <strong className="font-semibold text-violet-600 tabular-nums">{display}</strong>
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
    "w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
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
