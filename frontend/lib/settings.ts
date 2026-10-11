"use client";

export type Settings = {
  voice: string;
  speed: number;
  loop: boolean;
  blinkAuto: boolean;
  ttsUrl: string;
};

export const SETTINGS_KEY = "mindmate:settings:v2";

/** Read persisted settings (partial — caller merges over its own defaults). */
export function loadSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const d = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Settings> = {};
    if (typeof d.voice === "string" && d.voice) out.voice = d.voice;
    if (typeof d.speed === "number" && isFinite(d.speed))
      out.speed = Math.min(2, Math.max(0.5, d.speed));
    if (typeof d.loop === "boolean") out.loop = d.loop;
    if (typeof d.blinkAuto === "boolean") out.blinkAuto = d.blinkAuto;
    if (typeof d.ttsUrl === "string" && d.ttsUrl) out.ttsUrl = d.ttsUrl;
    return out;
  } catch {
    return {};
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage full/blocked — settings just don't persist */
  }
}
