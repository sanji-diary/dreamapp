import type { Metadata } from "next";

/** Teachers who add the app to their home screen start at the teacher screens, not at a child's card. */
export const metadata: Metadata = { manifest: "/manifest-staff.webmanifest" };

export default function StaffRootLayout({ children }: LayoutProps<"/staff">) {
  // No frame here: the screens behind the sign-in set their own widths in (app)/layout.tsx
  // (tab bar or sidebar), and the sign-in page in login/layout.tsx.
  return children;
}
