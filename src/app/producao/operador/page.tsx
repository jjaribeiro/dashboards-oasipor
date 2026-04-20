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
  { id: "sl1_campos", nome: "SL1 — Máq. Campos", area: "sala_limpa_1", icon: "🏭" },
  { id: "sl1_laminados", nome: "SL1 — Laminados", area: "sala_limpa_1", icon: "📄" },
  { id: "sl1_mascaras", nome: "SL1 — Máscaras", area: "sala_limpa_1", icon: "😷" },
  { id: "sl1_toucas", nome: "SL1 — Toucas", area: "sala_limpa_1", icon: "🎩" },
  { id: "sl1_outros", nome: "SL1 — Outros", area: "sala_limpa_1", icon: "📦" },
  { id: "sl2_picking", nome: "SL2 — Picking", area: "sala_limpa_2", icon: "📮", tipoBadge: { label: "Picking", cor: "bg-violet-100 text-violet-700 border-violet-200" } },
  { id: "sl2_manual", nome: "SL2 — Manual", area: "sala_limpa_2", icon: "⚙️", tipoBadge: { label: "Manual", cor: "bg-amber-100 text-amber-700 border-amber-200" } },
  { id: "sl2_termo", nome: "SL2 — Termo", area: "sala_limpa_2", icon: "🔧", tipoBadge: { label: "Termo", cor: "bg-orange-100 text-orange-700 border-orange-200" } },
  { id: "sl2_embalamento", nome: "SL2 — Embalamento", area: "sala_limpa_2", icon: "📦", tipoBadge: { label: "Embal.", cor: "bg-yellow-100 text-yellow-700 border-yellow-200" } },
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

  const hoje = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

  const [{ data: ops }, { data: funcionarios }, { data: escalaHoje }] = await Promise.all([
    supabase.from("ordens_producao").select("*").in("estado", ["em_curso", "planeada", "pausada", "concluida"]),
    supabase.from("funcionarios").select("*").eq("ativo", true),
    supabase.from("escala_funcionario").select("funcionario_id, zona_id").eq("data", hoje),
  ]);

  const opsPorZona: Record<string, number> = {};
  const emCursoPorZona: Record<string, number> = {};
  (ops as OrdemProducao[] | null)?.forEach((o) => {
    opsPorZona[o.zona_id] = (opsPorZona[o.zona_id] ?? 0) + 1;
    if (o.estado === "em_curso") emCursoPorZona[o.zona_id] = (emCursoPorZona[o.zona_id] ?? 0) + 1;
  });

  const funcMap = new Map<string, Funcionario>();
  (funcionarios as Funcionario[] | null)?.forEach((f) => funcMap.set(f.id, f));

  const equipaPorZona: Record<string, Funcionario[]> = {};
  // Preferir escala de hoje; fallback para zona_atual se não houver entradas para a zona
  const zonasComEscala = new Set<string>();
  (escalaHoje as { funcionario_id: string; zona_id: string }[] | null)?.forEach((e) => {
    const f = funcMap.get(e.funcionario_id);
    if (!f) return;
    if (!equipaPorZona[e.zona_id]) equipaPorZona[e.zona_id] = [];
    equipaPorZona[e.zona_id].push(f);
    zonasComEscala.add(e.zona_id);
  });
  // Fallback: zona_atual para zonas sem escala
  (funcionarios as Funcionario[] | null)?.forEach((f) => {
    if (f.zona_atual && !zonasComEscala.has(f.zona_atual)) {
      if (!equipaPorZona[f.zona_atual]) equipaPorZona[f.zona_atual] = [];
      equipaPorZona[f.zona_atual].push(f);
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
                  const equipa = equipaPorZona[z.id] ?? [];
                  return (
                    <Link
                      key={z.id}
                      href={`/producao/operador/${z.id}`}
                      className={cn(
                        "group relative flex flex-col gap-2 rounded-2xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg",
                        accent.border
                      )}
                    >
                      {/* Top: nome + icon */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-lg font-black leading-tight text-slate-900">{z.nome}</h3>
                          {z.tipoBadge && (
                            <div className="mt-1 inline-flex">
                              <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-extrabold", z.tipoBadge.cor)}>
                                {z.tipoBadge.label}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-2xl leading-none opacity-60 transition-opacity group-hover:opacity-100">{z.icon}</span>
                      </div>

                      {/* Stats: OPs + em curso */}
                      <div className="flex items-end gap-2">
                        <div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-black text-slate-900">{opsCount}</span>
                            <span className="text-[10px] font-extrabold uppercase text-slate-400">{opsCount === 1 ? "OP" : "OPs"}</span>
                          </div>
                          {emCurso > 0 && (
                            <div className="mt-0.5 flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                              <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">
                                {emCurso} em curso
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Equipa — nomes das pessoas atribuídas */}
                      <div className="border-t border-slate-100 pt-2">
                        {equipa.length === 0 ? (
                          <p className="text-[10px] font-bold italic text-slate-400">— sem equipa atribuída —</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {equipa.slice(0, 6).map((f) => (
                              <span
                                key={f.id}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-0.5 pr-1.5 text-[10px] font-bold text-slate-700"
                                title={f.nome}
                              >
                                <span
                                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-extrabold text-white"
                                  style={{ backgroundColor: f.cor ?? "#64748b" }}
                                >{f.iniciais ?? f.nome[0]}</span>
                                <span className="truncate max-w-[80px]">{f.nome.split(" ")[0]}</span>
                              </span>
                            ))}
                            {equipa.length > 6 && (
                              <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">
                                +{equipa.length - 6}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Arrow hover indicator */}
                      <div className="absolute right-4 top-5 text-slate-300 opacity-0 transition-all group-hover:right-3 group-hover:opacity-100">
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
