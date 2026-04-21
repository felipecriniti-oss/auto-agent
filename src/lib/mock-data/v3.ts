/**
 * v3 Product Shell mock data — extracted verbatim from AutoAgent_UX_Prototype_v3.jsx.
 * Types are inferred/declared strict; this file is the single source for Wave 0/1/2
 * screen fixtures until real APIs land (Apify, FIPE persistence, etc.).
 */

// ─── TYPES ────────────────────────────────────────────────────

export type PlanKey = "starter" | "premium" | "enterprise";

export interface PlanConfig {
  name: string;
  price: number;
  feeRate: number;
  feeLabel: string;
  dd: number | string;
  color: string;
  priority: string;
  support: string;
  description: string;
  features: string[];
  breakEvenVsStarter: number;
  hot?: boolean;
}

export type Source = "WebMotors" | "Mercado Livre" | "OLX";

export type DdStatus = "ok" | "review" | "blocked";

export interface Opportunity {
  id: number;
  vehicle: string;
  year: number;
  km: number;
  dealPrice: number;
  fipe: number;
  savings: number;
  fee: number;
  score: number;
  location: string;
  sellerName: string;
  img: string;
  color: string;
  fuel: string;
  rounds: number;
  motivationSignals: string[];
  ddStatus: DdStatus;
  timeLeft: string;
  source: Source;
  margin: number;
}

export type DealStatus = "contrato_pendente" | "laudo_agendado" | "transferindo" | "finalizado";

export interface MyDeal {
  id: number;
  vehicle: string;
  dealPrice: number;
  fipe: number;
  savings: number;
  fee: number;
  status: DealStatus;
  assumedAt: string;
  nextStep: string;
  progress: number;
  sellerContact: string;
  img: string;
}

export type NegotiationStatus = "em_andamento" | "fechando" | "negociando";

export interface NegotiationSummary {
  id: number;
  vehicle: string;
  askPrice: number;
  fipe: number;
  currentOffer: number;
  rounds: number;
  maxRounds: number;
  status: NegotiationStatus;
  projectedSavings: number;
  projectedFee: number;
}

export interface DashKPIs {
  marketplaceAtivo: number;
  meusDeals: number;
  economiaCapturadaMes: number;
  feesPagosMes: number;
  roiMes: number;
  deals_mes: number;
  desconto_medio_fipe: number;
  margem_adicional_lojista_deal: number;
  lojistas_ativos: number;
  nps_lojista: number;
  tempo_medio_deal_segundos: number;
  take_rate_blended: number;
  cac_lojista: number;
}

export type ChatTurnFrom = "agent" | "seller";

export interface ChatTurn {
  from: ChatTurnFrom;
  round: number;
  time: string;
  text: string;
}

export type ChatHistoriesByOpportunity = Record<number, ChatTurn[]>;

export interface AdminFunnel {
  anunciosScreenados: number;
  pfsAbordados: number;
  exclusividadesAssinadas: number;
  negociacoesAndamento: number;
  oportunidadesMarketplace: number;
  dealsAssumidos: number;
  dealsFinalizados: number;
  ticketMedio: number;
}

export type AgentStatus = "ativo" | "manutencao";

export interface ActiveAgent {
  id: string;
  name: string;
  status: AgentStatus;
  conversas: number;
  tempoMedio: string;
  taxaConversao: number;
  feeMedio: number;
  especialidade: string;
}

export type Motivation = "alta" | "média" | "baixa";

export type GlobalNegotiationStatus = "negociando" | "fechando";

export interface GlobalNegotiation {
  id: number;
  vehicle: string;
  askPrice: number;
  currentOffer: number;
  fipe: number;
  agent: string;
  rounds: number;
  maxRounds: number;
  daysOpen: number;
  status: GlobalNegotiationStatus;
  region: string;
  motivation: Motivation;
}

export interface PriorityModel {
  model: string;
  margemMediaCapturada: number;
  demandaLojistas: string;
  giroMedio: number;
  inventarioAtivo: number;
  recomendacao: string;
  cor: string;
}

export interface Dispute {
  id: string;
  deal: string;
  lojista: string;
  vendedor: string;
  motivo: string;
  status: string;
  valorEnvolvido: number;
  dataAbertura: string;
}

