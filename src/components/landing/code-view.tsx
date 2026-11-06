import { cn } from "cn"

const TOKEN =
  /("(?:[^"\\]|\\.)*"(?=\s*:))|("(?:[^"\\]|\\.)*"|'[^']*')|(\$[A-Z_]+)|(\s-{1,2}[A-Za-z]+\b)|(^curl\b)|\b(true|false|\d+(?:\.\d+)?)\b/gm

const tones = [
  "text-muted-foreground",
  "text-foreground",
  "text-step-2",
  "text-success",
  "text-success",
  "text-step-1",
]

/** Light syntax colouring for short curl and JSON samples. */
export function CodeView({
  code,
  className,
}: {
  code: string
  className?: string
}) {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const match of code.matchAll(TOKEN)) {
    const start = match.index
    if (start > cursor) parts.push(code.slice(cursor, start))
    const tone = match.slice(1).findIndex(Boolean)
    parts.push(
      <span key={start} className={tones[tone]}>
        {match[0]}
      </span>,
    )
    cursor = start + match[0].length
  }
  parts.push(code.slice(cursor))

  return (
    <pre
      className={cn(
        "overflow-x-auto font-mono text-[0.8125rem] leading-[1.3rem] text-foreground",
        className,
      )}
    >
      <code>{parts}</code>
    </pre>
  )
}
