export type PersonaId = "aiko" | "yuki";

export type Persona = {
  id: PersonaId;
  animeName: string;
  title: string;
  color: string;
  voice: string;
  blurb: string;
  greeting: string;
};

/** Anime-based display names for the 2 VRM models (order matches sorted /api/models list). */
export const PERSONAS: Persona[] = [
  {
    id: "aiko",
    animeName: "Hoshizora Aiko",
    title: "Cheerful Idol",
    color: "#ff6ec7",
    voice: "af_heart",
    blurb: "Bubbly, warm, dances at every chance. Your landing-page host.",
    greeting: "Hey! I'm Aiko! Welcome to MindMate!",
  },
  {
    id: "yuki",
    animeName: "Kurogane Yuki",
    title: "Cool Kuudere",
    color: "#22d3ee",
    voice: "af_sky",
    blurb: "Calm, deadpan, secretly sweet. Same lines, colder delivery.",
    greeting: "Hn. I'm Yuki. Welcome to MindMate.",
  },
];

export const RAHIM_LINE =
  "Rahim? Oh, he's the guy who hunts bugs all day but somehow never finds the one in my heart... because there isn't one, it's perfect.";

export type DemoKind = "hi" | "dance" | "hiphop" | "rahim" | "wow" | "idle";

export type DemoAction = {
  kind: DemoKind;
  label: string;
  audio: (persona: PersonaId) => string;
  text: (persona: PersonaId) => string;
  animation: string | null;
  loop: boolean;
  emote: "idle" | "wave" | "nod" | "dance" | "think" | "bounce" | "shrug" | "point";
  expression: string | null;
};

export const DEMO_ACTIONS: DemoAction[] = [
  {
    kind: "hi",
    label: "Say Hi",
    audio: (p) => `/audio/hi-${p}.mp3`,
    text: (p) => (p === "aiko" ? "Hey! So amazing to see you! I'm Aiko, live on the landing page!" : "Hn. Hey. Yuki here. Don't make this weird."),
    animation: "Idle",
    loop: true,
    emote: "wave",
    expression: "happy",
  },
  {
    kind: "dance",
    label: "Dance",
    audio: () => `/audio/dance.mp3`,
    text: () => "Let's dance! I love moving with you!",
    animation: "Rumba Dancing",
    loop: true,
    emote: "dance",
    expression: "happy",
  },
  {
    kind: "hiphop",
    label: "Hip-Hop",
    audio: () => `/audio/hiphop.mp3`,
    text: () => "Snake hip hop style, let's go!",
    animation: "Snake Hip Hop Dance",
    loop: true,
    emote: "dance",
    expression: "happy",
  },
  {
    kind: "rahim",
    label: "Who is Rahim?",
    audio: () => `/audio/rahim.mp3`,
    text: () => RAHIM_LINE,
    animation: "Plotting",
    loop: true,
    emote: "point",
    expression: "happy",
  },
  {
    kind: "wow",
    label: "Surprise me",
    audio: () => `/audio/wow.mp3`,
    text: () => "Oh wow, that's absolutely incredible!",
    animation: "Crazy Gesture",
    loop: false,
    emote: "bounce",
    expression: "surprised",
  },
];

export const SCROLL_LINES: Record<string, string> = {
  walk: "Hey! I'm walking here! Watch the cards!",
  climb: "Up I go — best view of the features!",
  approach: "Coming through! Don't mind me… okay, mind me a little.",
  behind: "See? The cards go behind ME now. I'm the main character.",
  passthrough: "Watch this — I'm walking THROUGH the page!",
  pull: "I'm pulling this timeline myself. You're welcome.",
  bye: "Thanks for scrolling! Now go meet me in the app!",
};

/** Touch reactions when she bumps a widget (caption-only, no audio). */
export const TOUCH_LINES: Record<string, string> = {
  "card-knowledge": "Ooh, my brain! Careful — it's full of Rahim facts.",
  "card-voice": "My voice! Press Dance and I'll prove it.",
  "card-web": "My browser brain! When my facts run out I peek at the live internet, then tell you on stage.",
  "card-quests": "Shh — same me, background questing. Jules codes while I keep chatting, then I drop the PR link.",
  "card-stage": "The stage! That's where I live. Nice place, right?",
  "how-1": "Step one: you press, I perform. I'm very good at my job.",
  "how-2": "Two models, double trouble. Pick your favorite. (It's me.)",
  "how-3": "Yes, this. The walking-through-the-page thing. Iconic.",
  "cta-box": "The trailer ends here — but I don't! Come see the live app.",
  "demo-panel": "Hey! That's my control panel. No touching… okay, touch.",
  "model-aiko": "That's me! Cheerful idol, professional button-haver.",
  "model-yuki": "Hn. That's the other me. She's… fine, I guess.",
  "hero-title": "Hey — those are MY letters! …Okay, that was fun. Again!",
  "section-title": "Careful with the headlines, I just dusted those.",
};

export const BOOP_LINES: Record<PersonaId, string[]> = {
  aiko: ["Eep! A boop?! …Do it again!", "Booped! My heart does a little spin kick!"],
  yuki: ["Hn. …Don't tell anyone I liked that.", "Boop acknowledged. Moving on."],
};

export const DODGE_LINE = "Whoa — personal space! …Okay, that was impressive.";

// ---- voice maps (single voice, canonical filenames in public/audio) ----
export const THINK_AUDIO = "/audio/think.mp3";
export const DODGE_AUDIO = "/audio/dodge.mp3";
export const greetAudio = (p: PersonaId) => `/audio/greet-${p}.mp3`;
export const boopAudio = (p: PersonaId) => [`/audio/boop-${p}-1.mp3`, `/audio/boop-${p}-2.mp3`];
export const gagAudio = (key: string) => `/audio/gag-${key}.mp3`;
export const touchAudio = (id: string, kind: string) =>
  kind === "char"
    ? id.startsWith("hero")
      ? "/audio/touch-hero-title.mp3"
      : "/audio/touch-section-title.mp3"
    : `/audio/touch-${id}.mp3`;
