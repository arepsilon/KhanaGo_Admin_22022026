import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import RealtimeAlerts from "@/components/RealtimeAlerts";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "KhanaGo Admin",
  description: "Food delivery platform administration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.className} antialiased bg-slate-50 text-slate-900`}>
        {children}
        <RealtimeAlerts />
      </body>
    </html>
  );
}
