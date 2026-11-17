import { redirect } from "next/navigation";
import { getKid, getStaff } from "@/lib/auth";

export default async function RootPage() {
  if (await getKid()) redirect("/home");
  if (await getStaff()) redirect("/staff");
  redirect("/login");
}
