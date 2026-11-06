"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { cn } from "cn"

import { stack } from "@/content/landing"

import { CtaLink } from "../cta-link"
import { IsoStack } from "../iso-stack"
import { SectionTitle } from "../layout"

const STEP_COUNT = stack.steps.length
const ROW = 30

const PLATE_GAP_CLOSED = 96
const PLATE_GAP_OPEN = 310
/** Higher settles faster. The damping is what turns wheel steps into a glide. */
const DAMPING = 5

const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount

function smoothstep(from: number, to: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

const dotColor = [
  "bg-step-1 ring-step-1/25",
  "bg-step-2 ring-step-2/25",
  "bg-step-3 ring-step-3/25",
  "bg-step-4 ring-step-4/25",
]

function Intro({ className }: { className?: string }) {
  return (
    <div className={className}>
      <SectionTitle className="max-w-150 lg:text-[2.75rem] lg:leading-12">
        {stack.title.lead} {stack.title.emphasis}
      </SectionTitle>
      <p className="mt-3 max-w-115 text-xl leading-7 font-light text-foreground/85">
        {stack.body.before}{" "}
        <Link
          href={stack.body.link.href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          {stack.body.link.label}
        </Link>{" "}
        {stack.body.after}
      </p>
    </div>
  )
}

function StepLabel({ index, active }: { index: number; active: boolean }) {
  return (
    <span className="flex items-center gap-3 text-sm tracking-[0.06em] uppercase">
      <span className="text-subtle">{String(index + 1).padStart(2, "0")}</span>
      <span className={active ? "font-medium" : "text-muted-foreground"}>
        {stack.steps[index].kicker}
      </span>
    </span>
  )
}

function StepDot({ index, active }: { index: number; active: boolean }) {
  return (
    <span
      className={cn(
        "absolute top-1/2 left-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 transition-all duration-500",
        active
          ? cn("size-2.5", dotColor[index])
          : "size-1.5 bg-muted-foreground ring-muted",
      )}
    />
  )
}

/**
 * Pins for a short track while scroll walks through the deal. Plates are written
 * straight to the DOM on each frame, damped towards the scroll position, and
 * React only hears about it when the highlighted step changes.
 */
function useStackMotion() {
  const trackRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const track = trackRef.current
    const plates =
      stackRef.current?.querySelectorAll<SVGGElement>("[data-plate]")
    if (!track || !plates) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const target = () => {
      const box = track.getBoundingClientRect()
      const travel = box.height - window.innerHeight
      return Math.min(1, Math.max(0, -box.top / travel))
    }

    let current = target()
    let frame = 0
    let last = 0

    const paint = () => {
      const spread = smoothstep(0, 0.14, current)
      const focus = (plates.length - 1) * smoothstep(0.1, 0.96, current)
      plates.forEach((plate, index) => {
        const closed = (index - (plates.length - 1) / 2) * PLATE_GAP_CLOSED
        const open = (index - focus) * PLATE_GAP_OPEN
        const near = spread * Math.max(0, 1 - Math.abs(index - focus))
        plate.style.transform = `translateY(${mix(closed, open, spread).toFixed(2)}px)`
        plate.style.color = `color-mix(in srgb, var(--primary) ${Math.round(mix(40, 100, near))}%, var(--input))`
      })
      setActive(spread > 0.5 ? Math.round(focus) : -1)
    }

    const tick = (time: number) => {
      const seconds = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60
      last = time
      const goal = target()
      current = still
        ? goal
        : mix(current, goal, 1 - Math.exp(-DAMPING * seconds))
      if (Math.abs(goal - current) < 0.0005) current = goal
      paint()
      if (current === goal) {
        frame = 0
        last = 0
      } else {
        frame = requestAnimationFrame(tick)
      }
    }

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }

    paint()
    window.addEventListener("scroll", wake, { passive: true })
    window.addEventListener("resize", wake)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", wake)
      window.removeEventListener("resize", wake)
    }
  }, [])

  return { trackRef, stackRef, active }
}

export function StackStory() {
  const { trackRef, stackRef, active } = useStackMotion()

  return (
    <section id="how-it-works" className="border-t border-border">
      {/* Small screens: a plain list, no pinning. */}
      <div className="px-7 py-16 lg:hidden">
        <Intro />
        <ol className="mt-12 flex flex-col gap-10">
          {stack.steps.map((step, index) => (
            <li key={step.kicker} className="border-t border-border pt-5">
              <StepLabel index={index} active />
              <h3 className="mt-3 text-[2.25rem] leading-10 type-display">
                {step.title}
              </h3>
              <p className="mt-2 text-lg leading-6.5 font-light text-foreground/85">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* Large screens: a short pinned stepper beside the exploded stack. */}
      <div ref={trackRef} className="hidden h-[calc(100svh+1500px)] lg:block">
        <div className="sticky top-0 grid h-svh grid-cols-2 overflow-hidden">
          <div className="relative border-r border-border">
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-5 border-l border-border"
            />
            <Intro
              className={cn(
                "absolute top-1/2 left-15 -translate-y-1/2 transition-opacity duration-500",
                active >= 0 ? "pointer-events-none opacity-0" : "opacity-100",
              )}
            />
            <ol>
              {stack.steps.map((step, index) => {
                const isActive = index === active
                const after = index > active
                const style = isActive
                  ? { top: "50%", transform: "translateY(-50%)" }
                  : after
                    ? {
                        top: `calc(100% - ${(STEP_COUNT - index) * ROW + 20}px)`,
                      }
                    : { top: `${72 + index * ROW}px` }
                return (
                  <li
                    key={step.kicker}
                    style={style}
                    className="absolute inset-x-0 pl-15 transition-[top,transform] duration-700 ease-out motion-reduce:transition-none"
                  >
                    <div className="relative">
                      <span className="absolute top-2 -left-15 h-0 w-10">
                        <StepDot index={index} active={isActive} />
                      </span>
                      <StepLabel index={index} active={isActive} />
                    </div>
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-500",
                        isActive
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <div className="overflow-hidden" inert={!isActive}>
                        <h3 className="mt-2 text-[2.75rem] leading-13 type-display">
                          {step.title}
                        </h3>
                        <p className="mt-2 max-w-100 text-xl leading-7 font-light text-foreground/85">
                          {step.body}
                        </p>
                        {step.cta ? (
                          <CtaLink
                            href={step.cta.href}
                            tone="outline"
                            className="mt-8"
                          >
                            {step.cta.label}
                          </CtaLink>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
          <div className="relative grid place-items-center overflow-hidden dot-grid">
            <IsoStack ref={stackRef} className="h-[92svh] overflow-visible" />
          </div>
        </div>
      </div>
    </section>
  )
}
