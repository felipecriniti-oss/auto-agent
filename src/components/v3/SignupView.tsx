"use client";

import { type Persona, useAppStore } from "@/lib/stores/app";
import { ArrowRight, Briefcase, Building, CheckCircle2, User } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useState } from "react";

interface PersonaOption {
  key: Persona;
  label: string;
  tagline: string;
  plan: string;
  icon: typeof User;
  hint: string;
}

const PERSONAS: PersonaOption[] = [
  {
    key: "investidor",
    label: "Investidor PJ",
    tagline: "2-4 carros/mês · trabalha de casa",
    plan: "Starter · R$ 0 fixo + 8% fee",
    icon: User,
    hint: "CAC baixo, sem custo fixo, pausa quando quiser",
  },
  {
    key: "lojista_micro",
    label: "Lojista Micro",
    tagline: "8-12 carros de pátio · opera no Simples",
    plan: "Premium · R$ 1.490/mês + 4% fee",
    icon: Briefcase,
    hint: "Acesso antecipado 48h · SLA 4h · break-even em 0,34 deals/mês",
  },
  {
    key: "grupo_medio",
    label: "Grupo Médio",
    tagline: "3 lojas · 40 carros/mês",
    plan: "Enterprise · R$ 5.900/mês + 2,5% fee",
    icon: Building,
    hint: "Multi-loja · API + DMS · onboarding white-glove",
  },
];

export default function SignupView(): React.JSX.Element {
  const setProfile = useAppStore((s) => s.setProfile);

  const [name, setName] = useState("");
  const [city, setCity] = useState("São Paulo, SP");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [touched, setTouched] = useState(false);

  const canSubmit = name.trim().length >= 2 && city.trim().length >= 2 && persona !== null;

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit || persona === null) return;
    setProfile({ name: name.trim(), city: city.trim(), persona });
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10"
      style={{
        backgroundImage:
          "radial-gradient(circle at 20% 20%, rgba(76,70,220,0.08), transparent 55%), radial-gradient(circle at 85% 80%, rgba(76,70,220,0.06), transparent 50%)",
      }}
    >
      {/* Speedlines motif echoing the landing */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden="true"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, rgba(76,70,220,0.06) 0 1px, transparent 1px 28px)",
        }}
      />

      <div className="relative z-10 w-full max-w-[880px]">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/autoagente-whatsapp.svg"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 select-none rounded-xl ring-1 ring-slate-200 dark:ring-slate-800"
              priority
            />
            <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              AutoAgente
            </span>
          </div>
          <a
            href="https://www.autoagente.ai"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 hover:text-[#4C46DC]"
          >
            autoagente.ai ↗
          </a>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4C46DC]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4C46DC]" />
            Piloto SP · acesso
          </div>
          <h1
            className="text-3xl font-semibold leading-[1.05] tracking-tight text-slate-900 md:text-4xl"
            style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
          >
            Largue <em className="italic text-[#4C46DC]">com a gente</em>.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
            Conta pra gente quem você é e o agente começa a encontrar oportunidades de seminovos 20
            a 30% abaixo da FIPE ainda nesta sessão. Sem pagamento até o primeiro deal confirmado.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <label className="block">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Nome da sua operação
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Auto Premium SP"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#4C46DC] focus:ring-4 focus:ring-[#4C46DC]/10"
                  required
                />
                {touched && name.trim().length < 2 && (
                  <span className="mt-1 block text-[11px] text-red-600">
                    Informe o nome da operação.
                  </span>
                )}
              </label>

              <label className="block">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Cidade principal
                </span>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="São Paulo, SP"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#4C46DC] focus:ring-4 focus:ring-[#4C46DC]/10"
                  required
                />
                {touched && city.trim().length < 2 && (
                  <span className="mt-1 block text-[11px] text-red-600">
                    Informe a cidade principal.
                  </span>
                )}
              </label>
            </div>

            <div>
              <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Qual é o seu perfil de operação?
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {PERSONAS.map((p) => {
                  const Icon = p.icon;
                  const selected = persona === p.key;
                  return (
                    <button
                      type="button"
                      key={p.key}
                      onClick={() => setPersona(p.key)}
                      className={`group relative flex flex-col rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? "border-[#4C46DC] bg-[#4C46DC]/[0.04] shadow-[0_8px_22px_-10px_rgba(76,70,220,0.35)]"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div
                        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${
                          selected
                            ? "bg-[#4C46DC] text-white"
                            : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                        }`}
                      >
                        <Icon size={18} />
                      </div>
                      <div
                        className={`text-sm font-semibold ${selected ? "text-[#4C46DC]" : "text-slate-900"}`}
                      >
                        {p.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{p.tagline}</div>
                      <div
                        className={`mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          selected ? "text-[#4C46DC]" : "text-slate-400"
                        }`}
                      >
                        {p.plan}
                      </div>
                      <div className="mt-2 text-[11px] leading-snug text-slate-500">{p.hint}</div>
                      {selected && (
                        <CheckCircle2 size={16} className="absolute right-3 top-3 text-[#4C46DC]" />
                      )}
                    </button>
                  );
                })}
              </div>
              {touched && persona === null && (
                <span className="mt-2 block text-[11px] text-red-600">Escolha um perfil.</span>
              )}
            </div>

            <div className="flex flex-col-reverse items-start gap-4 border-t border-slate-100 pt-5 md:flex-row md:items-center md:justify-between">
              <p className="text-[11px] text-slate-500">
                Sem senha nesta versão piloto. Sua sessão é salva localmente — auth completo entra
                na próxima fase.
              </p>
              <button
                type="submit"
                disabled={!canSubmit}
                className="group flex items-center gap-2 rounded-lg bg-[#4C46DC] px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgba(76,70,220,0.55)] ring-1 ring-[#4C46DC]/20 transition-all hover:bg-[#3d38b8] hover:shadow-[0_8px_24px_-6px_rgba(76,70,220,0.65)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                Entrar no piloto
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </button>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          © 2026 AutoAgente Tecnologia Ltda · CNPJ em constituição · Piloto SP
        </p>
      </div>
    </div>
  );
}
