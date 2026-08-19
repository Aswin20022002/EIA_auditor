import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "EIA Auditor: Environmental Impact Assessment Report Review",
  description:
    "Upload an EIA report and get a completeness check against India's EIA Notification 2006 structure, a scan for vague or unsubstantiated impact claims, and a plain-language public summary.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} font-body bg-paper text-ink antialiased`}>
        {children}
      </body>
    </html>
  );
}
