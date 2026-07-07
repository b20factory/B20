import type { Metadata } from "next";
import { JetBrains_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import AmbientBackground from "@/components/AmbientBackground";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const SITE = "https://b20factory.xyz";
const TITLE = "B20factory — Launch native B20 tokens on Base";
const DESC =
  "The launchpad for Base Beryl. Deploy a clean, admin-less B20 token with locked single-sided liquidity — from a simple form or the command line.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "64x64" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "B20factory",
    title: TITLE,
    description: DESC,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "B20factory" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@B20Factory_",
    creator: "@B20Factory_",
    title: TITLE,
    description: DESC,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased font-sans">
        <AmbientBackground />
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
