import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "./nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pathfinder",
  description:
    "Whether a specific graduate program pays off for you, using your own numbers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
        <footer className="mt-auto border-t border-hairline bg-surface">
          <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">
            This site incorporates information from{" "}
            <a
              href="https://services.onetcenter.org/"
              className="underline hover:text-ink"
              target="_blank"
              rel="noopener noreferrer"
            >
              O*NET Web Services
            </a>{" "}
            by the U.S. Department of Labor, Employment and Training
            Administration (USDOL/ETA). O*NET® is a trademark of USDOL/ETA.
          </p>
        </footer>
      </body>
    </html>
  );
}
