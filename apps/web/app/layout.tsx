import type { Metadata, Viewport } from "next";
import "@axiom/ui/theme.css";
import "./styles.css";
import { CookieConsent } from "./components/CookieConsent";

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
    <html lang="en" data-theme="dark" className="dark" style={{ colorScheme: "dark" }}>
      <body className="antialiased">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
