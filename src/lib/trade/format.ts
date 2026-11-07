const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })

export const usdt = (value: number) => `${money.format(value)} USDT`
export const amount = (value: number) => whole.format(value)
export const pct = (bps: number, digits = 2) =>
  `${(bps / 100).toFixed(digits)}%`

// Fixed to UTC so server and client render the same text.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
})

export const date = (at: number) => dateFormat.format(at)
export const dateTime = (at: number) => `${timeFormat.format(at)} UTC`
export const month = (at: number) => monthFormat.format(at)

export const shortHash = (hash: string) =>
  hash.length > 18 ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : hash

/** What an admin signs to decide a payment. Each id can only be decided once. */
export const approvalMessage = (id: string, decision: string) =>
  `TrustMeBro: ${decision} agent payment ${id}`
