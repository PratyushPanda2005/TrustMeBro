import { cn } from "cn"

import type { MockTone, Solution } from "@/content/landing"

const toneText: Record<MockTone, string> = {
  default: "text-foreground",
  success: "text-success",
  danger: "text-destructive",
}

/** Illustrative product card: header, headline figure, facts and a feed. */
export function DealMock({
  title,
  subtitle,
  tag,
  tone,
  statLabel,
  stat,
  cells,
  feedTitle,
  feed,
}: Solution["mock"]) {
  return (
    <div className="w-full max-w-110 rounded-xl border border-border bg-card p-6">
      <div className="flex justify-between gap-4 text-[0.9375rem] leading-5.5 tabular-nums">
        <div className="uppercase">
          <p className="font-medium">{title}</p>
          <p className="font-medium text-muted-foreground">{subtitle}</p>
        </div>
        <p className={cn("uppercase", toneText[tone])}>{tag}</p>
      </div>

      <div className="mt-3 flex flex-col gap-3 dot-grid bg-size-[14px_14px] py-1">
        <p className="w-fit bg-card pr-2 leading-6 text-muted-foreground">
          {statLabel}
        </p>
        <p className="ml-auto w-fit bg-card pl-2 text-[2rem] leading-10 tabular-nums sm:text-4xl">
          {stat}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2"
          >
            <dt className="text-sm text-muted-foreground">{cell.label}</dt>
            <dd className="text-[0.8125rem] whitespace-nowrap tabular-nums">
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 leading-6 text-muted-foreground">{feedTitle}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {feed.map((row) => (
          <li
            key={row.name}
            className="flex items-center gap-3 text-sm leading-5.5"
          >
            <span>{row.name}</span>
            <span className="text-muted-foreground">{row.detail}</span>
            <span
              className={cn(
                "ml-auto text-[0.8125rem] tabular-nums",
                toneText[row.tone ?? "default"],
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
