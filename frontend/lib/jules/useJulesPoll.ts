"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getJulesSession,
  listJulesActivities,
  type JulesActivity,
  type JulesState,
} from "@/lib/jules/api";

export type WatchedSession = {
  id: string;
  title?: string;
  url?: string;
  state?: JulesState;
  prUrl?: string;
  prTitle?: string;
  lastAgentMessage?: string;
  done: boolean;
  error?: string;
};

const POLL_MS = 10000;
const MAX_WATCH_MS = 30 * 60 * 1000;
const TERMINAL: JulesState[] = ["COMPLETED", "FAILED"];

function prFromSession(s: { outputs?: { pullRequest?: { url: string; title: string } }[] }) {
  const pr = s.outputs?.find((o) => o.pullRequest)?.pullRequest;
  return pr ? { prUrl: pr.url, prTitle: pr.title } : {};
}

function lastAgentText(activities: JulesActivity[]): string | undefined {
  for (let i = activities.length - 1; i >= 0; i--) {
    const m = activities[i].agentMessaged?.agentMessage?.trim();
    if (m) return m.length > 300 ? m.slice(0, 300) + "…" : m;
  }
  return undefined;
}

/**
 * Poll Jules sessions until COMPLETED/FAILED and notify in chat.
 * Chat stays responsive — polling is a background 10s tick per session.
 */
export function useJulesPoll(opts: {
  onEvent: (role: "user" | "bot" | "sys", text: string) => void;
}) {
  const [sessions, setSessions] = useState<WatchedSession[]>([]);
  const startedAt = useRef(new Map<string, number>());
  const cbRef = useRef(opts.onEvent);
  cbRef.current = opts.onEvent;

  const patch = useCallback((id: string, p: Partial<WatchedSession>) => {
    setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)));
  }, []);

  const pollOne = useCallback(
    async (id: string) => {
      const started = startedAt.current.get(id) ?? Date.now();
      if (Date.now() - started > MAX_WATCH_MS) {
        patch(id, { done: true, error: "Timed out after 30m." });
        cbRef.current("sys", `Jules task ${id} timed out after 30 minutes. Check Jules directly for status.`);
        return;
      }
      let s;
      try {
        s = await getJulesSession(id);
      } catch (e) {
        patch(id, { error: (e as Error).message });
        return;
      }
      const state = s.state ?? "STATE_UNSPECIFIED";
      patch(id, {
        title: s.title,
        url: s.url,
        state,
        ...prFromSession(s),
      });
      if (!TERMINAL.includes(state)) {
        patch(id, { error: undefined });
        return;
      }
      patch(id, { done: true });
      if (state === "FAILED") {
        let reason = "task failed";
        try {
          const a = await listJulesActivities(id, 10);
          const fail = [...a.activities].reverse().find((x) => x.sessionFailed)?.sessionFailed as
            | { reason?: string }
            | undefined;
          if (fail?.reason) reason = fail.reason;
        } catch { /* keep generic reason */ }
        patch(id, { error: reason });
        cbRef.current("sys", `Jules task failed: ${reason}`);
        return;
      }
      // COMPLETED — surface PR link + last agent summary.
      let agentMsg: string | undefined;
      try {
        const a = await listJulesActivities(id, 30);
        agentMsg = lastAgentText(a.activities);
      } catch { /* PR link alone is enough */ }
      const pr = prFromSession(s);
      patch(id, { ...pr, lastAgentMessage: agentMsg });
      const prLine = pr.prUrl ? `PR: ${pr.prUrl} — ${pr.prTitle ?? ""}` : "No PR was created.";
      cbRef.current("sys", `✅ Jules done${s.title ? ` (${s.title})` : ""}. ${prLine}`);
      if (agentMsg) cbRef.current("bot", agentMsg);
    },
    [patch],
  );

  // background tick for all unfinished sessions
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  useEffect(() => {
    const t = setInterval(() => {
      for (const s of sessionsRef.current) {
        if (!s.done) void pollOne(s.id);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [pollOne]);

  const watch = useCallback(
    (id: string) => {
      if (!id) return;
      let isNew = false;
      setSessions((ss) => {
        if (ss.some((s) => s.id === id)) return ss;
        isNew = true;
        return [...ss, { id, done: false }];
      });
      // poll immediately (setState is async — check ref instead)
      if (!startedAt.current.has(id)) {
        startedAt.current.set(id, Date.now());
        void pollOne(id);
      } else if (isNew) {
        void pollOne(id);
      }
    },
    [pollOne],
  );

  const unwatch = useCallback((id: string) => {
    startedAt.current.delete(id);
    setSessions((ss) => ss.filter((s) => s.id !== id));
  }, []);

  const activeCount = sessions.filter((s) => !s.done).length;

  return { sessions, watch, unwatch, activeCount };
}
