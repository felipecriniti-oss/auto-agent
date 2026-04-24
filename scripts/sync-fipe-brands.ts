#!/usr/bin/env tsx
/**
 * sync-fipe-brands.ts — manual regenerator for src/lib/brasil/fipe-brands-snapshot.json
 *
 * Purpose: D-03 — keeps the static FIPE brands snapshot fresh without leaning on
 * Parallelum at runtime. Run this manually whenever Parallelum publishes new marcas.
 *
 * Usage:
 *   pnpm sync:fipe
 *   # or
 *   pnpm tsx scripts/sync-fipe-brands.ts
 *
 * Env: none required (Parallelum is public, no API key).
 *
 * NOT IN CI. NOT IN BUILD. This script is exclusively a human-triggered tool.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Lightweight .env.local loader — kept for parity with scripts/seed-dev.ts
function loadDotEnv(): void {
  try {
    const path = resolve(process.cwd(), ".env.local");
    const contents = readFileSync(path, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const valRaw = line.slice(eq + 1).trim();
      const val = valRaw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local not found — fine, this script doesn't need secrets
  }
}

loadDotEnv();

const PARALLELUM_URL = "https://parallelum.com.br/fipe/api/v1/carros/marcas";
const OUTPUT_PATH = resolve(process.cwd(), "src/lib/brasil/fipe-brands-snapshot.json");

type Marca = { codigo: string; nome: string };

async function main(): Promise<void> {
  console.log(`Fetching brands from ${PARALLELUM_URL}...`);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);
  let brands: Marca[];
  try {
    const res = await fetch(PARALLELUM_URL, { signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`Parallelum returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new Error("Parallelum returned non-array body");
    }
    brands = body
      .filter(
        (b): b is Marca =>
          typeof b === "object" &&
          b !== null &&
          typeof (b as { codigo?: unknown }).codigo === "string" &&
          typeof (b as { nome?: unknown }).nome === "string",
      )
      .map((b) => ({ codigo: b.codigo, nome: b.nome }));
  } finally {
    clearTimeout(timeout);
  }

  if (brands.length < 50) {
    throw new Error(`Expected ≥50 brands from Parallelum, got ${brands.length}`);
  }

  // Sort stably by nome for deterministic diffs
  brands.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const snapshot = {
    generated_at: new Date().toISOString(),
    source: "parallelum.com.br/fipe/api/v1/carros/marcas",
    brands,
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote ${brands.length} brands to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("sync-fipe-brands failed:", err);
  process.exit(1);
});
