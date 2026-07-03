import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Splitify",
  description: "Split Spotify playlists into curated AI-generated playlists."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
