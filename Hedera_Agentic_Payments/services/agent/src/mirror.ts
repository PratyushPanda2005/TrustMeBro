/** Hedera Mirror Node checks shared by the e2e scripts: the agent's real USDC balance and the audit topic. */
import { HEDERA_MIRROR, type HcsMessage } from "@tmb/shared";
import { decodeMirrorMessages } from "@tmb/audit";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mirror<T>(path: string): Promise<T> {
  const res = await fetch(HEDERA_MIRROR + path);
  if (!res.ok) throw new Error(`mirror node ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export async function usdcBalance(account: string, token: string): Promise<bigint> {
  const body = await mirror<{ tokens: { balance: number }[] }>(`/api/v1/accounts/${account}/tokens?token.id=${token}`);
  return BigInt(body.tokens[0]?.balance ?? 0);
}

/** Mirror Node lags consensus by a few seconds: wait for the expected change, or settle on what is there. */
export async function chargedSince(account: string, token: string, before: bigint, expected: bigint): Promise<bigint> {
  const deadline = Date.now() + (expected > 0n ? 30_000 : 10_000);
  let charged = before - (await usdcBalance(account, token));
  while (charged !== expected && Date.now() < deadline) {
    await sleep(2000);
    charged = before - (await usdcBalance(account, token));
  }
  return charged;
}

/** All messages on the topic, oldest first. */
export async function topicMessages(topic: string): Promise<HcsMessage[]> {
  const out: HcsMessage[] = [];
  let next: string | null = `/api/v1/topics/${topic}/messages?limit=100&order=asc`;
  while (next) {
    const body: any = await mirror(next);
    out.push(...decodeMirrorMessages(body).map(({ topicSequence, consensusTimestamp, ...m }) => m as HcsMessage));
    next = body.links?.next ?? null;
  }
  return out;
}

/** Waits until every message this run wrote is on the topic (or 30 s), then checks the hash chain. */
export async function checkTopic(topic: string, written: HcsMessage[], verifyChain: (m: HcsMessage[]) => { ok: boolean }) {
  let onTopic: HcsMessage[] = [];
  const deadline = Date.now() + 30_000;
  const want = new Set(written.map((m) => m.hash));
  while (Date.now() < deadline) {
    onTopic = await topicMessages(topic);
    if (written.every((m) => onTopic.some((t) => t.hash === m.hash))) break;
    await sleep(3000);
  }
  // An exact resend (at-least-once delivery) is on the topic twice: count each message once.
  const found = new Set(onTopic.filter((t) => want.has(t.hash)).map((t) => t.hash)).size;
  const chain = verifyChain(onTopic) as { ok: boolean; brokenAt?: number; duplicates?: number };
  return { found, total: onTopic.length, chain, ok: found === written.length && chain.ok };
}
