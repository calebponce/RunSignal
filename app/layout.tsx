import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RunSignal — CI Reliability Console",
  description:
    "Evidence-first CI reliability monitoring and deterministic incident triage.",
  applicationName: "RunSignal",
  creator: "Caleb Ponce",
  openGraph: {
    title: "RunSignal — CI Reliability Console",
    description:
      "Turn workflow evidence into explainable ALLOW, HOLD, or BLOCK decisions.",
    type: "website",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
