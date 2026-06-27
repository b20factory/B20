import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "B20factory — launch native B20 tokens on Base",
  description:
    "The terminal-native launchpad for Base Beryl. Deploy a clean, admin-less B20 token with a locked single-sided pool — from the app or the command line.",
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
