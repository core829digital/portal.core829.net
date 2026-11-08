import { notFound } from "next/navigation";
import { NavFixture } from "./NavFixture";

export default function Page() {
  if (process.env.E2E_FIXTURES !== "1") notFound();
  return <NavFixture />;
}
