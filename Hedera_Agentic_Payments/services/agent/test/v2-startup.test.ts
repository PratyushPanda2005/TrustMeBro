import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireDemoAcknowledgement,
  StartupError,
} from "@trustmebro/shared/v2-startup";

test("testnet demo needs a separate explicit simulation acknowledgment", () => {
  assert.throws(
    () => requireDemoAcknowledgement("demo", {}),
    (e) => e instanceof StartupError && e.code === "DEMO_ACK_REQUIRED",
  );
  requireDemoAcknowledgement("demo", {
    V2_DEMO_ACK: "I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED",
  });
  requireDemoAcknowledgement("real", {});
});

for (const args of [["--diagnose"], ["--read-only", "--once"]])
  test(`${args.join(" ")} overrides live environment, preserves persisted jobs and reports wrong chain safely`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmb-startup-cli-")),
      jobs = join(dir, "jobs"),
      runtime = join(dir, "runtime");
    mkdirSync(jobs);
    mkdirSync(runtime);
    const job = join(jobs, "0x" + "33".repeat(32) + ".json"),
      lock = join(runtime, "worker.lock");
    writeFileSync(job, JSON.stringify({ state: "payment_unknown" }));
    writeFileSync(lock, "existing-lock-do-not-touch");
    const before = [readFileSync(job, "utf8"), readFileSync(lock, "utf8")],
      methods: string[] = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      methods.push(request.method);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({ jsonrpc: "2.0", id: request.id, result: "0x1" }),
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw Error("No listener");
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        WHITECHAIN_RPC: `http://127.0.0.1:${address.port}`,
        V2_STATE_DIR: dir,
        V2_EXECUTE: "I_AUTHORIZE_LIVE_HEDERA_PAYMENTS_AND_WHITECHAIN_RELAYS",
        RELAYER_PRIVATE_KEY: "SENTINEL_SECRET_MUST_NOT_APPEAR",
        AGENT_HEDERA_PRIVATE_KEY: "SENTINEL_SECRET_MUST_NOT_APPEAR",
      };
      delete env.VERIFIER_ADDRESS;
      delete env.SERVICE_SIGNER_PRIVATE_KEY;
      delete env.V2_ENV_FILE;
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "src/v2-main.ts", ...args],
        {
          cwd: fileURLToPath(new URL("../", import.meta.url)),
          env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (b) => (output += b));
      child.stderr.on("data", (b) => (output += b));
      const timer = setTimeout(() => child.kill(), 20000);
      const [code] = await once(child, "exit");
      clearTimeout(timer);
      assert.equal(code, 1);
      assert.match(output, /CHAIN_MISMATCH/);
      assert.ok(!output.includes("SENTINEL_SECRET_MUST_NOT_APPEAR"));
      assert.deepEqual(methods, ["eth_chainId"]);
      assert.deepEqual(before, [
        readFileSync(job, "utf8"),
        readFileSync(lock, "utf8"),
      ]);
      assert.deepEqual(readdirSync(runtime), ["worker.lock"]);
    } finally {
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      rmSync(dir, { recursive: true, force: true });
    }
  });
