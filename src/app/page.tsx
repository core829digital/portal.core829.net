import { ArrowUpRight, KeyRound, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CompanyDetails } from "@/components/brand/CompanyDetails";
import { LandingNav } from "@/components/brand/LandingNav";
import { SplitWords } from "@/components/brand/SplitWords";
import { SpotlightCard } from "@/components/brand/SpotlightCard";
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

      <LandingNav />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-5 pb-10 pt-28 sm:px-8 lg:pb-16">
        <div className="max-w-3xl">
          <p
            className="reveal mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Portale clienti
          </p>
          <h1 className="font-display text-3xl leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
            <SplitWords text="Il tuo spazio con CORE829" startAt={2} />
          </h1>
          <p className="reveal mt-5 max-w-xl text-base leading-7 text-on-ink-muted sm:text-lg" style={{ "--i": 3 } as React.CSSProperties}>
            Progetti, fatture, abbonamenti e documenti in un unico posto, sempre aggiornati. Nessun account e nessuna password da ricordare.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SpotlightCard
            aria-labelledby="gia-cliente"
            className="reveal spotlight-dark flex flex-col gap-4 rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/15 backdrop-blur-md sm:p-8"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <KeyRound aria-hidden className="size-6 text-white" />
            <h2 id="gia-cliente" className="font-display text-xl tracking-tight text-white">
              Sei già cliente?
            </h2>
            <ol className="space-y-3 text-sm leading-6 text-on-ink-muted">
              <li className="step-in flex gap-3" style={{ "--s": 0 } as React.CSSProperties}>
                <span className="font-mono text-xs text-white">01</span>
                Apri il link personale che ti abbiamo inviato via email o WhatsApp.
              </li>
              <li className="step-in flex gap-3" style={{ "--s": 1 } as React.CSSProperties}>
                <span className="font-mono text-xs text-white">02</span>
                Vedi subito progetti, fatture e abbonamenti. Per i documenti ti mandiamo un codice via email.
              </li>
            </ol>
            <p className="mt-auto text-sm text-on-ink-muted">
              Non trovi il link? Scrivici con uno dei contatti qui accanto e te ne inviamo subito uno nuovo.
            </p>
          </SpotlightCard>

          <SpotlightCard
            aria-labelledby="non-cliente"
            className="reveal spotlight-light flex flex-col gap-4 rounded-3xl bg-white p-6 text-foreground ring-1 ring-white/20 sm:p-8"
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
          </SpotlightCard>
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
