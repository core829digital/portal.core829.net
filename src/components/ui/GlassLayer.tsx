"use client";

import { GlassEnhancer } from "@/components/ui/LiquidGlass";

/** Liquid glass su pulsanti, barre, pannelli, card e contenitori di form di tutto il sito. */
export default function GlassLayer() {
  return <GlassEnhancer selector={`.btn-glass, .glass-bar, .glass-panel, [data-slot="card"], form, [class*="rounded-3xl"], [class*="rounded-2xl"]`} />;
}
