import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk, Unbounded } from "next/font/google";
import "./globals.css";

// Font del brand CORE829 (gli stessi di core829.net), serviti dal nostro dominio da next/font.
const spaceGrotesk = Space_Grotesk({ variable: "--font-space", subsets: ["latin"] });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

// Ogni risposta ha un nonce CSP diverso, quindi nessuna pagina puo' essere pre-generata
// e messa in cache: tutto viene renderizzato a ogni richiesta. Il portale mostra comunque
// dati personali, che non devono mai finire in una cache condivisa.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Portale clienti CORE829", template: "%s · CORE829" },
  description: "Area riservata ai clienti di CORE829 SRL.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      className={`${spaceGrotesk.variable} ${unbounded.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
