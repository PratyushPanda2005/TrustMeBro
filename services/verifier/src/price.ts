const USDC_DECIMALS = 6

/** "$0.30" -> "300000" (USDC has 6 decimals). */
export function usdcUnits(price: string): string {
  const match = /^\$?(\d+)(?:\.(\d{1,6}))?$/.exec(price.trim())
  if (!match) throw new Error(`PRICE must look like "$0.30", got "${price}"`)
  const [, whole, frac = ""] = match
  return (BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(frac.padEnd(USDC_DECIMALS, "0"))).toString()
}
