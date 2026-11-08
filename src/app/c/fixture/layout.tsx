import { notFound } from "next/navigation";
import { PageIn } from "@/components/dash/PageIn";
import { PortalChrome } from "@/components/portal/PortalChrome";
import { fixtureData } from "./fixtureData";

/**
 * Cornice di PROVA con dati inventati, usata solo dai test nel browser.
 * Esiste soltanto se la variabile E2E_FIXTURES vale "1"; in produzione risponde 404.
 */
export default function FixtureLayout({ children }: { children: React.ReactNode }) {
  if (process.env.E2E_FIXTURES !== "1") notFound();
  return (
    <PortalChrome data={fixtureData} token={"A".repeat(43)} base="/c/fixture">
      <PageIn>{children}</PageIn>
    </PortalChrome>
  );
}
