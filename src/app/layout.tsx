import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { FeedbackButtonWrapper } from "@/components/feedback-button-wrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboards Oasipor",
  description: "Dashboards operacionais Oasipor — Comercial e Produção",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" className="h-full antialiased">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full overflow-hidden bg-slate-50 text-slate-900 font-semibold" style={{ fontFamily: "'Inter', sans-serif" }}>
        {children}
        <FeedbackButtonWrapper />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
