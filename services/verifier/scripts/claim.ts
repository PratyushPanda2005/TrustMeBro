// Creates an approved + claimed deal on the local stack, so the agent sees a Claimed event.
//
//   npm run claim -- <containerNo> [scenario] [declaredKg]
//   npm run claim -- MSKU0000666 short-weight

import { existsSync, readFileSync } from "node:fs"

import { SCENARIOS, type Scenario } from "../src/scenarios"
import { createClaimedDeal, type LocalDeployment } from "./local-chain"

const [containerNo = `MSKU${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, scenario, kg] = process.argv.slice(2)
if (scenario && !SCENARIOS.includes(scenario as Scenario)) {
  console.error(`Unknown scenario "${scenario}". Use one of: ${SCENARIOS.join(", ")}`)
  process.exit(1)
}
if (!existsSync("local-deployment.json")) {
  console.error('local-deployment.json not found. Start the stack first with "npm run local".')
  process.exit(1)
}
const dep = JSON.parse(readFileSync("local-deployment.json", "utf8")) as LocalDeployment

if (scenario) {
  const verifierUrl = process.env.VERIFIER_URL ?? `http://localhost:${process.env.PORT ?? 4021}`
  const res = await fetch(`${verifierUrl}/demo/scenarios/${encodeURIComponent(containerNo)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-demo-token": process.env.DEMO_TOKEN ?? "local-demo-token" },
    body: JSON.stringify({ scenario }),
  })
  if (!res.ok) {
    console.error(`Could not set the scenario at ${verifierUrl}: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
}

const id = await createClaimedDeal(dep, { containerNo, declaredKg: kg ? Number(kg) : undefined })
console.log(`Deal ${id} claimed: container ${containerNo}, scenario ${scenario ?? "(verifier default)"}`)
