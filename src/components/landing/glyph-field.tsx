"use client"

import { useEffect, useRef } from "react"
import { cn } from "cn"

const CELL_W = 12
const CELL_H = 14
const FRAME_MS = 140

/** Stable pseudo-random value in 0..1 for a grid cell. */
function cellNoise(col: number, row: number) {
  const value = Math.sin(col * 127.1 + row * 311.7) * 43758.5453
  return value - Math.floor(value)
}

/** Slow drifting density: tall bands that wander across the field. */
function density(col: number, row: number, t: number) {
  const band = Math.sin(col * 0.045 + t * 0.22 + Math.sin(row * 0.12) * 0.8)
  const drift = Math.sin(col * 0.013 - t * 0.14)
  const shimmer = Math.sin(col * 0.3 + row * 0.5 + t * 0.9)
  return 0.5 + 0.34 * band + 0.14 * drift + 0.1 * shimmer
}

/**
 * Animated field of currency glyphs. Purely decorative: it pauses off-screen
 * and renders one static frame for people who prefer reduced motion.
 */
export function GlyphField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const sans = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-brand-sans")
      .trim()

    let bright = ""
    let dim = ""
    let faint = ""
    const readColors = () => {
      const styles = getComputedStyle(canvas)
      bright = styles.getPropertyValue("--foreground").trim()
      dim = styles.getPropertyValue("--subtle").trim()
      faint = styles.getPropertyValue("--border").trim()
    }
    readColors()

    let width = 0
    let height = 0

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height)
      const cols = Math.ceil(width / CELL_W)
      const rows = Math.ceil(height / CELL_H)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const noise = cellNoise(col, row)
          const x = col * CELL_W + 2
          const y = row * CELL_H + 11
          if (density(col, row, t) * noise > 0.3) {
            const strong = noise > 0.86
            ctx.fillStyle = strong ? bright : dim
            ctx.globalAlpha = strong ? 0.42 : 0.85
            ctx.fillText((noise * 100) % 3 < 1 ? "₮" : "$", x, y)
            ctx.globalAlpha = 1
          } else {
            ctx.fillStyle = faint
            ctx.fillText("/", x, y)
          }
        }
      }
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const box = canvas.getBoundingClientRect()
      width = box.width
      height = box.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `12px ${sans}, sansspace`
      draw(performance.now() / 1000)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    // Colours are baked into the canvas, so repaint when the theme flips.
    const themeObserver = new MutationObserver(() => {
      readColors()
      draw(performance.now() / 1000)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    let raf = 0
    let last = 0
    let visible = true

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!visible || now - last < FRAME_MS) return
      last = now
      draw(now / 1000)
    }

    const viewport = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    viewport.observe(canvas)

    if (!reduced.matches) raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      themeObserver.disconnect()
      viewport.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("block w-full", className)}
    />
  )
}
