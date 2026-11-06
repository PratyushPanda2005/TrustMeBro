"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ArrowLeftRight, ShieldCheck, TrendingUp } from "lucide-react"
import { cn } from "cn"

import { solutions, type Solution } from "@/content/landing"

import { CodeView } from "../code-view"
import { CtaLink } from "../cta-link"
import { Band, SectionTitle } from "../layout"
import { DealMock } from "../deal-mock"

const ROTATE_MS = 9000

const bulletIcons = {
  shield: ShieldCheck,
  swap: ArrowLeftRight,
  trend: TrendingUp,
}

function SolutionItem({
  item,
  open,
  running,
  onSelect,
  onDone,
}: {
  item: Solution
  open: boolean
  running: boolean
  onSelect: () => void
  onDone: () => void
}) {
  return (
    <li className="relative border-t border-border first:border-t-0">
      {open ? (
        <span
          aria-hidden="true"
          onAnimationEnd={onDone}
          className="absolute -top-px left-0 h-px w-full origin-left bg-foreground motion-reduce:hidden"
          style={{
            animation: `progress-fill ${ROTATE_MS}ms linear both`,
            animationPlayState: running ? "running" : "paused",
          }}
        />
      ) : null}
      <h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={onSelect}
          className={cn(
            "block w-full py-4 text-left type-display transition-[color,font-size] duration-300",
            open
              ? "text-[2rem] leading-10"
              : "cursor-pointer text-2xl leading-8 text-muted-foreground hover:text-foreground",
          )}
        >
          {item.title}
        </button>
      </h3>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-500",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden" inert={!open}>
          <p className="max-w-115 leading-6">{item.description}</p>
          <ul className="mt-5 flex flex-col gap-2.5">
            {item.bullets.map((bullet) => {
              const Icon = bulletIcons[bullet.icon]
              return (
                <li
                  key={bullet.label}
                  className="flex items-center gap-3 leading-6"
                >
                  <Icon
                    className="size-5 text-muted-foreground"
                    strokeWidth={1.25}
                    aria-hidden="true"
                  />
                  {bullet.label}
                </li>
              )
            })}
          </ul>
          <CtaLink
            href="#products"
            tone="outline"
            size="sm"
            className="mt-5 mb-8"
          >
            Learn more
          </CtaLink>
        </div>
      </div>
    </li>
  )
}

function ViewToggle({
  api,
  onChange,
}: {
  api: boolean
  onChange: (api: boolean) => void
}) {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background">
      <label className="flex cursor-pointer items-center gap-3 px-3 py-1 text-xs">
        <span>UI</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Show API response"
          checked={api}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="relative h-4.5 w-9 rounded-full bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
          <span
            className={cn(
              "absolute top-0.5 left-1 size-3.5 rounded-full bg-foreground transition-transform",
              api && "translate-x-3.5",
            )}
          />
        </span>
        <span>API</span>
      </label>
    </div>
  )
}

export function Solutions() {
  const [index, setIndex] = useState(0)
  const [api, setApi] = useState(false)
  const [auto, setAuto] = useState(true)
  const [inView, setInView] = useState(false)
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.3 },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const current = solutions.items[index]

  return (
    <Band id="solutions" ref={rootRef}>
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-2">
        <div className="px-7 pt-20 pb-16 lg:pr-12 lg:pl-15">
          <SectionTitle>{solutions.title}</SectionTitle>
          <ul className="mt-8">
            {solutions.items.map((item, itemIndex) => (
              <SolutionItem
                key={item.title}
                item={item}
                open={itemIndex === index}
                running={auto && inView}
                onSelect={() => {
                  setIndex(itemIndex)
                  setAuto(false)
                }}
                onDone={() =>
                  setIndex((value) => (value + 1) % solutions.items.length)
                }
              />
            ))}
          </ul>
        </div>

        <div className="relative isolate min-h-[640px] overflow-hidden bg-background lg:mr-5 lg:ml-2 lg:min-h-[800px]">
          {solutions.items.map((item, itemIndex) => (
            <Image
              key={item.image}
              src={`/images/landing/${item.image}.jpg`}
              alt=""
              fill
              loading={itemIndex === 0 ? "eager" : "lazy"}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className={cn(
                "-z-10 object-cover transition-opacity duration-700",
                !api && itemIndex === index ? "opacity-100" : "opacity-0",
              )}
            />
          ))}
          {api ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-size-[86px_116px]"
            />
          ) : null}
          <div className="grid h-full place-items-center px-5 pt-10 pb-20">
            {api ? (
              <div className="w-full max-w-110 rounded-xl border border-border bg-card p-6">
                <p className="text-sm font-medium tracking-[0.04em] text-muted-foreground uppercase">
                  API response
                </p>
                <CodeView
                  className="mt-3"
                  code={JSON.stringify(current.api, null, 2)}
                />
              </div>
            ) : (
              <DealMock {...current.mock} />
            )}
          </div>
          <ViewToggle api={api} onChange={setApi} />
        </div>
      </div>
    </Band>
  )
}
