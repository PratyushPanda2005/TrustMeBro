import {
  BadgeDollarSign,
  Bot,
  BriefcaseBusiness,
  ClipboardCheck,
  FilePlus2,
  Files,
  Gauge,
  LayoutDashboard,
  Store,
  TrendingUp,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import type { Role } from "@/lib/trade/types"

export type NavItem = { title: string; href: string; icon: LucideIcon }

export const roles: { value: Role; label: string }[] = [
  { value: "exporter", label: "Exporter" },
  { value: "importer", label: "Importer" },
  { value: "investor", label: "Investor" },
  { value: "admin", label: "Admin" },
]

const base = "/dashboard"

export const navigation: Record<Role, NavItem[]> = {
  exporter: [
    { title: "Overview", href: `${base}/exporter`, icon: LayoutDashboard },
    { title: "New invoice", href: `${base}/exporter/new`, icon: FilePlus2 },
    { title: "My deals", href: `${base}/exporter/deals`, icon: Files },
    { title: "Trust Score", href: `${base}/exporter/trust-score`, icon: Gauge },
    { title: "Earnings", href: `${base}/exporter/earnings`, icon: TrendingUp },
  ],
  importer: [
    { title: "Overview", href: `${base}/importer`, icon: LayoutDashboard },
    {
      title: "Approvals",
      href: `${base}/importer/approvals`,
      icon: ClipboardCheck,
    },
    { title: "Payments", href: `${base}/importer/payments`, icon: Wallet },
    { title: "Risk Score", href: `${base}/importer/risk-score`, icon: Gauge },
  ],
  investor: [
    { title: "Overview", href: `${base}/investor`, icon: LayoutDashboard },
    { title: "Open deals", href: `${base}/investor/deals`, icon: Store },
    {
      title: "Portfolio",
      href: `${base}/investor/portfolio`,
      icon: BriefcaseBusiness,
    },
    { title: "Returns", href: `${base}/investor/returns`, icon: TrendingUp },
  ],
  admin: [
    { title: "Overview", href: `${base}/admin`, icon: LayoutDashboard },
    { title: "All deals", href: `${base}/admin/deals`, icon: Files },
    { title: "Parties", href: `${base}/admin/parties`, icon: UserCheck },
    { title: "Agent", href: `${base}/admin/agent`, icon: Bot },
    {
      title: "Platform fees",
      href: `${base}/admin/fees`,
      icon: BadgeDollarSign,
    },
  ],
}

export const roleFromPath = (pathname: string): Role => {
  const segment = pathname.split("/")[2]
  return roles.some((role) => role.value === segment)
    ? (segment as Role)
    : "exporter"
}
