import Image from "next/image"

import { stories } from "@/content/landing"

import { CtaLink } from "../cta-link"
import { Band, Container, SectionTitle } from "../layout"

type Story = (typeof stories.items)[number]

function StoryCard({ image, stat, statLabel, title, label }: Story) {
  return (
    <li className="flex flex-col">
      <div className="relative aspect-[1.78] overflow-hidden">
        <Image
          src={`/images/landing/${image}.jpg`}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 flex flex-col justify-end p-5 text-foreground">
          <p className="type-label">{statLabel}</p>
          <p className="text-7xl leading-18 type-display">{stat}</p>
        </div>
      </div>
      <h3 className="mt-5 flex-1 text-2xl leading-8 font-light">{title}</h3>
      <p className="mt-6 type-label text-sm">{label}</p>
    </li>
  )
}

export function Stories() {
  return (
    <Band id={stories.id}>
      <Container className="py-20">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <SectionTitle>{stories.title}</SectionTitle>
          <CtaLink href={stories.cta.href} tone="outline" size="sm" arrow>
            {stories.cta.label}
          </CtaLink>
        </div>
        <ul className="mt-11 grid gap-10 lg:grid-cols-3">
          {stories.items.map((story) => (
            <StoryCard key={story.label} {...story} />
          ))}
        </ul>
      </Container>
    </Band>
  )
}
