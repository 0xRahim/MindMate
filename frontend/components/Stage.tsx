"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StageEngine, type ChatState } from "@/lib/stage/engine";
import type { UIMessage } from "@/components/ChatBubble";

export type StageHandle = {
  engine: () => StageEngine | null;
};

type Props = {
  onChatState: (s: ChatState) => void;
  onCaption: (t: string) => void;
  onNowPlaying: (n: string | null) => void;
  onAnimStatus: (s: string) => void;
  onTts: (label: string, connected: boolean) => void;
  onTtsMsg: (s: string) => void;
  onAmp: (n: number) => void;
  onModels: (l: { name: string; url: string }[]) => void;
  onAnims: (l: { name: string; url: string }[]) => void;
  onVrmStatus: (s: string) => void;
  onStageStatus: (s: string) => void;
  onMessage: (role: UIMessage["role"], text: string) => void;
  onMascotScreen: (x: number, y: number, scale: number) => void;
};

const Stage = forwardRef<StageHandle, Props>(function Stage(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StageEngine | null>(null);
  // mirror latest callbacks so the engine never holds a stale closure
  const cbRef = useRef(props);
  cbRef.current = props;

  useImperativeHandle(ref, () => ({
    engine: () => engineRef.current,
  }));

  useEffect(() => {
    if (!wrapRef.current || engineRef.current) return;
    const engine = new StageEngine(wrapRef.current, {
      onChatState: (s) => cbRef.current.onChatState(s),
      onCaption: (t) => cbRef.current.onCaption(t),
      onNowPlaying: (n) => cbRef.current.onNowPlaying(n),
      onAnimStatus: (s) => cbRef.current.onAnimStatus(s),
      onTts: (l, c) => cbRef.current.onTts(l, c),
      onTtsMsg: (s) => cbRef.current.onTtsMsg(s),
      onAmp: (n) => cbRef.current.onAmp(n),
      onModels: (l) => cbRef.current.onModels(l),
      onAnims: (l) => cbRef.current.onAnims(l),
      onVrmStatus: (s) => cbRef.current.onVrmStatus(s),
      onStageStatus: (s) => cbRef.current.onStageStatus(s),
      onMessage: (r, t) => cbRef.current.onMessage(r, t),
      onMascotScreen: (x, y, s) => cbRef.current.onMascotScreen(x, y, s),
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // resize listener lives here; asset fetch + VRM drag-drop are owned by the page.
  useEffect(() => {
    const onResize = () => engineRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={wrapRef} className="h-full w-full [&>canvas]:h-full [&>canvas]:w-full" />
    </div>
  );
});

export default Stage;
