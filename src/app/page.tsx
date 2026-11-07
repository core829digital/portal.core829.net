import { ArrowUpRight, KeyRound, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CompanyDetails } from "@/components/brand/CompanyDetails";
import { ContactCtas } from "@/components/brand/ContactCtas";
import NeuralNoise from "@/components/brand/NeuralNoise";
import { COMPANY } from "@/lib/company";
import { PRIVACY_URL, SITE_URL } from "@/lib/contact";

/**
 * Pagina d'accesso del portale. Sfondo: il flusso "neurale" rosso della hero di core829.net.
 * Due strade: chi e' cliente apre il link personale; chi non lo e' trova come contattarci.
 */
export default function Home() {
  return (
    <div className="relative isolate flex min-h-dvh flex-1 flex-col overflow-hidden bg-ink text-on-ink">
      <NeuralNoise />
      {/* Velo scuro leggero in basso: tiene leggibili i testi sopra lo sfondo animato. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-b from-transparent via-transparent to-ink/80" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <a href={SITE_URL} aria-label="CORE829, vai al sito" className="fade-in">
          <Image src="/brand/core829-logo-white.webp" alt="CORE829" width={120} height={82} priority unoptimized className="h-10 w-auto" />
        </a>
        <a
          href={SITE_URL}
          className="fade-in inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-on-ink-muted transition-colors hover:text-on-ink"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          core829.net <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-5 py-10 sm:px-8 lg:py-16">
        <div className="max-w-3xl">
          <p
            className="reveal mb-6 inline-flex items-center gap-2 border border-white/20 bg-white/5 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Portale clienti
          </p>
          <h1 className="reveal font-display text-3xl leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl" style={{ "--i": 2 } as React.CSSProperties}>
            Il tuo spazio con CORE829
          </h1>
          <p className="reveal mt-5 max-w-xl text-base leading-7 text-on-ink-muted sm:text-lg" style={{ "--i": 3 } as React.CSSProperties}>
            Progetti, fatture, abbonamenti e documenti in un unico posto, sempre aggiornati. Nessun account e nessuna password da ricordare.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section
            aria-labelledby="gia-cliente"
            className="reveal flex flex-col gap-4 rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/15 backdrop-blur-md sm:p-8"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <KeyRound aria-hidden className="size-6 text-white" />
            <h2 id="gia-cliente" className="font-display text-xl tracking-tight text-white">
              Sei già cliente?
            </h2>
            <ol className="space-y-3 text-sm leading-6 text-on-ink-muted">
              <li className="flex gap-3">
                <span className="font-mono text-xs text-white">01</span>
                Apri il link personale che ti abbiamo inviato via email o WhatsApp.
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-xs text-white">02</span>
                Vedi subito progetti, fatture e abbonamenti. Per i documenti ti mandiamo un codice via email.
              </li>
            </ol>
            <p className="mt-auto text-sm text-on-ink-muted">
              Non trovi il link? Scrivici con uno dei contatti qui accanto e te ne inviamo subito uno nuovo.
            </p>
          </section>

          <section
            aria-labelledby="non-cliente"
            className="reveal flex flex-col gap-4 rounded-3xl bg-white p-6 text-foreground ring-1 ring-white/20 sm:p-8"
            style={{ "--i": 5 } as React.CSSProperties}
          >
            <Sparkles aria-hidden className="size-6 text-brand" />
            <h2 id="non-cliente" className="font-display text-xl tracking-tight">
              Non sei ancora cliente?
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Siti web, software su misura, marketing e servizi digitali per eventi. Raccontaci il tuo progetto: ti rispondiamo con un piano chiaro e un preventivo trasparente.
            </p>
            <ContactCtas className="mt-auto" />
          </section>
        </div>

        <section
          aria-labelledby="dati-aziendali"
          className="reveal rounded-3xl bg-white/[0.04] p-6 ring-1 ring-white/10 backdrop-blur-md sm:p-8"
          style={{ "--i": 6 } as React.CSSProperties}
        >
          <h2 id="dati-aziendali" className="mb-5 font-display text-base tracking-tight text-white">
            CORE829 SRL
          </h2>
          <CompanyDetails tone="dark" />
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-on-ink-muted sm:px-8">
        <span>
          © {new Date().getFullYear()} {COMPANY.name} — Reg. Com. {COMPANY.regCom} · CUI/CIF {COMPANY.cui}
        </span>
        <nav aria-label="Link utili" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href={PRIVACY_URL} className="underline-offset-4 hover:text-on-ink hover:underline">
            Privacy
          </a>
          <Link href="/admin/login" className="underline-offset-4 hover:text-on-ink hover:underline">
            Accesso amministratore
          </Link>
        </nav>
      </footer>
    </div>
  );
}
