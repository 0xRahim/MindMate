/**
 * Shared intent router: realtime chat (Gemini) vs long agentic tasks (Jules).
 *
 * Jules sessions take minutes (QUEUED → PLANNING → IN_PROGRESS → COMPLETED),
 * so only explicit task-like messages go to Jules. Everything else stays on
 * the instant Gemini → hardcoded-rules path. Usable from server route
 * handlers and client components (no Node APIs, no secrets).
 */

const PREFIXES = ["/code", "/fix", "/task", "/jules", "/pr"];

/** Phrases that strongly signal a repo coding task. */
const TASK_PATTERNS: RegExp[] = [
  /\b(write|add|create)\b.{0,40}\b(tests?|test coverage)\b/,
  /\bfix\b.{0,40}\b(bug|error|failing|issue|crash)\b/,
  /\b(refactor|rewrite|migrate|upgrade)\b/,
  /\b(create|open|raise)\b.{0,20}\b(pull request|\bpr\b)\b/,
  /\bimplement\b.{0,40}\b(feature|endpoint|module|component)\b/,
  /\breview\b.{0,20}\b(code|pr|pull request|changes)\b/,
  /\bdebug\b.{0,30}\b(failure|error|issue|problem)\b/,
];

export function isAgenticTask(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (!t) return false;
  if (PREFIXES.some((p) => t === p || t.startsWith(p + " ") || t.startsWith(p + ":"))) return true;
  // Short greetings / chit-chat never route to Jules.
  if (t.length < 24) return false;
  return TASK_PATTERNS.some((re) => re.test(t));
}

/** Strip the command prefix ("/code …" → "…") before sending to Jules. */
export function stripTaskPrefix(message: string): string {
  const t = message.trim();
  for (const p of PREFIXES) {
    if (t.toLowerCase() === p) return "";
    if (t.toLowerCase().startsWith(p + " ")) return t.slice(p.length).trim();
    if (t.toLowerCase().startsWith(p + ":")) return t.slice(p.length + 1).trim();
  }
  return t;
}
