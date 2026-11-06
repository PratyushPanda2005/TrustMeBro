export type Logger = {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

function line(level: string, message: string, data?: Record<string, unknown>): string {
  const extra = data ? ` ${JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))}` : ""
  return `${new Date().toISOString()} ${level} ${message}${extra}`
}

export const consoleLogger: Logger = {
  info: (m, d) => console.log(line("INFO ", m, d)),
  warn: (m, d) => console.warn(line("WARN ", m, d)),
  error: (m, d) => console.error(line("ERROR", m, d)),
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} }
