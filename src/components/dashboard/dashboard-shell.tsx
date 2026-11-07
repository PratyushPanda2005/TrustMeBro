"use client"

import { Suspense, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Radio, Wallet as WalletIcon } from "lucide-react"

import { Logo } from "@/components/landing/logo"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { roleOf, useConnection } from "@/lib/trade/store"
import type { Role } from "@/lib/trade/types"
import { useWallet } from "@/lib/trade/wallet"

import { AppSidebar } from "./app-sidebar"
import { RoleWash } from "./role-wash"
import { WalletButton } from "./wallet-button"

function Loading() {
  return (
    <>
      <Skeleton className="h-12 w-72" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full" />
    </>
  )
}

function Frame({
  role,
  network,
  children,
}: {
  role?: Role
  network?: string
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      {role ? <AppSidebar role={role} /> : <Sidebar />}
      <SidebarInset>
        {role ? <RoleWash role={role} /> : null}
        <header className="relative flex h-16 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Badge variant="secondary" className="max-sm:hidden">
            <Radio data-icon="inline-start" />
            {network ?? "Connecting"}
          </Badge>
          <WalletButton className="ml-auto" />
          <Button
            variant="ghost"
            className="max-sm:hidden"
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

/** The wallet decides the dashboard, so any other URL sends it back to its own. */
function RoleGuard({
  role,
  children,
}: {
  role: Role
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const home = `/dashboard/${role}`
  const allowed = pathname === home || pathname.startsWith(`${home}/`)

  useEffect(() => {
    if (!allowed) router.replace(home)
  }, [allowed, home, router])

  return allowed ? children : <Loading />
}

/** Shown to a wallet that has no dashboard to open. */
function WalletScreen({ address }: { address?: string }) {
  return (
    <main className="relative flex min-h-svh flex-col bg-background">
      <div className="p-6">
        <Logo />
      </div>
      <Empty className="pb-24">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WalletIcon />
          </EmptyMedia>
          <EmptyTitle>
            {address ? "This wallet isn't approved yet" : "Connect your wallet"}
          </EmptyTitle>
          <EmptyDescription>
            {address
              ? "After KYC, the admin adds it as an exporter, importer or investor."
              : "Your wallet opens the dashboard for your role."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {address ? (
            <code className="font-mono text-xs break-all text-muted-foreground">
              {address}
            </code>
          ) : null}
          <WalletButton />
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/" />}
          >
            Back to site
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const connection = useConnection()
  const wallet = useWallet()

  if (wallet.ready && !wallet.address) return <WalletScreen />

  if (connection.status === "offline") {
    return (
      <Frame>
        <Alert>
          <AlertTitle>Can&apos;t reach Whitechain</AlertTitle>
          <AlertDescription>
            {connection.message} This page reconnects by itself.
          </AlertDescription>
        </Alert>
      </Frame>
    )
  }

  if (connection.status === "loading" || !wallet.ready) {
    return (
      <Frame>
        <Loading />
      </Frame>
    )
  }

  const role = roleOf(connection.state, wallet.address)
  if (!role) return <WalletScreen address={wallet.address} />

  return (
    <Frame role={role} network={connection.state.network.name}>
      {/* It reads the URL, which deal pages only know at request time. */}
      <Suspense fallback={<Loading />}>
        <RoleGuard role={role}>{children}</RoleGuard>
      </Suspense>
    </Frame>
  )
}
