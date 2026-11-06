import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

type CtaLinkProps = {
  href: string
  children: React.ReactNode
  tone?: "solid" | "outline"
  size?: "sm" | "lg"
  arrow?: boolean
  className?: string
}

export function isExternal(href: string) {
  return href.startsWith("http")
}

/** Link props that open off-site URLs in a new tab. */
export function externalProps(href: string) {
  return isExternal(href)
    ? ({ target: "_blank", rel: "noreferrer" } as const)
    : {}
}

export function CtaLink({
  href,
  children,
  tone = "solid",
  size = "lg",
  arrow = false,
  className,
}: CtaLinkProps) {
  return (
    <Button
      nativeButton={false}
      variant={tone === "solid" ? "pill" : "pill-outline"}
      size={size === "lg" ? "pill-lg" : "pill-sm"}
      className={className}
      render={<Link href={href} {...externalProps(href)} />}
    >
      {children}
      {arrow ? <ArrowRight data-icon="inline-end" strokeWidth={1.5} /> : null}
    </Button>
  )
}
