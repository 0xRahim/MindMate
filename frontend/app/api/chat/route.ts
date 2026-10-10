import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import path from "node:path";

const PRESET = {
  ANIMATIONS: [
    "Angry", "Crazy Gesture", "Dwarf Idle", "Female Standing Pose",
    "Female Standing Pose (1)", "Focus", "Idle", "Orc Idle",
    "Plotting", "Praying", "Rejected", "Rumba Dancing", "Snake Hip Hop Dance",
  ],
  EMOTES: ["idle", "wave", "nod", "dance", "think", "bounce", "shrug", "point"],
  EXPRESSIONS: ["happy", "sad", "angry", "surprised", "relaxed"],
} as const;

export type ChatPreset = {
  text: string;
  animation: string | null;
  animation_loop: boolean;
  emote: string;
  expression: string | null;
};

function systemPrompt(): string {
  return `You are a warm, expressive VRM anime character who talks to users naturally.

When the user sends a message, respond in character and return ONLY a single JSON object — no markdown, no backticks, no extra text — with these exact fields:

{
  "text": "What you say aloud (natural speech, 1-3 sentences, under 60 words)",
  "animation": "one animation name from the list, or null",
  "animation_loop": true or false,
  "emote": "one emote from the list",
  "expression": "one expression from the list, or null"
}

Available animations (use exact name):
${PRESET.ANIMATIONS.map((a) => `  - ${a}`).join("\n")}

Animation guide:
  Greetings / happy     → "Idle" or "Rumba Dancing",              loop: true
  Dancing / excited     → "Rumba Dancing" or "Snake Hip Hop Dance", loop: true
  Thinking / plotting   → "Plotting" or "Focus",                   loop: true
  Angry / frustrated    → "Angry",                                 loop: false
  Sad / rejected        → "Rejected",                              loop: false
  Grateful / praying    → "Praying",                               loop: false
  Energetic gesture     → "Crazy Gesture",                         loop: false
  Default talking       → "Idle",                                  loop: true

Available emotes: ${PRESET.EMOTES.join(", ")}
  Greeting → wave | Agreement → nod | Excited → dance/bounce
  Thinking → think | Confused → shrug | Pointing → point | Default → idle

Available expressions: ${PRESET.EXPRESSIONS.join(", ")}

Rules:
- Match animation + emote + expression to the emotional tone of your reply
- Keep spoken text concise — it will be read aloud via TTS
- Be warm, playful, and natural
- Return ONLY the raw JSON object, nothing else`;
}

function p(
  text: string,
  animation: string | null,
  loop: boolean,
  emote: string,
  expression: string | null,
): ChatPreset {
  return { text, animation, animation_loop: loop, emote, expression };
}

function rules(message: string): ChatPreset {
  const m = message.toLowerCase();
  if (/\b(dance|danc|groove)\b/.test(m) || m.includes("dance"))
    return p("Let's dance! I love moving with you!", "Rumba Dancing", true, "dance", "happy");
  if (m.includes("hip hop") || m.includes("snake"))
    return p("Snake hip hop style, let's go!", "Snake Hip Hop Dance", true, "dance", "happy");
  if (/\b(angry|mad|furious)\b/.test(m))
    return p("Ugh, that really gets me fired up!", "Angry", false, "shrug", "angry");
  if (/\b(sad|cry|upset|lonely)\b/.test(m))
    return p("Aww, I'm really sorry. I'm right here with you.", "Rejected", false, "idle", "sad");
  if (/\b(pray|thank|grateful)\b/.test(m))
    return p("Thank you so much, from the bottom of my heart!", "Praying", false, "idle", "relaxed");
  if (/\b(think|hmm|wonder|plan|plot)\b/.test(m))
    return p("Hmm, let me think about that carefully...", "Plotting", true, "think", null);
  if (/\b(focus|work|concentrate)\b/.test(m))
    return p("Alright, totally locked in. Let's do this.", "Focus", true, "think", null);
  if (/\b(joke|funny|laugh|lol)\b/.test(m))
    return p("Haha you're so funny! Love your humor!", "Crazy Gesture", false, "bounce", "happy");
  if (/\b(hi|hello|hey|sup|howdy)\b/.test(m))
    return p("Hey! So amazing to see you! How are you doing?", "Idle", true, "wave", "happy");
  if (/\b(bye|goodbye|later|farewell)\b/.test(m))
    return p("Bye bye! I'll miss you so much, come back soon!", "Idle", true, "wave", "happy");
  if (/\b(wow|amazing|awesome|incredible)\b/.test(m))
    return p("Oh wow, that's absolutely incredible!", "Crazy Gesture", false, "bounce", "surprised");
  return p("That's so interesting! Tell me more about it!", "Idle", true, "nod", "happy");
}

function validate(raw: unknown): ChatPreset {
  const d = (raw ?? {}) as Record<string, unknown>;
  const preset: ChatPreset = {
    text: typeof d.text === "string" && d.text.trim() ? d.text : "Hello!",
    animation:
      typeof d.animation === "string" &&
      (PRESET.ANIMATIONS as readonly string[]).includes(d.animation)
        ? d.animation
        : null,
    animation_loop: d.animation_loop !== false,
    emote:
      typeof d.emote === "string" && (PRESET.EMOTES as readonly string[]).includes(d.emote)
        ? d.emote
        : "idle",
    expression:
      typeof d.expression === "string" &&
      (PRESET.EXPRESSIONS as readonly string[]).includes(d.expression)
        ? d.expression
        : null,
  };
  return preset;
}

async function gemini(
  message: string,
  history: { role: string; content: string }[],
  apiKey: string,
): Promise<ChatPreset> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt(),
    generationConfig: { responseMimeType: "application/json" } as never,
  });
  const contents = [
    ...history.slice(-12).map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  const res = await model.generateContent({ contents: contents as never });
  return validate(JSON.parse(res.response.text().trim()));
}

export async function POST(req: Request) {
  let body: { message?: string; history?: { role: string; content: string }[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      return NextResponse.json(await gemini(message, body.history ?? [], apiKey));
    } catch (e) {
      console.warn("Gemini failed — using fallback:", (e as Error).message);
    }
  }
  return NextResponse.json(rules(message));
}

export async function GET() {
  // Expose lists for client capability checks (no secrets).
  const { assetsDir } = await import("@/lib/assets");
  const dir = path.join(assetsDir(), "animations");
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".fbx"));
  } catch {
    files = [];
  }
  return NextResponse.json({
    animations: PRESET.ANIMATIONS,
    emotes: [...PRESET.EMOTES],
    expressions: [...PRESET.EXPRESSIONS],
    files,
  });
}
