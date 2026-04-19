/**
 * Parse Brazilian FIPE Valor string to integer BRL.
 * "R$ 268.000,00" -> 268000
 * "R$ 1.234,56"   -> 1235 (rounded)
 *
 * Portuguese number format: "." is thousands separator, "," is decimal.
 */
export function parseFipeValor(valor: string): number {
  if (typeof valor !== "string" || valor.length === 0) {
    throw new Error(`Invalid FIPE value: ${JSON.stringify(valor)}`);
  }
  const clean = valor.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(clean);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid FIPE value: ${JSON.stringify(valor)}`);
  }
  return Math.round(parsed);
}
