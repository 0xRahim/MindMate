"use client";

export type EdgeItem = {
  label: string;
  hint?: string;
  href?: string;
  onSelect?: () => void;
};

/** Minimal corner link column (Oobi-style edge UI). */
export default function EdgeLinks({
  title,
  items,
  align = "left",
}: {
  title: string;
  items: EdgeItem[];
  align?: "left" | "right";
}) {
  const text = align === "right" ? "text-right" : "text-left";
  return (
    <nav className={`pointer-events-auto ${text}`} aria-label={title}>
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-white/85">{title}</div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.label}>
            {it.href ? (
              <a
                href={it.href}
                className="text-[13px] font-medium text-white/60 transition hover:text-white"
              >
                {it.label}
              </a>
            ) : it.onSelect ? (
              <button
                onClick={it.onSelect}
                title={it.hint}
                className="text-[13px] font-medium text-white/60 transition hover:translate-x-[2px] hover:text-white"
              >
                {it.label}
              </button>
            ) : (
              <span className="text-[13px] font-medium text-white/40">{it.label}</span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
