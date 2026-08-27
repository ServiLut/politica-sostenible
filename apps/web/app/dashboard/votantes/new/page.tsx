import { redirect } from "next/navigation";

export default function LegacyNewVoterPage() {
  redirect("/dashboard/votantes");
}
