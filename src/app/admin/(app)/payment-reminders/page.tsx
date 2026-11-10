import type { Metadata } from "next";
import { PaymentRemindersPage } from "@/components/admin/PaymentRemindersPage";

export const metadata: Metadata = { title: "Promemoria di pagamento" };

export default function Page() {
  return <PaymentRemindersPage />;
}