export interface MonthlyDealPoint {
  month: string;
  deals: number;
  savings: number;
  fees: number;
}

// ─── DESIGN SYSTEM TOKENS (prototype `DS` const) ─────────────

export const DS = {
  primary: "#2563EB",
  success: "#059669",
  warning: "#D97706",
  danger: "#DC2626",
  accent: "#7C3AED",
} as const;

// ─── PLAN CONFIG (prototype `PLANS` const) ───────────────────

export const plansConfig: Record<PlanKey, PlanConfig> = {
  starter: {
    name: "Starter",
    price: 0,
    feeRate: 0.08,
    feeLabel: "8%",
    dd: 10,
    color: "blue",
    priority: "Fila FIFO",
    support: "WhatsApp",
    description: "Fila FIFO · 48h exclusividade · WhatsApp suporte · sem multa",
    features: [
      "Fila FIFO (ordem de chegada)",
      "48h de exclusividade nos deals",
      "Suporte via WhatsApp",
      "Sem multa por cancelamento",
    ],
    breakEvenVsStarter: 0,
  },
  premium: {
    name: "Premium",
    price: 1490,
    feeRate: 0.04,
    feeLabel: "4%",
    dd: 50,
    color: "violet",
    priority: "Acesso antecipado 48h",
    support: "Dedicado · SLA 4h",
    description: "Acesso antecipado 48h · 7 dias exclusividade · SLA 4h · gerente dedicado",
    features: [
      "Acesso antecipado de 48h aos deals",
      "7 dias de exclusividade",
      "SLA de suporte em 4h",
      "Gerente de conta dedicado",
    ],
    breakEvenVsStarter: 0.34,
    hot: true,
  },
  enterprise: {
    name: "Enterprise",
    price: 5900,
    feeRate: 0.025,
    feeLabel: "2.5%",
    dd: "∞",
    color: "amber",
    priority: "API · tempo real",
    support: "Account Manager",
    description: "API · multi-loja até 10 CNPJs · DMS integration · onboarding white-glove",
    features: [
      "API dedicada para automação",
      "Multi-loja até 10 CNPJs",
      "Integração com DMS",
      "Onboarding white-glove",
    ],
    breakEvenVsStarter: 3,
  },
};

export function calcFee(savings: number, plan: PlanKey): number {
  return Math.round(savings * plansConfig[plan].feeRate);
}

// ─── OPPORTUNITIES ────────────────────────────────────────────

