import { Welcome } from "@/components/kid/Welcome";
import { requireKid } from "@/lib/auth";

export const metadata = { title: "가입 완료 · 꿈의숲키우기" };

/**
 * The end of the sign-up, for both ways in. The sign-up action signs the child in and comes here;
 * from here the child sees how to put the app on the home screen (skippable), then the tree.
 */
export default async function WelcomePage() {
  const kid = await requireKid();
  return <Welcome name={kid.name} next={`/join/${encodeURIComponent(kid.qr_token)}/install?first=1`} />;
}
