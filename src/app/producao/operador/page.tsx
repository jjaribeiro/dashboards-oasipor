import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { ZONAS_ORDEM, AREA_LABEL, AREA_COR } from "@/lib/constants";
import { ClockDisplay } from "@/components/clock-display";
import type { Funcionario, OrdemProducao } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OperadorSelector() {
  const supabase = createServerSupabase();

  const [{ data: ops }, { data: funcionarios }] = await Promise.all([
    supabase.from("ordens_producao").select("*").in("estado", ["em_curso", "planeada", "pausada"]),
    supabase.from("funcionarios").select("*").eq("ativo", true),
  ]);

  const opsPorZona: Record<string, number> = {};
  (ops as OrdemProducao[] | null)?.forEach((o) => {
    opsPorZona[o.zona_id] = (opsPorZona[o.zona_id] ?? 0) + 1;
  });
  const equipaPorZona: Record<string, number> = {};
  (funcionarios as Funcionario[] | null)?.forEach((f) => {
    if (f.zona_atual) equipaPorZona[f.zona_atual] = (equipaPorZona[f.zona_atual] ?? 0) + 1;
  });

  const porArea: Record<string, typeof ZONAS_ORDEM> = {};
  ZONAS_ORDEM.forEach((z) => {
    if (!porArea[z.area]) porArea[z.area] = [];
    porArea[z.area].push(z);
  });

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-900">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-xl font-extrabold text-slate-900">Produção — Operadores</h1>
          <p className="text-sm font-bold text-slate-500">Escolhe a tua estação</p>
        </div>
        <ClockDisplay />
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {Object.entries(porArea).map(([area, zonas]) => (
          <section key={area}>
            <div className="mb-3 flex items-center gap-2">
              <span className={cn("rounded-md border px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide", AREA_COR[area])}>
                {AREA_LABEL[area]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {zonas.map((z) => (
                <Link
                  key={z.id}
                  href={`/producao/operador/${z.id}`}
                  className="group flex aspect-square flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="text-2xl font-extrabold text-slate-900">{z.nome}</div>
                  <div className="flex items-center justify-between text-sm font-bold text-slate-500">
                    <span>
                      {opsPorZona[z.id] ?? 0} OP{(opsPorZona[z.id] ?? 0) === 1 ? "" : "s"}
                    </span>
                    <span>👥 {equipaPorZona[z.id] ?? 0}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
