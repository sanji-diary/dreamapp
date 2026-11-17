import type { Metadata, Viewport } from "next";
import "./globals.css";

// The web app manifest is linked per area: children in (kid)/layout.tsx, teachers in staff/layout.tsx.
export const metadata: Metadata = {
  title: "꿈의숲키우기",
  description: "꿈의 숲 교회 소년부",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "꿈의숲키우기", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      {/* Each area frames itself: children's screens and the teacher sign-in sit in a phone-width column
          (PhoneColumn); the teacher screens add a sidebar on wide screens (staff/(app)/layout.tsx). */}
      <body>{children}</body>
    </html>
  );
}
