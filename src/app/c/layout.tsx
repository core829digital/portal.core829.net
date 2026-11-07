import type { Metadata } from "next";
import { PortalProvider } from "@/components/portal/PortalProvider";
import { getClientEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Il tuo spazio" };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { NEXT_PUBLIC_CONVEX_URL } = getClientEnv();
  return <PortalProvider url={NEXT_PUBLIC_CONVEX_URL}>{children}</PortalProvider>;
}
