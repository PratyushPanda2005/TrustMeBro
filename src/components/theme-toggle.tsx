"use client"

import { CoffeeIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "cn"

const themes = ["light", "cream", "dark"]

/** Cycles through the themes. The icon shows the theme a click switches to. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  const next = () => {
    const index = themes.indexOf(resolvedTheme ?? "light")
    setTheme(themes[(index + 1) % themes.length])
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      className={cn("rounded-full", className)}
      onClick={next}
    >
      <CoffeeIcon className="dark:hidden cream:hidden" />
      <MoonIcon className="hidden cream:block" />
      <SunIcon className="hidden dark:block" />
    </Button>
  )
}
