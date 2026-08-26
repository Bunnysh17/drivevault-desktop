import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { StateProvider } from "@/components/StateProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "DriveVault — Your PC is protected",
  description:
    "DriveVault automatically backs up your local files and Medal recordings to Google Drive, then safely frees space on your PC.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("drivevault_theme");if(t){document.documentElement.setAttribute("data-theme",t);document.body&&document.body.setAttribute("data-theme",t);}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased font-sans" suppressHydrationWarning>
        <StateProvider>
          <AppShell>{children}</AppShell>
        </StateProvider>
      </body>
    </html>
  );
}
