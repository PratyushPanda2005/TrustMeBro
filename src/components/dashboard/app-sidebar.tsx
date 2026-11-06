"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Logo } from "@/components/landing/logo"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { getParty, useTrade } from "@/lib/trade/store"

import { navigation, roleFromPath, roles } from "./nav"

function SidebarBody() {
  const pathname = usePathname()
  const router = useRouter()
  const state = useTrade()
  const role = roleFromPath(pathname)
  const persona =
    role === "admin" ? null : getParty(state, state.personas[role])
  const items = navigation[role]

  return (
    <>
      <SidebarHeader className="gap-3">
        <Logo className="px-2 py-1" />
        <Select
          value={role}
          items={roles}
          onValueChange={(value) => value && router.push(`/dashboard/${value}`)}
        >
          <SelectTrigger aria-label="Switch role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {roles.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {persona ? persona.name : "Platform admin"}
          </SidebarGroupLabel>
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
export function AppSidebar() {
  return (
    <Sidebar>
      {/* It reads the URL, which deal pages only know at request time. */}
      <Suspense>
        <SidebarBody />
      </Suspense>
    </Sidebar>
  )
}
