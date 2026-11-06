import { cn } from "cn"

export function Container({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1440px] px-7 lg:px-15", className)}
      {...props}
    />
  )
}

/** Full-bleed page band, separated from the previous band by a hairline. */
export function Band({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("border-t border-border", className)} {...props} />
  )
}

export function SectionTitle({
  className,
  as: Tag = "h2",
  ...props
}: React.ComponentProps<"h2"> & { as?: "h1" | "h2" | "h3" }) {
  return (
    <Tag
      className={cn("text-[2.5rem] leading-11 type-display", className)}
      {...props}
    />
  )
}
