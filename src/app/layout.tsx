import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { canonicalAppUrl } from "@/lib/appUrl";
import "./globals.css";

// Stesso stack di Andromedia Web (repo andromediaweb.it) e del sito core829.net: "Saans" se installato sul
// dispositivo, altrimenti Inter self-hosted da next/font (font variabile: normale, bold e ogni peso intermedio),
// piu' JetBrains Mono per i dettagli tecnici. I token --font-* sono in globals.css.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Ogni risposta ha un nonce CSP diverso, quindi nessuna pagina puo' essere pre-generata
// e messa in cache: tutto viene renderizzato a ogni richiesta. Il portale mostra comunque
// dati personali, che non devono mai finire in una cache condivisa.
export const dynamic = "force-dynamic";

const DESCRIPTION = "Area riservata ai clienti di CORE829 SRL: progetti, fatture, abbonamenti e documenti in un unico posto.";

export const metadata: Metadata = {
  // Base per gli indirizzi assoluti di icone e immagini di anteprima (WhatsApp, email, social).
  metadataBase: new URL(canonicalAppUrl(process.env.NEXT_PUBLIC_APP_URL ?? "")),
  title: { default: "Portale clienti CORE829", template: "%s · CORE829" },
  description: DESCRIPTION,
  applicationName: "CORE829 · Portale clienti",
  // Il portale non va indicizzato dai motori di ricerca; le anteprime dei link (Open Graph) funzionano comunque.
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  openGraph: {
    type: "website",
    siteName: "CORE829 · Portale clienti",
    locale: "it_IT",
    title: "Portale clienti CORE829",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Portale clienti CORE829", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
