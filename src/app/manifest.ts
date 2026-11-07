import type { MetadataRoute } from "next";

/** Scheda "installabile" del portale (aggiungi alla schermata Home): nome, colori e icone del brand. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CORE829 · Portale clienti",
    short_name: "CORE829",
    description: "Area riservata ai clienti di CORE829 SRL.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#dd1a2b",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
