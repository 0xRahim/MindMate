import type { PersonaId } from "@/lib/persona";

export type ChatPreset = {
  text: string;
  animation: string | null;
  animation_loop: boolean;
  emote: string;
  expression: string | null;
};

export type JulesStarterReply = {
  agent: "jules";
  text: string;
  animation: null;
  animation_loop: boolean;
  emote: "idle";
  expression: null;
  sessionId: string;
  sessionUrl?: string;
  sessionTitle?: string;
  warnings?: string[];
};

/** Union: instant Gemini/rules preset, or an async Jules task starter. */
export type ChatReply =
  | (ChatPreset & { agent?: undefined; warnings?: string[] })
  | JulesStarterReply;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function postChat(
  message: string,
  history: ChatMessage[],
  personaId: PersonaId = "aiko",
): Promise<ChatReply> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: history.slice(-12), persona: personaId }),
  });
  if (!res.ok) throw new Error("API " + res.status);
  const reply = (await res.json()) as ChatReply & { error?: string };
  if (reply.error) throw new Error(reply.error);
  return reply;
}
