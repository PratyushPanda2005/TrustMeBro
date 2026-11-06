/**
 * Agent HTTP API for the dashboard (lane A proxies it via /api/approvals):
 *   GET  /health
 *   GET  /approvals
 *   POST /approvals/:id/approve   → retries that exact payment
 *   POST /approvals/:id/reject
 */
import { createServer, type Server } from "node:http";
import type { ApprovalRecord, SpendLedger } from "./ledger.ts";

export interface ApiDeps {
  port: number;
  ledger: SpendLedger;
  token?: string;
  onApproved: (a: ApprovalRecord) => Promise<void>;
}

const toJson = (a: ApprovalRecord) => ({
  id: a.id, dealId: a.dealId, checkNo: a.checkNo, payTo: a.payTo, amount: a.amount.toString(),
  reason: a.reason, status: a.status, createdAt: new Date(a.at).toISOString(),
});

export function startApi(d: ApiDeps): Promise<Server> {
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "OPTIONS") return send(204, {});
      if (req.method === "GET" && url.pathname === "/health") return send(200, { ok: true });
      if (req.method === "GET" && url.pathname === "/approvals") {
        return send(200, { approvals: d.ledger.listApprovals().map(toJson) });
      }
      const m = url.pathname.match(/^\/approvals\/([^/]+)\/(approve|reject)$/);
      if (req.method === "POST" && m) {
        if (d.token && req.headers.authorization !== `Bearer ${d.token}`) return send(401, { error: "unauthorized" });
        const [, id, action] = m;
        const a = d.ledger.listApprovals().find((x) => x.id === id);
        if (!a) return send(404, { error: "not found" });
        if (a.status !== "pending") return send(409, { error: `already ${a.status}` });
        d.ledger.decide(id, action === "approve" ? "approved" : "rejected");
        const updated = d.ledger.listApprovals().find((x) => x.id === id)!;
        if (action === "approve") await d.onApproved(updated);
        return send(200, { approval: toJson(updated) });
      }
      return send(404, { error: "not found" });
    } catch (err) {
      return send(500, { error: (err as Error).message });
    }
  });
  return new Promise((resolve) => server.listen(d.port, "127.0.0.1", () => resolve(server)));
}
