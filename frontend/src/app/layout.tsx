import type { Metadata } from "next";
import { Playfair_Display, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ScholarFlow | Advanced Synthesis Engine",
  description: "RAG-powered research dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${inter.variable} ${geistMono.variable} antialiased dark`}
      suppressHydrationWarning
    >
      <body 
        className="min-h-screen flex flex-col bg-[#0C0C0C] text-[#EDEDED] font-sans selection:bg-[#3B82F6] selection:text-white"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}