import { PortalFrame } from "@/components/portal/PortalFrame";

export default function PortalAppLayout({ children }: { children: React.ReactNode }) {
  return <PortalFrame>{children}</PortalFrame>;
}
