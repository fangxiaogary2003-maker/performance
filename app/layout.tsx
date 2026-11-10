import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "绩效工作台 · 试点",
  description: "目标、成果、验收与月度档案",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
