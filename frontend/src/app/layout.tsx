import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const SITE = "https://b20factory.xyz";
const TITLE = "B20factory — launch native B20 tokens on Base";
const DESC =
  "The terminal-native launchpad for Base Beryl. Deploy a clean, admin-less B20 token with a locked single-sided pool, from the app or the command line.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
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
    <html lang="en" className={mono.variable}>
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="relative z-10">
            <Navbar />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
