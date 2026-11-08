"use client";

import { useState } from "react";
import { SiteOverviewView, type SiteOverviewData } from "@/components/admin/site/SiteOverview";

/** Panoramica del sito con dati INVENTATI per le prove nel browser (scroll, larghezze). Solo con E2E_FIXTURES=1. */
const series = Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, value: (i * 7) % 23 }));
const data: SiteOverviewData = {
  views: 412,
  series,
  topPaths: [{ label: "/", value: 120 }, { label: "/prezzi", value: 80 }, { label: "/servizi", value: 60 }],
  topLocales: [{ label: "it", value: 300 }, { label: "en", value: 80 }, { label: "ro", value: 32 }],
  newMessages: 2,
  lastMessageAt: Date.UTC(2026, 10, 14, 9, 30),
  seoOverrides: 3,
  announcementActive: true,
};

export function SiteFixture() {
  const [days, setDays] = useState(30);
  return <SiteOverviewView data={data} days={days} setDays={setDays} />;
}
