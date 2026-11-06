import { connection, NextResponse } from "next/server"

import { readState } from "@/lib/chain/read"
import { runAction, type TradeAction } from "@/lib/chain/trade"

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong"

export async function GET() {
  await connection()
  try {
    return NextResponse.json(await readState())
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    await runAction((await request.json()) as TradeAction)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 })
  }
}
