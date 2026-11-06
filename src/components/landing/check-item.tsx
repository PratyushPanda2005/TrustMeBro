import { CircleCheck } from "lucide-react"

export function CheckItem({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <li className="flex gap-3.5">
      <CircleCheck
        className="mt-0.5 size-6 shrink-0 fill-success text-background"
        strokeWidth={2}
        aria-hidden="true"
      />
      <div>
        <h3 className="text-lg leading-6.5">{title}</h3>
        <p className="mt-1 text-lg leading-6.5 text-muted-foreground">
          {description}
        </p>
      </div>
    </li>
  )
}
