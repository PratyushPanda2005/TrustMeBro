import Link from "next/link"
import { cn } from "cn"

/** Mark artwork on a 32-unit grid, shared with the isometric illustration. */
export function LogoPaths() {
  return (
    <>
      <path d="M16 3 27 7v9c0 6.300-4.400 10.500-11 13C9.400 26.500 5 22.300 5 16V7l11-4Z" />
      <path d="m10.500 16 4 4 7-7.500" />
    </>
  )
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <LogoPaths />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="TrustMeBro home"
      className={cn(
        "inline-flex items-center gap-2 text-foreground",
        className,
      )}
    >
      <LogoMark className="size-8" />
      <span className="text-[1.625rem] leading-none font-semibold tracking-[-0.03em]">
        TrustMeBro
      </span>
    </Link>
  )
}
