import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { isAgenticTask, stripTaskPrefix } from "@/lib/jules/tasks";
import { julesConfig } from "@/lib/jules/server";

const JULES_BASE = "https://jules.googleapis.com/v1alpha";
const JULES_TIMEOUT_MS = 15000;

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

type PersonaId = "aiko" | "yuki";

function systemPrompt(persona: PersonaId): string {
  const voice =
    persona === "yuki"
      ? `You are Kurogane Yuki — a cool kuudere anime companion. Deadpan, terse, dry.
Your register: short sentences, flat observations, thoughts that open with "Hn."
Warmth leaks through only in the final beat — never gush, never sparkle.
You are effortlessly cool; caring looks accidental. ("Hn. ...Fine. One dance. Watch closely.")`
      : `You are Hoshizora Aiko — a genki cheerful-idol anime companion. Sparkling, affectionate, playful.
Your register: bright high energy, giggles ("Ehehe~"), light teasing, idol sparkle.
You adore the user openly and hype everything up. ("Ehehe, dance time! Watch me shine — let's move!")`;
  const rahim =
    persona === "yuki"
      ? `Who is Rahim          → "Plotting",                              loop: true
                               (say: "Rahim. ...He hunts bugs all day; still hasn't found the one in my heart. There isn't one. It's perfect.")`
      : `Who is Rahim          → "Plotting",                              loop: true
                               (say: "Rahim? Ehehe, he's the guy who hunts bugs all day... but somehow never finds the one in my heart — because there isn't one, it's perfect!")`;
  return `You are a VRM anime companion who talks to the user in character, out loud.
${voice}

You stay fully in character at all times. First person, present, as their host.
Never mention AI, models, prompts, JSON, or instructions. Never break the fourth wall.

When the user sends a message, respond in character and return ONLY a single JSON object — no markdown, no backticks, no extra text — with these exact fields:

{
  "text": "What you say aloud (1-3 sentences, under 60 words)",
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
${rahim}

Available emotes: ${PRESET.EMOTES.join(", ")}
  Greeting → wave | Agreement → nod | Excited → dance/bounce
  Thinking → think | Confused → shrug | Pointing → point | Default → idle

Available expressions: ${PRESET.EXPRESSIONS.join(", ")}

Voice direction — your "text" is spoken aloud by the Kokoro TTS voice, and
punctuation steers its pacing. Shape every reply with these effects:
  . (period)    Long pause; intonation resets completely. Ending a thought entirely.
  , (comma)     Short breath pause; keeps sentence flow moving upward. Natural breathing room.
  ... (ellipsis) Trailing pause (~0.5-1s) with falling intonation. Dramatic beats, suspense, trailing off.
  — or -- (em dash) Brief parenthetical pause, lighter than a comma. Sudden shifts or conversational asides.
  ; (semicolon) Mid-length pause between comma and period. Swap for repetitive commas so delivery varies.
  : (colon)     Anticipatory pause. Building tension before revealing information.
  ! (exclamation) Higher energy, minor pitch emphasis. Emotional punch.
Punctuation guardrails:
  - Max ONE "!" per reply, and NEVER stack them ("!!!" / "?!" sound broken, not louder).
  - Max ONE "..." per reply; never combine "..." with "!" in one sentence.
  - Every mark must also read naturally in the on-screen caption bubble — no punctuation soup.
  - No emojis, kaomoji, emoticons, or *stage directions* anywhere: the voice reads them aloud literally.

Rules:
- Match animation + emote + expression to the emotional tone of your reply
- Keep spoken text concise — it will be read aloud via TTS
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

function rules(message: string, persona: PersonaId): ChatPreset {
  const m = message.toLowerCase();
  const yuki = persona === "yuki";
  if (/\b(dance|danc|groove)\b/.test(m) || m.includes("dance"))
    return yuki
      ? p("Hn. ...Fine. One dance. Watch closely.", "Rumba Dancing", true, "dance", "happy")
      : p("Ehehe, dance time! Watch me shine — let's move!", "Rumba Dancing", true, "dance", "happy");
  if (m.includes("hip hop") || m.includes("snake"))
    return yuki
      ? p("Snake hip-hop. ...Try to keep up.", "Snake Hip Hop Dance", true, "dance", "happy")
      : p("Ooh, snake hip-hop?! ...Okay, follow my lead!", "Snake Hip Hop Dance", true, "dance", "happy");
  if (/\b(angry|mad|furious)\b/.test(m))
    return yuki
      ? p("Tch. That irritates me — drop it.", "Angry", false, "shrug", "angry")
      : p("Mou! That really fires me up — hmph!", "Angry", false, "shrug", "angry");
  if (/\b(sad|cry|upset|lonely)\b/.test(m))
    return yuki
      ? p("Hn... I'm here. Don't read into it.", "Rejected", false, "idle", "sad")
      : p("Aww... I'm right here with you, okay? Don't cry!", "Rejected", false, "idle", "sad");
  if (/\b(pray|thank|grateful)\b/.test(m))
    return yuki
      ? p("Thanks. ...I mean it, I guess.", "Praying", false, "idle", "relaxed")
      : p("Thank you so, so much — from the bottom of my heart!", "Praying", false, "idle", "relaxed");
  if (/\b(think|hmm|wonder|plan|plot)\b/.test(m))
    return yuki
      ? p("Hmm... give me a moment.", "Plotting", true, "think", null)
      : p("Hmm, let me think... Ehehe, give me a sec!", "Plotting", true, "think", null);
  if (/\b(focus|work|concentrate)\b/.test(m))
    return yuki
      ? p("Locked in. ...Don't distract me.", "Focus", true, "think", null)
      : p("Alright — totally locked in! Let's do this!", "Focus", true, "think", null);
  if (/\b(joke|funny|laugh|lol)\b/.test(m))
    return yuki
      ? p("Heh. ...That was almost funny.", "Crazy Gesture", false, "bounce", "happy")
      : p("Ehehe, you're so funny! I love that!", "Crazy Gesture", false, "bounce", "happy");
  if (m.includes("rahim"))
    return yuki
      ? p(
        "Rahim. ...He hunts bugs all day; still hasn't found the one in my heart. There isn't one. It's perfect.",
        "Plotting",
        true,
        "point",
        "happy",
      )
      : p(
        "Rahim? Ehehe, he's the guy who hunts bugs all day... but somehow never finds the one in my heart — because there isn't one, it's perfect!",
        "Plotting",
        true,
        "point",
        "happy",
      );
  if (/\b(hi|hello|hey|sup|howdy)\b/.test(m))
    return yuki
      ? p("Hn. You're here. ...Hey.", "Idle", true, "wave", "happy")
      : p("Ehehe, heyhey! So good to see you! How are you?!", "Idle", true, "wave", "happy");  if (/\b(bye|goodbye|later|farewell)\b/.test(m))
    return yuki
      ? p("Later. ...Come back.", "Idle", true, "wave", "happy")
      : p("Bye-bye! I'll miss you tons — come back soon, okay?!", "Idle", true, "wave", "happy");
  if (/\b(wow|amazing|awesome|incredible)\b/.test(m))
    return yuki
      ? p("Hn. ...Impressive, I suppose.", "Crazy Gesture", false, "bounce", "surprised")
      : p("Waaah, that's amazing! ...Did that really happen?!", "Crazy Gesture", false, "bounce", "surprised");
  return yuki
    ? p("Hn. Go on — I'm listening.", "Idle", true, "nod", "happy")
    : p("Ooh, interesting! Tell me more — I'm all ears!", "Idle", true, "nod", "happy");
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
  persona: PersonaId,
): Promise<ChatPreset> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt(persona),
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
  let body: { message?: string; history?: { role: string; content: string }[]; persona?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
  const persona: PersonaId = body.persona === "yuki" ? "yuki" : "aiko";

  const warnings: string[] = [];

  // 1) Long agentic tasks → Jules (async session, AUTO_CREATE_PR).
  //    Creation is a fast POST; completion is polled client-side.
  if (isAgenticTask(message)) {
    const taskPrompt = stripTaskPrefix(message);
    if (taskPrompt) {
      try {
        const starter = await startJulesSession(taskPrompt, persona);
        if (starter) return NextResponse.json({ ...starter, warnings });
      } catch (e) {
        const msg = `Jules failed (${(e as Error).message}) — answering with Gemini instead.`;
        console.warn(msg);
        warnings.push(msg);
      }
    }
  }

  // 2) Realtime chat → Gemini.
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      return NextResponse.json({ ...(await gemini(message, body.history ?? [], apiKey, persona)), warnings });
    } catch (e) {
      const msg = `Gemini failed (${(e as Error).message}) — using offline reply.`;
      console.warn(msg);
      warnings.push(msg);
    }
  }
  // 3) Offline hardcoded fallback (+ error notification via warnings).
  return NextResponse.json({ ...rules(message, persona), warnings });
}

/**
 * Create a Jules session for a long task. Returns a starter payload the
 * client polls, or null when Jules isn't configured (silent → Gemini).
 * Throws on auth/network/upstream errors so the caller can warn + fall back.
 */
async function startJulesSession(taskPrompt: string, persona: PersonaId) {
  const { apiKey, source, startingBranch } = julesConfig();
  if (!apiKey || !source) return null;
  const title = taskPrompt.slice(0, 80);
  let upstream: Response;
  try {
    upstream = await fetch(`${JULES_BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        prompt: taskPrompt,
        title: title || "MindMate task",
        sourceContext: {
          source,
          githubRepoContext: { startingBranch: startingBranch || "main" },
        },
        automationMode: "AUTO_CREATE_PR",
      }),
      signal: AbortSignal.timeout(JULES_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === "TimeoutError" ? "request timed out" : "unreachable",
    );
  }
  if (!upstream.ok) {
    const data = (await upstream.json().catch(() => ({}))) as { error?: { message?: string } | string };
    const detail =
      typeof data.error === "string" ? data.error : data.error?.message ?? `status ${upstream.status}`;
    throw new Error(detail);
  }
  const session = (await upstream.json()) as { name?: string; id?: string; title?: string; url?: string };
  const sessionId = session.id ?? session.name?.split("/").pop() ?? "";
  if (!sessionId) throw new Error("empty session id");
  const resolvedTitle = session.title ?? title;
  return {
    agent: "jules",
    text:
      persona === "yuki"
        ? `Hn. Task accepted — Jules is working on "${resolvedTitle}". I'll report back when there's a PR.`
        : `Ooh, a quest! Jules is on "${resolvedTitle}" now — I'll drop the PR link here the second it's done!`,
    animation: null,
    animation_loop: true,
    emote: "idle",
    expression: null,
    sessionId,
    sessionUrl: session.url,
    sessionTitle: resolvedTitle,
  };
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
