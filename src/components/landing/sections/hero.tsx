import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { hero } from "@/content/landing"

import { CtaLink } from "../cta-link"
import { GlyphField } from "../glyph-field"
import { Container } from "../layout"

export function Hero() {
  return (
    <section className="flex min-h-[calc(100svh-4rem)] flex-col justify-end lg:min-h-0">
      <Container className="pt-24 pb-10 lg:pt-25">
        <h1 className="text-[2.375rem] leading-[2.625rem] type-display lg:text-[4.75rem] lg:leading-[4.625rem]">
          {hero.title[0]}
          <br />
          {hero.title[1]}
        </h1>
        <div className="mt-4 flex flex-col justify-between gap-6 lg:mt-6 lg:flex-row lg:items-end">
          <div>
            <p className="max-w-150 text-xl leading-7 font-light">
              {hero.lead}{" "}
              <span className="text-muted-foreground">{hero.support}</span>
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <CtaLink href={hero.primary.href} arrow>
                {hero.primary.label}
              </CtaLink>
              <CtaLink href={hero.secondary.href} tone="outline">
                {hero.secondary.label}
              </CtaLink>
            </div>
          </div>
          <Link
            href={hero.aside.href}
            className="group hidden items-center gap-3 pb-2 text-sm tracking-[0.06em] uppercase lg:inline-flex"
          >
            <span className="grid size-5 place-items-center rounded-full bg-muted">
              <span className="size-1.5 rounded-full bg-foreground" />
            </span>
            {hero.aside.label}
            <ArrowRight
              className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </Link>
        </div>
      </Container>
      <GlyphField className="h-45 border-t border-border lg:h-63" />
    </section>
  )
}
