import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/nav";
import CaptureBar from "@/components/capture-bar";

export const metadata: Metadata = {
  title: "Q Software",
  description: "Internal operating system for Q Software.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <CaptureBar />
        <Nav />
        {/* Desktop: clear the 60px sidebar. Mobile: clear the bottom tab bar. */}
        <main className="pb-20 md:pb-8 md:pl-[60px]">{children}</main>
      </body>
    </html>
  );
}
