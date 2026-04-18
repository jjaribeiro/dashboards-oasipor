import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { AREA_LABEL } from "@/lib/constants";
import { ClockDisplay } from "@/components/clock-display";
import { DashboardAuthGate } from "@/components/dashboard-auth-gate";
import type { Funcionario, OrdemProducao } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface ZonaInfo {
  id: string;
  nome: string;
  area: string;
  icon: string;
  tipoBadge?: { label: string; cor: string };
}

const ZONAS_OPERADOR: ZonaInfo[] = [
  { id: "sl1", nome: "SL1", area: "sala_limpa_1", icon: "🏭" },
  { id: "sl2_picking", nome: "SASC — Picking", area: "sala_limpa_2", icon: "📮", tipoBadge: { label: "Picking", cor: "bg-cyan-100 text-cyan-700 border-cyan-200" } },
  { id: "sl2_manual", nome: "SL2 — Manual", area: "sala_limpa_2", icon: "⚙️", tipoBadge: { label: "Manual", cor: "bg-amber-100 text-amber-700 border-amber-200" } },
  { id: "sl2_termo", nome: "SL2 — Termo", area: "sala_limpa_2", icon: "🔧", tipoBadge: { label: "Termo", cor: "bg-violet-100 text-violet-700 border-violet-200" } },
  { id: "embalamento", nome: "Embalamento", area: "embalamento", icon: "📦" },
  { id: "pre_cond_1", nome: "Pré-Cond 1", area: "esterilizacao", icon: "🌡️" },
  { id: "pre_cond_2", nome: "Pré-Cond 2", area: "esterilizacao", icon: "🌡️" },
  { id: "esterilizador", nome: "Esterilizador", area: "esterilizacao", icon: "🔥" },
  { id: "arejamento_1", nome: "Arejamento 1", area: "esterilizacao", icon: "💨" },
  { id: "arejamento_2", nome: "Arejamento 2", area: "esterilizacao", icon: "💨" },
];

// Cores por área — borda esquerda colorida
const AREA_ACCENT: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  sala_limpa_1: { border: "border-l-sky-500", bg: "bg-sky-50", text: "text-sky-700", badge: "bg-sky-100 text-sky-700 border-sky-200" },
  sala_limpa_2: { border: "border-l-indigo-500", bg: "bg-indigo-50", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  embalamento: { border: "border-l-amber-500", bg: "bg-amber-50", text: "text-amber-700", badge: "bg-amber-100 text-amber-700 border-amber-200" },
  esterilizacao: { border: "border-l-rose-500", bg: "bg-rose-50", text: "text-rose-700", badge: "bg-rose-100 text-rose-700 border-rose-200" },
};

export default async function OperadorSelector() {
  const supabase = createServerSupabase();

  const [{ data: ops }, { data: funcionarios }] = await Promise.all([
    supabase.from("ordens_producao").select("*").in("estado", ["em_curso", "planeada", "pausada", "concluida"]),
    supabase.from("funcionarios").select("*").eq("ativo", true),
  ]);

  const opsPorZona: Record<string, number> = {};
  const emCursoPorZona: Record<string, number> = {};
  (ops as OrdemProducao[] | null)?.forEach((o) => {
    opsPorZona[o.zona_id] = (opsPorZona[o.zona_id] ?? 0) + 1;
    if (o.estado === "em_curso") emCursoPorZona[o.zona_id] = (emCursoPorZona[o.zona_id] ?? 0) + 1;
  });

  const equipaPorZona: Record<string, number> = {};
  (funcionarios as Funcionario[] | null)?.forEach((f) => {
    if (f.zona_atual) {
      equipaPorZona[f.zona_atual] = (equipaPorZona[f.zona_atual] ?? 0) + 1;
    }
  });

  const porArea: Record<string, ZonaInfo[]> = {};
  ZONAS_OPERADOR.forEach((z) => {
    if (!porArea[z.area]) porArea[z.area] = [];
    porArea[z.area].push(z);
  });

  return (
    <DashboardAuthGate dashboardKey="operador" title="Produção — Operadores" subtitle="Introduz o teu PIN para entrar">
    <main className="flex h-full flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Produção — Operadores</h1>
            <p className="text-xs font-bold text-slate-500">Escolhe a tua estação</p>
          </div>
        </div>
        <ClockDisplay />
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {Object.entries(porArea).map(([area, zonas]) => {
          const accent = AREA_ACCENT[area];
          return (
            <section key={area} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn("rounded-md border px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide", accent.badge)}>
                  {AREA_LABEL[area]}
                </span>
                <div className={cn("h-px flex-1", accent.bg)} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {zonas.map((z) => {
                  const opsCount = opsPorZona[z.id] ?? 0;
                  const emCurso = emCursoPorZona[z.id] ?? 0;
                  const equipaCount = equipaPorZona[z.id] ?? 0;
                  return (
                    <Link
                      key={z.id}
                      href={`/producao/operador/${z.id}`}
                      className={cn(
                        "group relative flex flex-col gap-3 rounded-2xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg",
                        accent.border
                      )}
                    >
                      {/* Top: nome + icon */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-lg font-black leading-tight text-slate-900">{z.nome}</h3>
                          {z.tipoBadge && (
                            <div className="mt-1.5">
                              <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-extrabold", z.tipoBadge.cor)}>
                                {z.tipoBadge.label}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-2xl leading-none opacity-60 transition-opacity group-hover:opacity-100">{z.icon}</span>
                      </div>

                      {/* Stats: OPs + em curso */}
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-4xl font-black text-slate-900">{opsCount}</span>
                            <span className="text-xs font-extrabold uppercase text-slate-400">{opsCount === 1 ? "OP" : "OPs"}</span>
                          </div>
                          {emCurso > 0 && (
                            <div className="mt-1 flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                              <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">
                                {emCurso} em curso
                              </span>
                            </div>
                          )}
                        </div>
                        {equipaCount > 0 && (
                          <div className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1">
                            <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-xs font-extrabold text-blue-700">{equipaCount}</span>
                          </div>
                        )}
                      </div>

                      {/* Arrow hover indicator */}
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 opacity-0 transition-all group-hover:right-3 group-hover:opacity-100">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
    </DashboardAuthGate>
  );
}
