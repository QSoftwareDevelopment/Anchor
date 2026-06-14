import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/nav";
import CaptureBar from "@/components/capture-bar";
import CommandPalette from "@/components/command-palette";

export const metadata: Metadata = {
  title: "Anchor — Q Software",
  description: "Your AI operating partner.",
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
        {/* Futuristic fixed backdrop: drifting aurora + perspective grid. */}
        <div className="qa-bg-fx" aria-hidden />
        <CommandPalette />
        <CaptureBar />
        <Nav />
        {/* Desktop: clear the 232px sidebar. Mobile: clear the bottom tab bar. */}
        <main className="pb-20 md:pb-8 md:pl-[232px]">{children}</main>
      </body>
    </html>
  );
}
