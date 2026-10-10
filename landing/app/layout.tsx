import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MindMate — Meet Aiko & Yuki",
  description: "Static interactive demo: VRM anime companions that talk, dance and break the fourth wall. Meet Aiko & Yuki.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
