import { AdminFrame } from "@/components/admin/AdminFrame";

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
