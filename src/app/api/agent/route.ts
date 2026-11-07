import { connection, NextResponse } from "next/server"

import { readTradeMetadata, saveHeartbeat } from "@/lib/chain/config"

/** Trade details include private goods data, so only the agent can read them. */
const isAgent = (request: Request) =>
  Boolean(process.env.AGENT_SYNC_TOKEN) &&
  request.headers.get("authorization") ===
    `Bearer ${process.env.AGENT_SYNC_TOKEN}`

const refused = () => NextResponse.json({ error: "Forbidden" }, { status: 403 })

export async function GET(request: Request) {
  await connection()
  if (!isAgent(request)) return refused()
  return NextResponse.json(await readTradeMetadata())
}

export async function POST(request: Request) {
  if (!isAgent(request)) return refused()
  await saveHeartbeat()
  return NextResponse.json({ ok: true })
}