export const mockOpportunities: Opportunity[] = [
  {
    id: 1,
    vehicle: "Audi Q5 Performance Black",
    year: 2023,
    km: 28000,
    dealPrice: 198000,
    fipe: 268000,
    savings: 70000,
    fee: 4200,
    score: 95,
    location: "Moema, SP",
    sellerName: "Marcos R.",
    img: "🚗",
    color: "Preto",
    fuel: "Flex",
    rounds: 4,
    motivationSignals: ["Anúncio há 78 dias", "3 reduções de preço", "Mudança de cidade"],
    ddStatus: "ok",
    timeLeft: "5d 14h",
    source: "WebMotors",
    margin: 26,
  },
  {
    id: 2,
    vehicle: "BMW X3 xDrive30i",
    year: 2024,
    km: 11500,
    dealPrice: 245000,
    fipe: 312000,
    savings: 67000,
    fee: 4020,
    score: 91,
    location: "Alphaville, SP",
    sellerName: "Ana P.",
    img: "🚘",
    color: "Branco",
    fuel: "Gasolina",
    rounds: 3,
    motivationSignals: ["Vai trocar por modelo 2025", "60 dias online"],
    ddStatus: "ok",
    timeLeft: "6d 02h",
    source: "Mercado Livre",
    margin: 21,
  },
  {
    id: 3,
    vehicle: "Mercedes GLC 300 4MATIC",
    year: 2023,
    km: 24000,
    dealPrice: 268000,
    fipe: 348000,
    savings: 80000,
    fee: 4800,
    score: 98,
    location: "Jardins, SP",
    sellerName: "Roberto F.",
    img: "🚙",
    color: "Cinza",
    fuel: "Gasolina",
    rounds: 5,
    motivationSignals: ["94 dias online", "4 reduções", "Urgência declarada"],
    ddStatus: "ok",
    timeLeft: "3d 21h",
    source: "WebMotors",
    margin: 23,
  },
  {
    id: 4,
    vehicle: "Volvo XC60 Inscription",
    year: 2023,
    km: 18000,
    dealPrice: 218000,
    fipe: 285000,
    savings: 67000,
    fee: 4020,
    score: 88,
    location: "Itaim Bibi, SP",
    sellerName: "Fernanda M.",
    img: "🚕",
    color: "Azul",
    fuel: "Híbrido",
    rounds: 3,
    motivationSignals: ["Comprou outro carro", "45 dias online"],
    ddStatus: "review",
    timeLeft: "4d 09h",
    source: "OLX",
    margin: 24,
  },
  {
    id: 5,
    vehicle: "Range Rover Velar D300",
    year: 2022,
    km: 41000,
    dealPrice: 232000,
    fipe: 320000,
    savings: 88000,
    fee: 5280,
    score: 93,
    location: "Perdizes, SP",
    sellerName: "Carlos B.",
    img: "🚙",
    color: "Preto",
    fuel: "Diesel",
    rounds: 6,
    motivationSignals: ["112 dias online", "Mudança internacional", "5 reduções"],
    ddStatus: "ok",
    timeLeft: "1d 06h",
    source: "WebMotors",
    margin: 28,
  },
  {
    id: 6,
    vehicle: "Porsche Macan Base",
    year: 2022,
    km: 32000,
    dealPrice: 348000,
    fipe: 425000,
    savings: 77000,
    fee: 4620,
    score: 90,
    location: "Vila Nova Conceição, SP",
    sellerName: "Eduardo L.",
    img: "🚗",
    color: "Branco",
    fuel: "Gasolina",
    rounds: 4,
    motivationSignals: ["Troca por elétrico", "70 dias online"],
    ddStatus: "ok",
    timeLeft: "5d 23h",
    source: "Mercado Livre",
    margin: 18,
  },
];

// ─── MY DEALS ────────────────────────────────────────────────

export const mockMyDeals: MyDeal[] = [
  {
    id: 101,
    vehicle: "Jeep Compass Limited 2023",
    dealPrice: 142000,
    fipe: 178000,
    savings: 36000,
    fee: 2160,
    status: "contrato_pendente",
    assumedAt: "há 2h",
    nextStep: "Assinar contrato de compra/venda",
    progress: 25,
    sellerContact: "(11) 98765-4321",
    img: "🚙",
  },
  {
    id: 102,
    vehicle: "Toyota Corolla Cross XRX 2024",
    dealPrice: 158000,
    fipe: 198000,
    savings: 40000,
    fee: 2400,
    status: "laudo_agendado",
    assumedAt: "há 1d",
    nextStep: "Laudo cautelar agendado p/ amanhã 14h",
    progress: 50,
    sellerContact: "(11) 99876-5432",
    img: "🚗",
  },
  {
    id: 103,
    vehicle: "Hyundai Tucson GLS 2023",
    dealPrice: 138000,
    fipe: 174000,
    savings: 36000,
    fee: 2160,
    status: "transferindo",
    assumedAt: "há 4d",
    nextStep: "Aguardando confirmação DETRAN-SP",
    progress: 80,
    sellerContact: "(11) 98123-4567",
    img: "🚘",
  },
  {
    id: 104,
    vehicle: "Audi A3 Sedan Performance 2024",
    dealPrice: 218000,
    fipe: 268000,
    savings: 50000,
    fee: 3000,
    status: "finalizado",
    assumedAt: "há 12d",
    nextStep: "Transferência concluída",
    progress: 100,
    sellerContact: "(11) 97654-3210",
    img: "🚗",
  },
];

// ─── NEGOTIATIONS (Backstage preview) ─────────────────────────

