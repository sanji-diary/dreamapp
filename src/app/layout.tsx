import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "꿈의숲키우기",
  description: "꿈의 숲 교회 소년부",
  manifest: "/manifest.webmanifest",
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
        {/* Phone-width column: on a desktop the app sits centered like a phone screen. */}
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white shadow-[0_0_40px_rgba(25,31,40,0.06)]">{children}</div>
      </body>
    </html>
  );
}
