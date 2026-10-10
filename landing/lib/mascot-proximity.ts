"use client";

import { useEffect, useRef } from "react";

export type MascotPoint = { x: number; y: number; scale: number };
export type TouchInfo = { id: string; kind: string };

type Tracked = {
  el: HTMLElement;
  id: string;
  kind: string;
  maxPush: number;
  lastTouch: number;
};

/**
 * Proximity brain: every frame, push [data-interactive] elements away from
 * the mascot's screen position and report touches. Transform-only writes
 * (CSS vars) — no layout thrash, no react state per frame.
 */
export function useMascotProximity(
  mascotRef: React.MutableRefObject<MascotPoint>,
  onTouch: (t: TouchInfo) => void,
  active: boolean,
) {
  const cbRef = useRef(onTouch);
  cbRef.current = onTouch;

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let tracked: Tracked[] = [];
    let rescanAt = 0;
    const touchCooldown = new Map<string, number>();

    const rescan = () => {
      const nodes = document.querySelectorAll<HTMLElement>("[data-interactive]");
      tracked = [...nodes].map((el) => ({
        el,
        id: el.dataset.interactiveId ?? el.dataset.interactive ?? "?",
        kind: el.dataset.interactive ?? "widget",
        maxPush: el.dataset.kind === "char" ? 16 : 52,
        lastTouch: 0,
      }));
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (now > rescanAt) {
        rescan();
        rescanAt = now + 800;
      }
      const m = mascotRef.current;
      if (m.x < -500) return; // engine not reporting yet
      const small = innerWidth < 640;
      for (const t of tracked) {
        if (!t.el.isConnected) continue;
        const r = t.el.getBoundingClientRect();
        // skip offscreen widgets
        if (r.bottom < -80 || r.top > innerHeight + 80) {
          t.el.style.setProperty("--prox", "0");
          continue;
        }
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - m.x;
        const dy = cy - m.y;
        const dist = Math.hypot(dx, dy) || 1;
        const radius = (small ? 0.6 : 1) * (Math.max(r.width, r.height) / 2 + 150 * m.scale);
        const prox = Math.max(0, Math.min(1, 1 - dist / radius));
        t.el.style.setProperty("--prox", prox.toFixed(3));
        if (prox > 0.02) {
          const f = Math.pow(prox, 2) * t.maxPush;
          t.el.style.setProperty("--push-x", `${((dx / dist) * f).toFixed(1)}px`);
          t.el.style.setProperty("--push-y", `${((dy / dist) * f).toFixed(1)}px`);
        } else {
          t.el.style.setProperty("--push-x", "0px");
          t.el.style.setProperty("--push-y", "0px");
        }
        // touch: close + shared 7s cooldown per id (chars share one id)
        const last = touchCooldown.get(t.id) ?? 0;
        if (prox > 0.88 && now - last > 7000) {
          touchCooldown.set(t.id, now);
          t.el.classList.remove("touched");
          void t.el.offsetWidth;
          t.el.classList.add("touched");
          setTimeout(() => t.el.classList.remove("touched"), 900);
          cbRef.current({ id: t.id, kind: t.kind });
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, mascotRef]);
}
