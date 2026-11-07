import { readFileSync, writeFileSync } from "node:fs";

/** Set both to run this agent against a hosted dashboard. Unset, it's local files only. */
const hosted = () => {
  const url = process.env.DASHBOARD_URL,
    token = process.env.AGENT_SYNC_TOKEN;
  if (!url || !token) return undefined;
  return {
    url: `${url.replace(/\/$/, "")}/api/agent`,
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  };
};

/** The hosted dashboard saves new trades, so the agent copies them to its own file. */
export async function pullHostedTrades(file: string) {
  const target = hosted();
  if (!target) return;
  try {
    const res = await fetch(target.url, target);
    if (!res.ok) throw Error(`status ${res.status}`);
    const remote = (await res.json()) as Record<string, unknown>;
    const local = JSON.parse(readFileSync(file, "utf8"));
    if (Object.keys(remote).some((id) => !(id in local)))
      writeFileSync(file, JSON.stringify({ ...remote, ...local }, null, 2));
  } catch (error) {
    console.error(`Hosted trades unavailable: ${(error as Error).message}`);
  }
}

export async function sendHostedHeartbeat() {
  const target = hosted();
  if (!target) return;
  await fetch(target.url, { ...target, method: "POST" }).catch(() => undefined);
}