export const mockNegotiations: NegotiationSummary[] = [
  {
    id: 201,
    vehicle: "BMW 320i M Sport 2024",
    askPrice: 218000,
    fipe: 268000,
    currentOffer: 195000,
    rounds: 4,
    maxRounds: 6,
    status: "em_andamento",
    projectedSavings: 55000,
    projectedFee: 3300,
  },
  {
    id: 202,
    vehicle: "Mercedes A200 2023",
    askPrice: 178000,
    fipe: 215000,
    currentOffer: 158000,
    rounds: 3,
    maxRounds: 5,
    status: "em_andamento",
    projectedSavings: 45000,
    projectedFee: 2700,
  },
  {
    id: 203,
    vehicle: "Volkswagen Taos Highline 2024",
    askPrice: 162000,
    fipe: 195000,
    currentOffer: 142000,
    rounds: 5,
    maxRounds: 6,
    status: "fechando",
    projectedSavings: 50000,
    projectedFee: 3000,
  },
];

// ─── DASHBOARD KPIs ──────────────────────────────────────────

export const dashKPIs: DashKPIs = {
  marketplaceAtivo: 47,
  meusDeals: 4,
  economiaCapturadaMes: 162000,
  feesPagosMes: 9720,
  roiMes: 16.7,
  deals_mes: 1420,
  desconto_medio_fipe: 24,
  margem_adicional_lojista_deal: 8400,
  lojistas_ativos: 60,
  nps_lojista: 72,
  tempo_medio_deal_segundos: 47,
  take_rate_blended: 3.1,
  cac_lojista: 68,
};

// ─── CHAT HISTORIES BY OPPORTUNITY ───────────────────────────

export const mockChatHistories: ChatHistoriesByOpportunity = {
  1: [
    {
      from: "agent",
      round: 1,
      time: "Dia 1, 14:32",
      text: "Olá Marcos, tudo bem? Sou o AutoAgente, intermediador profissional de compra de seminovos. Vi seu anúncio do Audi Q5 — ótimo carro. Tenho uma rede de lojistas verificados que pode ter interesse. Posso conversar sobre uma proposta à vista, com pagamento em até 48h?",
    },
    {
      from: "seller",
      round: 1,
      time: "Dia 1, 15:18",
      text: "Boa tarde! Pode sim. Estou pedindo R$ 260k mas aceito propostas razoáveis. Quanto vocês ofereceriam?",
    },
    {
      from: "agent",
      round: 2,
      time: "Dia 1, 15:42",
      text: "Marcos, antes de fazer a oferta vou contextualizar com dados de mercado: a FIPE atual desse modelo está em R$ 268k. Encontrei 11 anúncios similares (Q5 Performance Black 2023 com até 35k km) na sua região nos últimos 30 dias — preço médio de venda foi R$ 232k, com mediana em R$ 228k. Considerando que seu anúncio está há 78 dias online e teve 3 reduções, posso ofertar R$ 195k à vista, sem burocracia. Pagamento via escrow garantido.",
    },
    {
      from: "seller",
      round: 2,
      time: "Dia 1, 18:05",
      text: "R$ 195 está abaixo do que esperava. Aceito R$ 215k.",
    },
    {
      from: "agent",
      round: 3,
      time: "Dia 2, 09:15",
      text: "Marcos, entendo. Vamos encontrar um meio-termo. Na faixa de R$ 215k seu carro fica acima da mediana de mercado e provavelmente vai ficar mais 60+ dias online. Posso subir minha oferta para R$ 198k considerando: (1) você economiza tempo de venda; (2) tem garantia de pagamento; (3) sem visitas/test-drives chatos. Topa fechar?",
    },
    {
      from: "seller",
      round: 3,
      time: "Dia 2, 11:40",
      text: "Olha, preciso vender mas R$ 198 ainda é pouco. R$ 205k último preço, à vista.",
    },
    {
      from: "agent",
      round: 4,
      time: "Dia 2, 12:30",
      text: "Marcos, tenho autorização final de R$ 198k. É um preço competitivo considerando que cobre seu carro 100% à vista, em até 48h, com toda burocracia (laudo, contrato, transferência) por nossa conta. Você não paga nada — quem paga o nosso serviço é a loja compradora. Topa? Te envio agora o link para assinar o contrato de exclusividade de 7 dias e já começamos.",
    },
    {
      from: "seller",
      round: 4,
      time: "Dia 2, 14:55",
      text: "Tá bom, fechado por R$ 198k. Manda o link.",
    },
    {
      from: "agent",
      round: 5,
      time: "Dia 2, 14:58",
      text: "✅ Fechado! Link de exclusividade: [autoagent.com.br/exc/XYZ123]. Após assinar, sua oportunidade entra em nosso marketplace e em até 48h um lojista assume. Você recebe o pagamento via PIX em conta de sua escolha após confirmação de transferência.",
    },
  ],
};

