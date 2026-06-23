// Isolate persistence for tests. config.dbPath is derived from process.cwd()
// (config.ts), and db.ts opens that file at import time. By chdir-ing into a
// fresh temp dir BEFORE any harness module loads, every checkpoint/alarm write
// lands in a throwaway db — the real data/harness.db is never touched.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.chdir(mkdtempSync(join(tmpdir(), "solo-harness-test-")));
