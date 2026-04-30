/**
 * GET /api/cnpj?cnpj=00000000000000
 *
 * Queries ReceitaWS (free public API) to fetch CNPJ data including
 * razao_social, situacao, cnae_fiscal, and address. Returns a normalized
 * payload for the onboarding Step 2 auto-fill.
 *
 * Rate limit: ReceitaWS allows 3 requests/minute on the free tier.
 * If the API is unavailable, returns a 502.
 */

import { NextResponse } from "next/server";

interface ReceitaWsResponse {
  status: string;
  nome: string;
  fantasia: string;
  situacao: string;
  tipo: string;
  abertura: string;
  atividade_principal: { code: string; text: string }[];
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  message?: string;
}

export interface CnpjLookupResult {
  razao_social: string;
  nome_fantasia: string;
  situacao: string;
  cnae_codigo: string;
  cnae_descricao: string;
  endereco: string;
  municipio: string;
  uf: string;
  cep: string;
  data_abertura: string;
  tipo: string;
}

function stripMask(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function isValidCnpjFormat(digits: string): boolean {
  if (digits.length !== 14) return false;
  // reject all-same-digit
  if (/^(\d)\1{13}$/.test(digits)) return false;
  // Validate check digits
  const calc = (slice: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(slice[i]) * w, 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  if (calc(digits, w1) !== Number(digits[12])) return false;
  if (calc(digits, w2) !== Number(digits[13])) return false;
  return true;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCnpj = searchParams.get("cnpj") ?? "";
  const digits = stripMask(rawCnpj);

  if (!isValidCnpjFormat(digits)) {
    return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${digits}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 }, // cache 24h
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Serviço de consulta indisponível" }, { status: 502 });
    }

    const data = (await res.json()) as ReceitaWsResponse;

    if (data.status === "ERROR" || data.message) {
      return NextResponse.json({ error: data.message ?? "CNPJ não encontrado" }, { status: 404 });
    }

    const result: CnpjLookupResult = {
      razao_social: data.nome,
      nome_fantasia: data.fantasia,
      situacao: data.situacao,
      cnae_codigo: data.atividade_principal?.[0]?.code ?? "",
      cnae_descricao: data.atividade_principal?.[0]?.text ?? "",
      endereco: [data.logradouro, data.numero, data.complemento].filter(Boolean).join(", "),
      municipio: data.municipio,
      uf: data.uf,
      cep: data.cep,
      data_abertura: data.abertura,
      tipo: data.tipo,
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Falha na consulta do CNPJ" }, { status: 502 });
  }
}