// ─── ADMIN FUNNEL ────────────────────────────────────────────

export const mockAdminFunnel: AdminFunnel = {
  anunciosScreenados: 28430,
  pfsAbordados: 1842,
  exclusividadesAssinadas: 187,
  negociacoesAndamento: 64,
  oportunidadesMarketplace: 47,
  dealsAssumidos: 31,
  dealsFinalizados: 23,
  ticketMedio: 32100,
};

// ─── ACTIVE AGENTS ───────────────────────────────────────────

export const mockActiveAgents: ActiveAgent[] = [
  {
    id: "A-101",
    name: "Agente Alpha",
    status: "ativo",
    conversas: 18,
    tempoMedio: "1d 8h",
    taxaConversao: 12.4,
    feeMedio: 2180,
    especialidade: "SUVs premium",
  },
  {
    id: "A-102",
    name: "Agente Beta",
    status: "ativo",
    conversas: 22,
    tempoMedio: "2d 1h",
    taxaConversao: 9.8,
    feeMedio: 1640,
    especialidade: "Sedãs intermediários",
  },
  {
    id: "A-103",
    name: "Agente Gamma",
    status: "ativo",
    conversas: 14,
    tempoMedio: "1d 19h",
    taxaConversao: 14.1,
    feeMedio: 2950,
    especialidade: "Premium R$300k+",
  },
  {
    id: "A-104",
    name: "Agente Delta",
    status: "ativo",
    conversas: 16,
    tempoMedio: "1d 12h",
    taxaConversao: 11.2,
    feeMedio: 1820,
    especialidade: "Hatchbacks/Compactos",
  },
  {
    id: "A-105",
    name: "Agente Epsilon",
    status: "manutencao",
    conversas: 0,
    tempoMedio: "—",
    taxaConversao: 0,
    feeMedio: 0,
    especialidade: "Em ajuste de prompt",
  },
];

// ─── GLOBAL NEGOTIATIONS (Admin view) ────────────────────────

export const mockGlobalNegotiations: GlobalNegotiation[] = [
  {
    id: 301,
    vehicle: "BMW X5 xDrive40i 2023",
    askPrice: 385000,
    currentOffer: 318000,
    fipe: 412000,
    agent: "A-103",
    rounds: 5,
    maxRounds: 7,
    daysOpen: 3,
    status: "negociando",
    region: "SP",
    motivation: "alta",
  },
  {
    id: 302,
    vehicle: "Honda Civic Touring 2024",
    askPrice: 168000,
    currentOffer: 148000,
    fipe: 178000,
    agent: "A-102",
    rounds: 3,
    maxRounds: 5,
    daysOpen: 2,
    status: "negociando",
    region: "SP",
    motivation: "média",
  },
  {
    id: 303,
    vehicle: "Volvo XC90 Inscription 2023",
    askPrice: 422000,
    currentOffer: 358000,
    fipe: 478000,
    agent: "A-103",
    rounds: 4,
    maxRounds: 6,
    daysOpen: 4,
    status: "fechando",
    region: "RJ",
    motivation: "alta",
  },
  {
    id: 304,
    vehicle: "Hyundai HB20 Platinum 2024",
    askPrice: 88000,
    currentOffer: 76000,
    fipe: 95000,
    agent: "A-104",
    rounds: 2,
    maxRounds: 5,
    daysOpen: 1,
    status: "negociando",
    region: "MG",
    motivation: "baixa",
  },
  {
    id: 305,
    vehicle: "Audi A4 Prestige Plus 2023",
    askPrice: 248000,
    currentOffer: 215000,
    fipe: 278000,
    agent: "A-101",
    rounds: 6,
    maxRounds: 7,
    daysOpen: 5,
    status: "fechando",
    region: "SP",
    motivation: "alta",
  },
  {
    id: 306,
    vehicle: "Toyota Hilux SRX 2023",
    askPrice: 268000,
    currentOffer: 235000,
    fipe: 295000,
    agent: "A-101",
    rounds: 4,
    maxRounds: 6,
    daysOpen: 2,
    status: "negociando",
    region: "PR",
    motivation: "média",
  },
];

