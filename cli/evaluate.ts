/**
 * Batch evaluation command (Appendix B).
 *
 * Reads a JSON array of BatchCase objects from --input, runs makeKit() on each
 * (isolated in try/catch so one failure does not abort the run), and writes a
 * BatchOutput document to --output.
 *
 * Usage:
 *   npm run evaluate -- --input cli/cases.example.json --output kits.json
 *
 * This file is REAL and working against the stub makeKit. The owner only needs
 * to flesh out makeKit(); the batch harness stays as-is.
 */
import { readFile, writeFile } from "node:fs/promises";
import { makeKit } from "../src/core/pipeline";
import type { BatchCase, BatchOutput, BatchResult } from "../src/core/types";

const OUTPUT_VERSION = "1";

function parseArgs(argv: string[]): { input: string; output: string } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "--output") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      args.set(arg.slice(2), value);
      i += 1;
    }
  }
  const input = args.get("input");
  const output = args.get("output");
  if (!input || !output) {
    throw new Error(
      "Usage: npm run evaluate -- --input <cases.json> --output <kits.json>"
    );
  }
  return { input, output };
}

async function readCases(path: string): Promise<BatchCase[]> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected a JSON array of cases in ${path}`);
  }
  return parsed as BatchCase[];
}

async function runCase(testCase: BatchCase): Promise<BatchResult> {
  try {
    const kit = await makeKit({
      jd: testCase.jd,
      company_url: testCase.company_url,
      days: testCase.days,
    });
    return { id: testCase.id, status: "ok", kit, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: testCase.id,
      status: "failed",
      kit: null,
      error: { code: "MAKE_KIT_FAILED", message },
    };
  }
}

async function main(): Promise<void> {
  const { input, output } = parseArgs(process.argv.slice(2));
  const cases = await readCases(input);

  const results: BatchResult[] = [];
  for (const testCase of cases) {
    results.push(await runCase(testCase));
  }

  const doc: BatchOutput = {
    version: OUTPUT_VERSION,
    generated_at: new Date().toISOString(),
    kits: results,
  };

  await writeFile(output, JSON.stringify(doc, null, 2), "utf8");

  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.length - ok;
  process.stdout.write(
    `Wrote ${results.length} result(s) to ${output} (${ok} ok, ${failed} failed)\n`
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`evaluate: ${message}\n`);
  process.exit(1);
});
