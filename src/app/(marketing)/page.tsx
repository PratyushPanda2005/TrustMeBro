import { ClosingCta } from "@/components/landing/sections/closing-cta"
import { Developers } from "@/components/landing/sections/developers"
import { Hero } from "@/components/landing/sections/hero"
import { Rails } from "@/components/landing/sections/rails"
import { SiteFooter } from "@/components/landing/sections/site-footer"
import { SiteHeader } from "@/components/landing/sections/site-header"
import { Solutions } from "@/components/landing/sections/solutions"
import { StackStory } from "@/components/landing/sections/stack-story"
import { Stories } from "@/components/landing/sections/stories"

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Rails />
        <StackStory />
        <Solutions />
        <Stories />
        <Developers />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  )
}
