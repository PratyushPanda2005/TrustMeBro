import Image from "next/image"

import { developers } from "@/content/landing"

import { CheckItem } from "../check-item"
import { CodePanel } from "../code-panel"
import { CtaLink } from "../cta-link"
import { Band, SectionTitle } from "../layout"

export function Developers() {
  return (
    <Band id="developers">
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-2">
        <div className="px-7 py-20 lg:pl-15">
          <SectionTitle>{developers.title}</SectionTitle>
          <ul className="mt-12 flex flex-col gap-5">
            {developers.features.map((feature) => (
              <CheckItem key={feature.title} {...feature} />
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap gap-4">
            <CtaLink href={developers.primary.href} arrow>
              {developers.primary.label}
            </CtaLink>
            <CtaLink href={developers.secondary.href} tone="outline">
              {developers.secondary.label}
            </CtaLink>
          </div>
        </div>
        <div className="relative isolate grid min-h-[640px] place-items-center overflow-hidden px-5 py-16 lg:mr-5">
          <Image
            src="/images/landing/ridge-light.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="-z-10 object-cover"
          />
          <CodePanel {...developers.panel} />
        </div>
      </div>
    </Band>
  )
}
