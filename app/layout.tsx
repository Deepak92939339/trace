import type { Metadata } from "next";
import "./fonts.css";
import "./globals.css";
import "./tokens.css";

export const metadata: Metadata = {
  title: { default: "Trace — Commercial quotations", template: "%s — Trace" },
  description: "Prepare, approve and issue precise commercial quotations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
