import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Interview Prep Kit",
  description: "Generate a tailored interview prep kit from a job description.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${spaceGrotesk.variable}`}
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        {/* Signature top accent bar */}
        <div className="accent-gradient h-1 w-full shrink-0" />
        {children}
      </body>
    </html>
  );
}