// ─── PRIORITY MODELS (Radar) ─────────────────────────────────

export const mockPriorityModels: PriorityModel[] = [
  {
    model: "Audi Q5 / Q3",
    margemMediaCapturada: 78000,
    demandaLojistas: "Alta",
    giroMedio: 22,
    inventarioAtivo: 12,
    recomendacao: "Priorizar agressivamente",
    cor: "emerald",
  },
  {
    model: "BMW X3 / X5",
    margemMediaCapturada: 71000,
    demandaLojistas: "Alta",
    giroMedio: 25,
    inventarioAtivo: 9,
    recomendacao: "Priorizar",
    cor: "emerald",
  },
  {
    model: "Mercedes GLC / GLA",
    margemMediaCapturada: 82000,
    demandaLojistas: "Muito Alta",
    giroMedio: 28,
    inventarioAtivo: 7,
    recomendacao: "Aumentar captação 3×",
    cor: "emerald",
  },
  {
    model: "Volvo XC60 / XC90",
    margemMediaCapturada: 75000,
    demandaLojistas: "Alta",
    giroMedio: 31,
    inventarioAtivo: 6,
    recomendacao: "Priorizar",
    cor: "emerald",
  },
  {
    model: "Toyota Corolla Cross",
    margemMediaCapturada: 28000,
    demandaLojistas: "Alta",
    giroMedio: 18,
    inventarioAtivo: 22,
    recomendacao: "Manter (alta liquidez)",
    cor: "blue",
  },
  {
    model: "Jeep Compass / Renegade",
    margemMediaCapturada: 35000,
    demandaLojistas: "Média",
    giroMedio: 32,
    inventarioAtivo: 14,
    recomendacao: "Manter",
    cor: "blue",
  },
  {
    model: "Hyundai HB20 / Creta",
    margemMediaCapturada: 18000,
    demandaLojistas: "Média-Baixa",
    giroMedio: 38,
    inventarioAtivo: 18,
    recomendacao: "Reduzir captação",
    cor: "amber",
  },
  {
    model: "Fiat Mobi / Argo",
    margemMediaCapturada: 11000,
    demandaLojistas: "Baixa",
    giroMedio: 52,
    inventarioAtivo: 8,
    recomendacao: "Pausar captação",
    cor: "amber",
  },
];

// ─── DISPUTES (Admin) ────────────────────────────────────────

export const mockDisputes: Dispute[] = [
  {
    id: "D-001",
    deal: "Mercedes C200 2023",
    lojista: "Auto Premium SP",
    vendedor: "João S.",
    motivo: "Vendedor desistiu",
    status: "Reembolsado",
    valorEnvolvido: 4800,
    dataAbertura: "há 3d",
  },
  {
    id: "D-002",
    deal: "BMW 320i 2024",
    lojista: "Top Cars RJ",
    vendedor: "Maria L.",
    motivo: "Divergência no laudo",
    status: "Em análise",
    valorEnvolvido: 3300,
    dataAbertura: "há 1d",
  },
  {
    id: "D-003",
    deal: "Audi A3 2023",
    lojista: "Star Motors",
    vendedor: "Pedro F.",
    motivo: "Atraso no pagamento",
    status: "Resolvido",
    valorEnvolvido: 2700,
    dataAbertura: "há 5d",
  },
];

// ─── MONTHLY DEALS (Dashboard chart) ─────────────────────────

export const monthlyDeals: MonthlyDealPoint[] = [
  { month: "Nov", deals: 1, savings: 28000, fees: 1680 },
  { month: "Dez", deals: 2, savings: 65000, fees: 3900 },
  { month: "Jan", deals: 2, savings: 58000, fees: 3480 },
  { month: "Fev", deals: 3, savings: 95000, fees: 5700 },
  { month: "Mar", deals: 4, savings: 142000, fees: 8520 },
  { month: "Abr", deals: 4, savings: 162000, fees: 9720 },
];
