"use client"

import { usePathname } from "next/navigation"

import { roleFromPath } from "./nav"

/** The tint each side of the deal wears on the landing page. */
const washes = {
  exporter: "wash-ember",
  investor: "wash-teal",
  importer: "wash-violet",
  admin: "wash-gold",
}

/** The landing's wash and dot grid, fading out behind the page header. */
export function RoleWash() {
  const wash = washes[roleFromPath(usePathname())]

  return (
    <div
      aria-hidden="true"
      style={{ backgroundImage: `url(/images/landing/${wash}.jpg)` }}
      className="pointer-events-none absolute inset-x-0 top-0 h-80 mask-[linear-gradient(to_bottom,#000_35%,transparent)] bg-cover bg-center"
    >
      <div className="size-full dot-grid opacity-50" />
    </div>
  )
}
