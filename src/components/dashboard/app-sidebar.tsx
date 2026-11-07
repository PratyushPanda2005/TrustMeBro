"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Logo } from "@/components/landing/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getParty, useMe, useTrade } from "@/lib/trade/store"
import type { Role } from "@/lib/trade/types"

import { navigation } from "./nav"

function SidebarBody({ role }: { role: Role }) {
  const pathname = usePathname()
  const state = useTrade()
  const me = useMe()
  const name = role === "admin" ? "Admin" : getParty(state, me).name
  const items = navigation[role]

  return (
    <>
      <SidebarHeader>
        <Logo className="px-2 py-1" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{name}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isRoot = item.href === `/dashboard/${role}`
                const active = isRoot
                  ? pathname === item.href
                  : pathname.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 text-xs text-muted-foreground">
        {state.network.name}, chain {state.network.chainId}
      </SidebarFooter>
    </>
  )
}

/**
 * Sidebar stays outside the boundary: it swaps to a sheet on phones, which must
 * not happen before a suspended child has hydrated against the server HTML.
 */
export function AppSidebar({ role }: { role: Role }) {
  return (
    <Sidebar>
      {/* It reads the URL, which deal pages only know at request time. */}
      <Suspense>
        <SidebarBody role={role} />
      </Suspense>
    </Sidebar>
  )
}
