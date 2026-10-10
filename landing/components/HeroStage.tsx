"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { LandingEngine } from "@/lib/landing-engine";

export type HeroStageHandle = {
  engine: () => LandingEngine | null;
};

type Props = {
  caption: string;
  onCaption: (t: string) => void;
  onAmp: (n: number) => void;
  onModels: (l: { name: string; url: string }[]) => void;
  onAnims: (l: { name: string; url: string }[]) => void;
  onStatus: (s: string) => void;
  onNowPlaying: (n: string | null) => void;
  onSpeaking: (b: boolean) => void;
  onMascotScreen: (x: number, y: number, scale: number) => void;
};

const HeroStage = forwardRef<HeroStageHandle, Props>(function HeroStage(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LandingEngine | null>(null);
  // mirror latest callbacks so the engine never holds a stale closure
  const cbRef = useRef(props);
  cbRef.current = props;

  useImperativeHandle(ref, () => ({
    engine: () => engineRef.current,
  }));

  useEffect(() => {
    if (!wrapRef.current || engineRef.current) return;
    const engine = new LandingEngine(wrapRef.current, {
      onCaption: (t) => cbRef.current.onCaption(t),
      onAmp: (n) => cbRef.current.onAmp(n),
      onModels: (l) => cbRef.current.onModels(l),
      onAnims: (l) => cbRef.current.onAnims(l),
      onStatus: (s) => cbRef.current.onStatus(s),
      onNowPlaying: (n) => cbRef.current.onNowPlaying(n),
      onSpeaking: (b) => cbRef.current.onSpeaking(b),
      onMascotScreen: (x, y, s) => cbRef.current.onMascotScreen(x, y, s),
    });
    engineRef.current = engine;
    void engine.fetchAssets();
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={wrapRef} className="h-full w-full [&>canvas]:h-full [&>canvas]:w-full" />
      {/* caption bubble is rendered by parent so it can animate/transform */}
    </div>
  );
});

export default HeroStage;
