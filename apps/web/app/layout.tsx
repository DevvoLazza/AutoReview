import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFrame } from "@/components/auth-gate";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoReview · AI review operations",
  description: "Risposte AI controllate alle recensioni Google Business Profile.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>
        <SiteFrame>{children}</SiteFrame>
      </body>
    </html>
  );
}
