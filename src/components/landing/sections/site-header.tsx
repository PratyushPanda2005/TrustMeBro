"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Menu as MenuIcon } from "lucide-react"
import { cn } from "cn"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  links,
  navEntries,
  type NavEntry,
  type NavGroup,
} from "@/content/landing"

import { CtaLink, externalProps } from "../cta-link"
import { Logo } from "../logo"

const itemClass =
  "inline-flex h-8 cursor-pointer items-center rounded-full px-4 text-xs tracking-[0.06em] uppercase outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-secondary"

function MenuGroupBlock({ group }: { group: NavGroup }) {
  return (
    <DropdownMenuGroup className="not-first:mt-1">
      <p className="flex items-center gap-2 px-2 py-1.5 text-[0.6875rem] font-medium tracking-[0.04em] text-muted-foreground uppercase after:h-px after:flex-1 after:bg-border">
        {group.label}
      </p>
      {group.items.map((item) => (
        <MenuPrimitive.LinkItem
          key={item.label}
          closeOnClick
          render={<Link href={item.href} {...externalProps(item.href)} />}
          className="block rounded-md px-2 py-2 outline-none data-highlighted:bg-secondary"
        >
          <span className="block leading-5">{item.label}</span>
          <span className="block text-xs leading-4 text-muted-foreground">
            {item.description}
          </span>
        </MenuPrimitive.LinkItem>
      ))}
    </DropdownMenuGroup>
  )
}

function NavItem({ entry }: { entry: NavEntry }) {
  if ("href" in entry) {
    return (
      <Link href={entry.href} className={itemClass}>
        {entry.label}
      </Link>
    )
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={itemClass}>
        {entry.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        sideOffset={10}
        finalFocus={false}
        className="w-80 rounded-lg bg-popover p-2 ring-border"
      >
        {entry.groups.map((group) => (
          <MenuGroupBlock key={group.label} group={group} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DesktopNav() {
  return (
    <nav aria-label="Main" className="flex items-center">
      {navEntries.map((entry) => (
        <NavItem key={entry.label} entry={entry} />
      ))}
    </nav>
  )
}

function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger
        aria-label="Toggle menu"
        className="-mr-2 grid size-10 cursor-pointer place-items-center text-muted-foreground lg:hidden"
      >
        <MenuIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full bg-background p-7 sm:max-w-sm"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <nav aria-label="Mobile" className="mt-8 flex flex-col gap-6">
          {navEntries.map((entry) => (
            <div key={entry.label}>
              {"href" in entry ? (
                <SheetClose
                  nativeButton={false}
                  render={<Link href={entry.href} />}
                  className="type-label text-sm"
                >
                  {entry.label}
                </SheetClose>
              ) : (
                <>
                  <p className="type-label text-sm text-muted-foreground">
                    {entry.label}
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {entry.groups
                      .flatMap((group) => group.items)
                      .map((item) => (
                        <li key={item.label}>
                          <SheetClose
                            nativeButton={false}
                            render={
                              <Link
                                href={item.href}
                                {...externalProps(item.href)}
                              />
                            }
                          >
                            {item.label}
                          </SheetClose>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

export function SiteHeader() {
  const [floating, setFloating] = useState(false)

  useEffect(() => {
    const update = () => setFloating(window.scrollY > 72)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return (
    <>
      <header className="mx-auto grid h-16 w-full max-w-[1440px] grid-cols-[1fr_auto] items-center px-7 lg:grid-cols-[1fr_auto_1fr] lg:px-15">
        <Logo />
        <div className="hidden lg:block">
          <DesktopNav />
        </div>
        <div className="hidden items-center justify-end gap-2 lg:flex">
          <Link
            href={links.repo}
            {...externalProps(links.repo)}
            className={itemClass}
          >
            GitHub
          </Link>
          <CtaLink href={links.app} size="sm" className="bg-primary">
            Start a deal
          </CtaLink>
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <MobileNav />
        </div>
      </header>

      {/* Compact bar that takes over once the page header has scrolled away. */}
      <div
        inert={!floating}
        className={cn(
          "fixed top-3 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-1 rounded-full bg-background/80 p-1 backdrop-blur-md transition-opacity duration-200 lg:flex",
          floating ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <DesktopNav />
        <CtaLink href={links.app} size="sm">
          Start a deal
        </CtaLink>
      </div>
    </>
  )
}
