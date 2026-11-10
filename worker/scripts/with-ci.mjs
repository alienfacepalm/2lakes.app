#!/usr/bin/env node
/**
 * Run a command with CI=true so Wrangler skips TTY confirmation prompts.
 * Agents and Windows shells otherwise hang on `d1 migrations apply`.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: with-ci.mjs <command> [args...]");
  process.exit(2);
}

const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env: { ...process.env, CI: "true" },
  shell: true,
});

process.exit(result.status === null ? 1 : result.status);
