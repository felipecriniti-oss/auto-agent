import localidades from "./ibge-localidades.json";

export const UFS = localidades.ufs as readonly string[];

export type UF = (typeof UFS)[number];

const CIDADES_POR_UF = localidades.cidadesPorUf as Record<string, readonly string[]>;

export function cidadesDoUf(uf: string): readonly string[] {
  return CIDADES_POR_UF[uf] ?? [];
}

export function ufExiste(uf: string): boolean {
  return UFS.includes(uf);
}

export function cidadeExisteNoUf(uf: string, cidade: string): boolean {
  const list = CIDADES_POR_UF[uf];
  if (!list) return false;
  const needle = cidade.trim().toLocaleLowerCase("pt-BR");
  return list.some((c) => c.toLocaleLowerCase("pt-BR") === needle);
}
