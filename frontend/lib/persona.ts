"use client";

export type PersonaId = "aiko" | "yuki";

export type Persona = {
  id: PersonaId;
  animeName: string;
  title: string;
  color: string;
  voice: string;
  greeting: string;
};

/** Anime hosts. Model = sorted /api/models entry by index; voice = Kokoro default. */
export const PERSONAS: Persona[] = [
  {
    id: "aiko",
    animeName: "Hoshizora Aiko",
    title: "Cheerful Idol",
    color: "#ff6ec7",
    voice: "af_heart",
    greeting: "Hey! I'm Aiko! Welcome to MindMate!",
  },
  {
    id: "yuki",
    animeName: "Kurogane Yuki",
    title: "Cool Kuudere",
    color: "#22d3ee",
    voice: "af_sky",
    greeting: "Hn. I'm Yuki. Welcome to MindMate.",
  },
];

export const RAHIM_LINE =
  "Rahim? Oh, he's the guy who hunts bugs all day but somehow never finds the one in my heart... because there isn't one, it's perfect.";

export type PresetKind = "hi" | "dance" | "hiphop" | "rahim" | "wow";

/** Pill preset buttons send canned prompts through the LIVE chat API. */
export const PRESET_PROMPTS: Record<PresetKind, { label: string; prompt: string }> = {
  hi: { label: "Say Hi", prompt: "say hi to me" },
  dance: { label: "Dance", prompt: "do a dance for me" },
  hiphop: { label: "Hip-Hop", prompt: "do the snake hip hop dance" },
  rahim: { label: "Who is Rahim?", prompt: "who is rahim" },
  wow: { label: "Surprise me", prompt: "wow, amaze me" },
};

/** Touch reactions when she bumps a widget (caption + static SFX). */
export const TOUCH_LINES: Record<string, string> = {
  "card-knowledge": "Ooh, my brain! Careful — it's full of Rahim facts.",
  "card-voice": "My voice! Press Dance and I'll prove it.",
  "card-stage": "The stage! That's where I live. Nice place, right?",
  "how-1": "Step one: you press, I perform. I'm very good at my job.",
  "how-2": "Two models, double trouble. Pick your favorite. (It's me.)",
  "how-3": "Yes, this. The walking-through-the-page thing. Iconic.",
  "cta-box": "The trailer ends here — but I don't! Come see the live app.",
  "cta-title": "That headline? She helped write it. Mostly by standing there.",
  "cta-title-char": "Careful with the letters — they're shy.",
  "hero-title": "That's my intro! Scroll and I'll walk you through it.",
  "hero-title-char": "Hey — the letters tickle!",
  "section-title": "Ooh, headlines. My favorite kind of bump.",
  "demo-panel": "Hey! That's my control panel. No touching… okay, touch.",
};

export const BOOP_LINES: Record<PersonaId, string[]> = {
  aiko: ["Eep! A boop?! …Do it again!", "Booped! My heart does a little spin kick!"],
  yuki: ["Hn. …Don't tell anyone I liked that.", "Boop acknowledged. Moving on."],
};

export const DODGE_LINE = "Whoa — personal space! …Okay, that was impressive.";

export const DODGE_AUDIO = "/audio/dodge.mp3";
export const boopAudio = (p: PersonaId) => [`/audio/boop-${p}-1.mp3`, `/audio/boop-${p}-2.mp3`];
export const touchAudio = (id: string) => `/audio/touch-${id}.mp3`;
