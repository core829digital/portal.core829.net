import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
