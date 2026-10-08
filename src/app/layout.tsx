import type { Metadata } from "next";
import "./globals.css";
import { themeBootScript, themeCss } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Proofer",
  description: "Photography business platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script sets data-theme / data-mode on <html>
    // before React loads, from the choice saved in Settings.
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
