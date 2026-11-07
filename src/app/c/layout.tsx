import type { Metadata } from "next";
import { PortalProvider } from "@/components/portal/PortalProvider";
import { deriveConvexSiteUrl } from "@/lib/convexUrls";
import { getClientEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Il tuo spazio" };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const env = getClientEnv();
  const siteUrl = deriveConvexSiteUrl(env.NEXT_PUBLIC_CONVEX_URL, env.NEXT_PUBLIC_CONVEX_SITE_URL);
  return (
    <PortalProvider url={env.NEXT_PUBLIC_CONVEX_URL} siteUrl={siteUrl}>
      {children}
    </PortalProvider>
  );
}
