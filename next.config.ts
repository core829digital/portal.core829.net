import type { NextConfig } from "next";

/**
 * Header di sicurezza statici, applicati a ogni risposta.
 * La Content-Security-Policy NON e' qui: richiede un nonce per richiesta
 * e viene generata in `src/proxy.ts`.
 */
const securityHeaders = [
  // Forza HTTPS per 2 anni (senza `preload`: non assumiamo impegni sul dominio).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Impedisce il MIME sniffing (un file caricato non puo' essere interpretato come script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Anti-clickjacking (la CSP `frame-ancestors` e' la difesa principale, questo e' il fallback).
  { key: "X-Frame-Options", value: "DENY" },
  // Il link magico contiene un segreto nell'URL: non deve mai uscire nel Referer.
  { key: "Referrer-Policy", value: "no-referrer" },
  // Disattiva funzioni del browser che il portale non usa.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), interest-cohort=()",
  },
  // Isolamento del contesto di navigazione.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Il portale e' privato: nessun motore di ricerca deve indicizzarlo o archiviarlo.
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Non rivelare lo stack tecnologico.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Le pagine cliente contengono dati personali: mai in cache (browser, CDN, proxy).
        source: "/c",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
