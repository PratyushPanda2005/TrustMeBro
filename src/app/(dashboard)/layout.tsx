import type { Metadata } from "next"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { fontMono, fontSans } from "@/lib/fonts"

import "../globals.css"

export const metadata: Metadata = {
  title: "TrustMeBro dashboard",
  description: "Exporter, importer, investor and admin dashboards.",
}

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`dashboard ${fontSans.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster theme="light" />
      </body>
    </html>
  )
}
