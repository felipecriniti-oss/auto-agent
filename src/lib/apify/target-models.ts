/**
 * D-06 LOCKED: Top-20 best-selling cars in Brazil 2025 (Fenabrave registration data).
 * Each entry produces one `startUrl` for the Apify scheduled run.
 *
 * Hardcoded by design (per CONTEXT.md D-06). When admin UI ships in Phase 12+,
 * this list moves to a DB table.
 */
export interface TargetModel {
  brand: string;
  model: string;
  /** WebMotors estoque URL — actor accepts startUrls of this exact shape. */
  url: string;
}

export const TARGET_MODELS: readonly TargetModel[] = [
  {
    brand: "Volkswagen",
    model: "Polo",
    url: "https://www.webmotors.com.br/carros/estoque?marca=volkswagen&modelo=polo",
  },
  {
    brand: "Hyundai",
    model: "HB20",
    url: "https://www.webmotors.com.br/carros/estoque?marca=hyundai&modelo=hb20",
  },
  {
    brand: "Fiat",
    model: "Strada",
    url: "https://www.webmotors.com.br/carros/estoque?marca=fiat&modelo=strada",
  },
  {
    brand: "Chevrolet",
    model: "Onix",
    url: "https://www.webmotors.com.br/carros/estoque?marca=chevrolet&modelo=onix",
  },
  {
    brand: "Volkswagen",
    model: "T-Cross",
    url: "https://www.webmotors.com.br/carros/estoque?marca=volkswagen&modelo=t-cross",
  },
  {
    brand: "Fiat",
    model: "Argo",
    url: "https://www.webmotors.com.br/carros/estoque?marca=fiat&modelo=argo",
  },
  {
    brand: "Toyota",
    model: "Corolla Cross",
    url: "https://www.webmotors.com.br/carros/estoque?marca=toyota&modelo=corolla-cross",
  },
  {
    brand: "Hyundai",
    model: "Creta",
    url: "https://www.webmotors.com.br/carros/estoque?marca=hyundai&modelo=creta",
  },
  {
    brand: "Chevrolet",
    model: "Tracker",
    url: "https://www.webmotors.com.br/carros/estoque?marca=chevrolet&modelo=tracker",
  },
  {
    brand: "Jeep",
    model: "Compass",
    url: "https://www.webmotors.com.br/carros/estoque?marca=jeep&modelo=compass",
  },
  {
    brand: "Honda",
    model: "HR-V",
    url: "https://www.webmotors.com.br/carros/estoque?marca=honda&modelo=hr-v",
  },
  {
    brand: "Toyota",
    model: "Corolla",
    url: "https://www.webmotors.com.br/carros/estoque?marca=toyota&modelo=corolla",
  },
  {
    brand: "Nissan",
    model: "Kicks",
    url: "https://www.webmotors.com.br/carros/estoque?marca=nissan&modelo=kicks",
  },
  {
    brand: "Volkswagen",
    model: "Saveiro",
    url: "https://www.webmotors.com.br/carros/estoque?marca=volkswagen&modelo=saveiro",
  },
  {
    brand: "Renault",
    model: "Kwid",
    url: "https://www.webmotors.com.br/carros/estoque?marca=renault&modelo=kwid",
  },
  {
    brand: "Fiat",
    model: "Fastback",
    url: "https://www.webmotors.com.br/carros/estoque?marca=fiat&modelo=fastback",
  },
  {
    brand: "Chevrolet",
    model: "Spin",
    url: "https://www.webmotors.com.br/carros/estoque?marca=chevrolet&modelo=spin",
  },
  {
    brand: "Volkswagen",
    model: "Nivus",
    url: "https://www.webmotors.com.br/carros/estoque?marca=volkswagen&modelo=nivus",
  },
  {
    brand: "Honda",
    model: "Civic",
    url: "https://www.webmotors.com.br/carros/estoque?marca=honda&modelo=civic",
  },
  {
    brand: "Jeep",
    model: "Renegade",
    url: "https://www.webmotors.com.br/carros/estoque?marca=jeep&modelo=renegade",
  },
] as const;
