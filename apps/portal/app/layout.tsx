import type { Metadata, Viewport } from "next";
import { DM_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import "./patient-space.css";

const uiFont = DM_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const displayFont = Newsreader({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "MWANAMKE",
  description: "Swahili-first essential care for women in Tanzania.",
  applicationName: "MWANAMKE",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F6F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1517" }
  ],
  colorScheme: "light dark"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sw" className={`${uiFont.variable} ${displayFont.variable}`}>
      {/* Browser writing assistants may add data-* attributes before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
