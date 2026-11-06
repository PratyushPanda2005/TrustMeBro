import Link from "next/link"

import { footer } from "@/content/landing"

import { externalProps } from "../cta-link"
import { Container } from "../layout"
import { Logo } from "../logo"

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <Container className="grid gap-12 py-20 lg:grid-cols-[300px_1fr] lg:gap-15">
        <div>
          <Logo />
          <div className="mt-6 flex flex-col gap-3 text-sm leading-4 font-light text-muted-foreground">
            {footer.legal.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-10 md:grid-cols-4 lg:gap-5"
        >
          {footer.columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-medium tracking-[0.06em] text-foreground/75 uppercase">
                {column.title}
              </h2>
              <ul className="mt-5 flex flex-col gap-2 text-[0.9375rem] leading-5.5 font-light text-muted-foreground">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      {...externalProps(link.href)}
                      className="transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
      <div className="border-t border-border">
        <Container className="flex flex-wrap justify-between gap-2 py-5 text-sm font-light text-muted-foreground">
          <p>{footer.copyright}</p>
          <p>{footer.note}</p>
        </Container>
      </div>
    </footer>
  )
}
