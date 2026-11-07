import type { Metadata } from "next";
import { headers } from "next/headers";
import { PortalProvider } from "@/components/portal/PortalProvider";
import { deriveConvexSiteUrl } from "@/lib/convexUrls";
import { getClientEnv } from "@/lib/env";
import { ONBOARDING_SCRIPT } from "@/lib/onboardingFlag";

export const metadata: Metadata = { title: "Il tuo spazio" };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const env = getClientEnv();
  const siteUrl = deriveConvexSiteUrl(env.NEXT_PUBLIC_CONVEX_URL, env.NEXT_PUBLIC_CONVEX_SITE_URL);
  // Il nonce della richiesta (generato in proxy.ts) autorizza questo unico script inline.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      {/* Costante scritta nel codice (onboardingFlag.ts), senza dati esterni: nessun rischio di iniezione. */}
      {/* eslint-disable-next-line react/no-danger */}
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: ONBOARDING_SCRIPT }} />
      <PortalProvider url={env.NEXT_PUBLIC_CONVEX_URL} siteUrl={siteUrl}>
        {children}
      </PortalProvider>
    </>
  );
}
