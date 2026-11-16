import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "@axiom/ui/theme.css";
import "./styles.css";
import { CookieConsent } from "./components/CookieConsent";

const spaceGrotesk = localFont({
  src: "../public/fonts/SpaceGrotesk-Variable.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "300 700",
});

const jetbrainsMono = localFont({
  src: "../public/fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "100 800",
});

const inter = localFont({
  src: "../public/fonts/Inter-Variable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: { default: "Axiom NHI — Security for AI tool calls", template: "%s · Axiom NHI" },
  description: "An inline security gateway for MCP tool calls. Inspect, validate, and govern non-human identities at the point of execution.",
  openGraph: {
    title: "Axiom NHI — Security for AI tool calls",
    description: "Bring policy enforcement to the MCP runtime boundary.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable} dark`}
      style={{ colorScheme: "dark" }}
    >
      <body className="antialiased">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
