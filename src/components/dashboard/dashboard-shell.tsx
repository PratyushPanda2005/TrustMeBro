"use client"

import { Suspense, useEffect } from "react"
import Link from "next/link"
import { FlaskConical } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { hydrateStore } from "@/lib/trade/store"

import { AppSidebar } from "./app-sidebar"
import { RoleWash } from "./role-wash"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  useEffect(hydrateStore, [])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* It reads the URL, which deal pages only know at request time. */}
        <Suspense>
          <RoleWash />
        </Suspense>
        <header className="relative flex h-16 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Badge variant="secondary">
            <FlaskConical data-icon="inline-start" />
            Mock data
          </Badge>
          <Button
            variant="pill-outline"
            size="pill-sm"
            className="ml-auto"
            nativeButton={false}
            render={<Link href="/" />}
          >
            Back to site
          </Button>
        </header>
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 border-dashed p-4 md:p-8 xl:border-x">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
