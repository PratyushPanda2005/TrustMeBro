import { closing } from "@/content/landing"

import { CtaLink } from "../cta-link"
import { Container, SectionTitle } from "../layout"

export function ClosingCta() {
  return (
    <section>
      <Container className="flex flex-col items-center pt-24 pb-30 text-center">
        <SectionTitle className="max-w-115">{closing.title}</SectionTitle>
        <CtaLink href={closing.cta.href} arrow className="mt-7">
          {closing.cta.label}
        </CtaLink>
      </Container>
    </section>
  )
}
