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
      <body>
        {/* Each area decides its own width: the children's screens in (kid)/layout.tsx, the teachers' in staff/. */}
        <div className="flex min-h-dvh w-full flex-col bg-white">{children}</div>
      </body>
    </html>
  );
}
