import type { Metadata } from "next";

/** Teachers who add the app to their home screen start at the teacher screens, not at a child's card. */
export const metadata: Metadata = { manifest: "/manifest-staff.webmanifest" };

export default function StaffRootLayout({ children }: LayoutProps<"/staff">) {
  // The teacher screens are still laid out for a phone-width column until their new layout lands.
  return <div className="mx-auto flex w-full max-w-[430px] grow flex-col bg-white">{children}</div>;
}
