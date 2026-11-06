"use client"

import { Suspense } from "react"
import Link from "next/link"
import { Radio } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { useConnection, type Connection } from "@/lib/trade/store"

import { AppSidebar } from "./app-sidebar"
import { RoleWash } from "./role-wash"
import { WalletButton } from "./wallet-button"

/** Views read chain state, so they wait for the first answer. */
function Gate({
  connection,
  children,
}: {
  connection: Connection
  children: React.ReactNode
}) {
  if (connection.status === "offline") {
    return (
      <Alert>
        <AlertTitle>Can&apos;t reach Whitechain</AlertTitle>
        <AlertDescription>
          {connection.message} This page reconnects by itself.
        </AlertDescription>
      </Alert>
    )
  }
  if (connection.status === "loading") {
    return (
      <>
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </>
    )
  }
  return children
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const connection = useConnection()

  return (
    <SidebarProvider>
      {connection.status === "ready" ? <AppSidebar /> : <Sidebar />}
      <SidebarInset>
        {/* It reads the URL, which deal pages only know at request time. */}
        <Suspense>
          <RoleWash />
        </Suspense>
        <header className="relative flex h-16 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Badge variant="secondary">
            <Radio data-icon="inline-start" />
            {connection.status === "ready"
              ? connection.state.network.name
              : "Connecting"}
          </Badge>
          <WalletButton />
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/" />}
          >
            Back to site
          </Button>
        </header>
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 border-dashed p-4 md:p-8 xl:border-x">
          <Gate connection={connection}>{children}</Gate>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
