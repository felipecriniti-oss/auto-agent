import type { Opportunity } from "@/lib/mock-data/v3";
import type { Listing } from "@/lib/schemas/listing";

/**
 * Splits a vehicle description string into {marca, modelo}.
 * First token → marca, everything after → modelo.
 *
 * Examples:
 *   "Audi Q5 Performance Black" → { marca: "Audi", modelo: "Q5 Performance Black" }
 *   "BMW X3 xDrive30i"          → { marca: "BMW", modelo: "X3 xDrive30i" }
 *   "Porsche"                   → { marca: "Porsche", modelo: "" }
 *   ""                          → { marca: "", modelo: "" }
 */
export function splitVehicle(vehicle: string): { marca: string; modelo: string } {
  const trimmed = vehicle.trim();
  if (trimmed.length === 0) return { marca: "", modelo: "" };
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return { marca: trimmed, modelo: "" };
  return {
    marca: trimmed.slice(0, firstSpace),
    modelo: trimmed.slice(firstSpace + 1).trim(),
  };
}

/**
 * Extracts city from "City, State" format.
 * "Moema, SP" → "Moema"
 * "Alphaville, SP" → "Alphaville"
 * "Somewhere" → "Somewhere"
 */
export function parseCityFromLocation(location: string): string {
  const commaIdx = location.indexOf(",");
  if (commaIdx === -1) return location.trim();
  return location.slice(0, commaIdx).trim();
}

/**
 * Finds the first motivation signal that contains "dias" and extracts the number.
 * "Anúncio há 78 dias" → 78
 * "60 dias online" → 60
 * "112 dias online" → 112
 * Returns 30 (default) if not found.
 */
export function parseDiasOnline(signals: ReadonlyArray<string>, fallback = 30): number {
  for (const s of signals) {
    if (!/dias?/i.test(s)) continue;
    const match = s.match(/(\d+)/);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return fallback;
}

/**
 * Finds the first motivation signal that contains "reduç" (reduções/redução)
 * and extracts the number. Returns 0 if not found.
 *
 * "3 reduções de preço" → 3
 * "4 reduções" → 4
 * "5 reduções" → 5
 */
export function parseReducoes(signals: ReadonlyArray<string>, fallback = 0): number {
  for (const s of signals) {
    if (!/reduç/i.test(s)) continue;
    const match = s.match(/(\d+)/);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return fallback;
}

/**
 * Builds a Listing object from an Opportunity, for bootstrapping the
 * Phase 1 negotiation store programmatically (bypassing AdListingForm).
 *
 * Shape mismatches handled:
 *  - `vehicle` (single string) → split into `marca` + `modelo`
 *  - `location` (City, State) → `cidade` (City only)
 *  - `motivationSignals` (free-form chips) → best-effort parse into
 *    `diasOnline` and `reducoes`; defaults (30, 0) when unparseable
 *  - `precoPedido` ← `dealPrice` (the current seller ask in the v3 mock —
 *    the Marketplace treats dealPrice as "Preço acordado" but for a fresh
 *    Backstage live chat it is our starting ask anchor)
 */
export function buildListingFromOpportunity(opp: Opportunity): Listing {
  const { marca, modelo } = splitVehicle(opp.vehicle);
  return {
    marca,
    modelo,
    ano: opp.year,
    km: opp.km,
    precoPedido: opp.dealPrice,
    cidade: parseCityFromLocation(opp.location),
    diasOnline: parseDiasOnline(opp.motivationSignals),
    reducoes: parseReducoes(opp.motivationSignals),
  };
}
