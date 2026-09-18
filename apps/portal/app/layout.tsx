import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { DM_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import "./patient-space.css";

const uiFont = DM_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const displayFont = Newsreader({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const language = (await cookies()).get("mwanamke-language")?.value === "en" ? "en" : "sw";
  return {
    title: "MWANAMKE",
    description: language === "sw" ? "Huduma na uratibu wa afya ya wanawake Tanzania na Zanzibar." : "Women’s health and care coordination in Tanzania and Zanzibar.",
    applicationName: "MWANAMKE",
    robots: { index: false, follow: false }
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F6F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1517" }
  ],
  colorScheme: "light dark"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const language = (await cookies()).get("mwanamke-language")?.value === "en" ? "en" : "sw";
  return (
    <html lang={language} className={`${uiFont.variable} ${displayFont.variable}`}>
      {/* Browser writing assistants may add data-* attributes before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
