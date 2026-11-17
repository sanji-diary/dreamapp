import type { Metadata } from "next";

/** Teachers who add the app to their home screen start at the teacher screens, not at a child's card. */
export const metadata: Metadata = { manifest: "/manifest-staff.webmanifest" };

export default function StaffRootLayout({ children }: LayoutProps<"/staff">) {
  return children;
}
