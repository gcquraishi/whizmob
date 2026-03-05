import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "whizmob — see what AI agent systems you've actually built",
  description:
    "Scan your machine for AI agents, skills, and integrations. See them as an interactive graph. Move them between machines. Local-first, no accounts.",
  openGraph: {
    title: "whizmob",
    description:
      "See what AI agent systems you've actually built. Scan, visualize, and move your AI agents.",
    url: "https://whizmob.dev",
    siteName: "whizmob",
    type: "website",
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
