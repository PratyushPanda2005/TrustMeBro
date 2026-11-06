import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** One writer for the whole payment ledger, not just one lock per trade. No timed lock stealing. */
export class JobStore<T extends { jobId: string }> {
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }
  lock() {
    const file = join(this.directory, "worker.lock");
    // Serialize stale-owner recovery too; two restarting workers must never unlink
    // a newly acquired lock. A crash in this tiny gate fails closed for operator review.
    const gate = file + ".gate",
      gateFd = openSync(gate, "wx");
    closeSync(gateFd);
    try {
      if (existsSync(file)) {
        const owner = JSON.parse(readFileSync(file, "utf8")) as { pid: number };
        let dead = false;
        try {
          process.kill(owner.pid, 0);
        } catch (e) {
          dead = (e as NodeJS.ErrnoException).code === "ESRCH";
        }
        if (!dead) throw Error("V2 worker already owns this state directory");
        unlinkSync(file);
      }
      const fd = openSync(file, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid }));
      fsyncSync(fd);
      closeSync(fd);
      return () => unlinkSync(file);
    } finally {
      unlinkSync(gate);
    }
  }
  get(id: string): T | undefined {
    const file = this.path(id);
    return existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : undefined;
  }
  put(value: T) {
    const target = this.path(value.jobId),
      temp = target + "." + randomUUID() + ".tmp";
    const fd = openSync(temp, "wx");
    try {
      writeFileSync(
        fd,
        JSON.stringify(value, (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, target);
  }
  list(): T[] {
    return readdirSync(this.directory)
      .filter((name) => /^0x[\da-f]{64}\.json$/i.test(name))
      .map(
        (name) =>
          JSON.parse(readFileSync(join(this.directory, name), "utf8")) as T,
      );
  }
  private path(id: string) {
    if (!/^0x[\da-f]{64}$/i.test(id)) throw Error("Invalid job ID");
    return join(this.directory, id + ".json");
  }
}
