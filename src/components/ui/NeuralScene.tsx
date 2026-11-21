"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { GlassScene } from "@/components/ui/LiquidGlass";
import NeuralNoise from "@/components/ui/neural-noise";

/** Nero Pista (#141416) in componenti 0-1. */
const NOISE_BG = [0.0784, 0.0784, 0.0863] as const;

/**
 * Scena liquid-glass con lo sfondo a raggi di energia di CORE829: il flusso neurale è disegnato in tempo reale
 * (segue il puntatore) da un canvas WebGL e la scena lo usa come sorgente live; gli elementi `glass` lo rifrangono.
 */
export function NeuralScene({ children, className, dim = 0.12 }: { children: ReactNode; className?: string; dim?: number }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  return (
    <GlassScene
      className={className}
      backdrop="/brand/neural-flow-poster.jpg"
      source={canvas}
      dim={dim}
      style={{ "--image": "url(/brand/neural-flow-poster.jpg)" } as CSSProperties}
    >
      <NeuralNoise background={NOISE_BG} onCanvas={setCanvas} resolution={0.8} maxDpr={1.5} className="opacity-0" />
      {children}
    </GlassScene>
  );
}
