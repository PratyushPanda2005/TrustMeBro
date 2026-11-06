import Image from "next/image"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { rails } from "@/content/landing"

type Rail = (typeof rails.items)[number]

function RailCell({ item }: { item: Rail }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={80}
        closeDelay={80}
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className="group relative grid h-16 place-items-center border-b border-dashed border-border outline-none not-last:border-r lg:border-b-0 lg:not-last:border-r"
      >
        <span className="flex items-center gap-2 font-sans text-lg font-semibold tracking-[-0.01em] text-muted-foreground transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
          {item.logo !== "x402.svg" && (
            <Image
              src={`/images/logos/${item.logo}`}
              alt=""
              width={22}
              height={22}
              className="size-5.5 object-contain"
            />
          )}
          {item.logo === "x402.svg" ? (
            <>
              <Image
                src="/images/logos/x402.svg"
                alt=""
                width={60}
                height={23}
                className="h-5.5 w-auto"
              />
              <span className="sr-only">{item.name}</span>
            </>
          ) : (
            item.name
          )}
        </span>
        <span className="absolute rounded-full bg-secondary px-2 py-1 type-label text-[0.6875rem] leading-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {item.tag}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        sideOffset={12}
        className="flex w-70 flex-col gap-5 rounded-xl bg-popover p-5 ring-border"
      >
        <p className="text-base leading-5.5 font-semibold">{item.statement}</p>
        <div className="text-sm leading-5 text-muted-foreground">
          <p className="text-foreground">{item.name}</p>
          <p>{item.role}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

export function Rails() {
  const firstRow = rails.items.slice(0, 4)
  const secondRow = rails.items.slice(4)
  return (
    <section
      aria-label={`${rails.title.dim} ${rails.title.bright}`}
      className="border-t border-border px-2 lg:px-5"
    >
      <div className="border-x border-dashed border-border">
        <div className="grid grid-cols-2 border-b border-dashed border-border lg:grid-cols-6">
          {firstRow.slice(0, 2).map((item) => (
            <RailCell key={item.name} item={item} />
          ))}
          <h2 className="order-first col-span-2 grid h-16 place-items-center border-b border-dashed border-border type-label text-sm lg:order-none lg:border-r lg:border-b-0">
            <span>
              <span className="text-muted-foreground">{rails.title.dim}</span>{" "}
              {rails.title.bright}
            </span>
          </h2>
          {firstRow.slice(2).map((item) => (
            <RailCell key={item.name} item={item} />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6">
          {secondRow.map((item) => (
            <RailCell key={item.name} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}
