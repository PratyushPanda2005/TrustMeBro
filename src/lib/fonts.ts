import { DM_Sans, IBM_Plex_Mono } from "next/font/google"

/**
 * Brand typefaces. DM Sans is the only text face on the site, and the mono is
 * kept for code and hashes. Everything reads these CSS variables, so swapping a
 * family only touches this file.
 */
export const fontSans = DM_Sans({
  variable: "--font-brand-sans",
  subsets: ["latin"],
})

export const fontMono = IBM_Plex_Mono({
  variable: "--font-brand-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
})
