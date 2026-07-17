import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Pricing the Heat",
  description: "Parametric micro-insurance pricing for heatwave wage loss",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
