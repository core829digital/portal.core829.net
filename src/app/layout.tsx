import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk, Unbounded } from "next/font/google";
import { canonicalAppUrl } from "@/lib/appUrl";
import "./globals.css";

// Font del brand CORE829 (gli stessi di core829.net), serviti dal nostro dominio da next/font.
const spaceGrotesk = Space_Grotesk({ variable: "--font-space", subsets: ["latin"] });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

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
      className={`${spaceGrotesk.variable} ${unbounded.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
