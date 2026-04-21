/**
 * Pilot mode — 5 pre-built opportunities that drip-feed into the Marketplace
 * during the "Modo piloto" theatrical sequence on the Dashboard.
 *
 * Narrative: the lojista clicks "Iniciar modo piloto"; the agent
 * "searches" WebMotors/OLX/Mercado Livre; opportunities materialize one by
 * one over ~30 seconds, ending with a summary toast.
 *
 * These cars are deliberately DIFFERENT from `mockOpportunities` (ids 1-6)
 * so the UX feels like fresh results arriving on top of the existing
 * catalog. The persona autoagente.ai §07 targets (premium/prestigio +
 * high-volume SUVs) is what the sellers' offer composition reflects.
 *
 * Ids live in the 900-999 range to avoid collisions with the baseline
 * mock set and with Apify-scraped imports which use Date.now() ids.
 */

import type { Opportunity } from "./v3";

export const pilotOpportunities: Opportunity[] = [
  {
    id: 901,
    vehicle: "Porsche Macan Turbo",
    year: 2024,
    km: 8500,
    dealPrice: 418000,
    fipe: 525000,
    savings: 107000,
    fee: 6420,
    score: 97,
    location: "Moema, SP",
    sellerName: "Helena F.",
    img: "🚙",
    color: "Preto",
    fuel: "Gasolina",
    rounds: 5,
    motivationSignals: [
      "Troca por elétrico confirmada",
      "Anúncio há 52 dias",
      "2 reduções de preço",
    ],
    ddStatus: "ok",
    timeLeft: "6d 23h",
    source: "WebMotors",
    margin: 20,
  },
  {
    id: 902,
    vehicle: "Volkswagen Golf GTI",
    year: 2023,
    km: 19200,
    dealPrice: 162000,
    fipe: 208000,
    savings: 46000,
    fee: 2760,
    score: 92,
    location: "Vila Mariana, SP",
    sellerName: "Bruno T.",
    img: "🚗",
    color: "Branco",
    fuel: "Gasolina",
    rounds: 4,
    motivationSignals: ["Segundo carro, quase não usa", "Mudança para o interior"],
    ddStatus: "ok",
    timeLeft: "6d 18h",
    source: "Mercado Livre",
    margin: 22,
  },
  {
    id: 903,
    vehicle: "Jeep Compass Limited",
    year: 2024,
    km: 14600,
    dealPrice: 168000,
    fipe: 210000,
    savings: 42000,
    fee: 2520,
    score: 89,
    location: "Pinheiros, SP",
    sellerName: "Fabrício N.",
    img: "🚙",
    color: "Cinza",
    fuel: "Flex",
    rounds: 3,
    motivationSignals: ["Vai alugar frota — não precisa mais do próprio", "38 dias online"],
    ddStatus: "ok",
    timeLeft: "7d 02h",
    source: "OLX",
    margin: 20,
  },
  {
    id: 904,
    vehicle: "Honda Civic Touring",
    year: 2023,
    km: 22100,
    dealPrice: 168000,
    fipe: 215000,
    savings: 47000,
    fee: 2820,
    score: 91,
    location: "Alphaville, SP",
    sellerName: "Raquel M.",
    img: "🚘",
    color: "Prata",
    fuel: "Gasolina",
    rounds: 4,
    motivationSignals: ["Trocando por SUV híbrido", "Anúncio há 67 dias", "3 reduções de preço"],
    ddStatus: "ok",
    timeLeft: "6d 13h",
    source: "WebMotors",
    margin: 22,
  },
  {
    id: 905,
    vehicle: "Audi A3 Sportback Performance",
    year: 2023,
    km: 16800,
    dealPrice: 179000,
    fipe: 235000,
    savings: 56000,
    fee: 3360,
    score: 94,
    location: "Itaim Bibi, SP",
    sellerName: "Marcos L.",
    img: "🚗",
    color: "Azul",
    fuel: "Gasolina",
    rounds: 6,
    motivationSignals: ["Mudança internacional (EUA) em 3 semanas", "5 reduções de preço"],
    ddStatus: "ok",
    timeLeft: "2d 08h",
    source: "WebMotors",
    margin: 24,
  },
];
