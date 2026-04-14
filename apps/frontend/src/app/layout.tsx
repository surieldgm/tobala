import type { Metadata } from "next";
import { Newsreader, DM_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Tobalá",
  description: "Zettelkasten · powered by agave",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${dmMono.variable} h-full`}
    >
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "#FBF6ED",
          color: "#3D3527",
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
