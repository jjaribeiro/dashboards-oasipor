"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ZONA_LABEL } from "@/lib/constants";
import type { OrdemProducao, ZonaProducao, ProducaoRejeito, ProducaoPausa, MetaCategoria, PedidoProducao } from "@/lib/types";

type Categoria = "packs_trouxas" | "campos_cirurgicos" | "outros";

function categoriaDe(item: { categoria: string | null; produto_nome: string; produto_codigo: string | null }): Categoria {
  if (item.categoria === "campo") return "campos_cirurgicos";
  if (item.categoria === "pack" || item.categoria === "trouxa") return "packs_trouxas";
  if (item.categoria === "outros") return "outros";
  const n = `${item.produto_nome ?? ""} ${item.produto_codigo ?? ""}`.toLowerCase();
  if (/\b(pack|trouxa|kit|set)\b/.test(n)) return "packs_trouxas";
  if (/\bcampo/.test(n)) return "campos_cirurgicos";
  return "outros";
}

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeekMon(d: Date) {
  const r = startOfDay(d);
  const day = r.getDay() || 7;
  r.setDate(r.getDate() - (day - 1));
  return r;
}
function diasUteisRestantesNaSemana(d: Date): number {
  // dias úteis (seg-sex) que ainda faltam contando hoje se for útil
  const dia = d.getDay(); // 0=dom, 6=sáb
  if (dia === 6) return 0;
  if (dia === 0) return 5;
  return 6 - dia; // seg=5, ter=4... sex=1
}
function diasUteisRestantesNoMes(d: Date): number {
  const hoje = startOfDay(d);
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  let n = 0;
  for (let i = new Date(hoje); i <= fim; i = addDays(i, 1)) {
    const dia = i.getDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return n;
}

export function KpisTab({ pedidos, ops, zonas, rejeitos, pausas, metas = [] }: {
  pedidos: PedidoProducao[];
  ops: OrdemProducao[];
  zonas: ZonaProducao[];
  rejeitos: ProducaoRejeito[];
  pausas: ProducaoPausa[];
  metas?: MetaCategoria[];
}) {
  const kpis = useMemo(() => {
    const agora = new Date();
    const hoje = startOfDay(agora);
    const amanha = addDays(hoje, 1);
    const ontem = addDays(hoje, -1);
    const inicioSem = startOfWeekMon(hoje);
    const fimSemUteis = addDays(inicioSem, 5);
    const inicioSemPassada = addDays(inicioSem, -7);
    const fimSemPassadaUteis = addDays(inicioSemPassada, 5);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);

    // === Globais ===
    const emCurso = ops.filter((o) => o.estado === "em_curso").length;
    const atrasadas = ops.filter((o) =>
      (o.estado === "em_curso" || o.estado === "planeada") &&
      o.fim_previsto && new Date(o.fim_previsto) < agora
    );
    const atrasadas2d = atrasadas.filter((o) => {
      const diasAtraso = (agora.getTime() - new Date(o.fim_previsto!).getTime()) / (24 * 3600 * 1000);
      return diasAtraso > 2;
    });

    const rejHoje = rejeitos.filter((r) => new Date(r.created_at) >= hoje && new Date(r.created_at) < amanha);
    const rejHojeTotal = rejHoje.reduce((a, r) => a + r.quantidade, 0);

    const pausasHoje = pausas.filter((p) => new Date(p.inicio) >= hoje && new Date(p.inicio) < amanha);
    const minParagensHoje = pausasHoje.reduce((a, p) => a + (p.duracao_min ?? 0), 0);

    // === Totais — contam pedidos concluídos (1 pedido = 1 lote, dedup natural) ===
    const sumPedidosEntre = (ini: Date, fim: Date, cat?: Categoria) => {
      let total = 0;
      for (const p of pedidos) {
        if (p.estado !== "concluido" || !p.fim_real) continue;
        if (cat && categoriaDe(p) !== cat) continue;
        const f = new Date(p.fim_real);
        if (f >= ini && f < fim) total += p.quantidade_alvo || 0;
      }
      return total;
    };
    const unidadesHoje = sumPedidosEntre(hoje, amanha);
    const unidadesOntem = sumPedidosEntre(ontem, hoje);
    const unidadesSemana = sumPedidosEntre(inicioSem, fimSemUteis);
    const unidadesSemPassada = sumPedidosEntre(inicioSemPassada, fimSemPassadaUteis);
    const unidadesMes = sumPedidosEntre(inicioMes, fimMes);
    const unidadesMesPassado = sumPedidosEntre(inicioMesPassado, inicioMes);

    // === Por categoria — baseado em pedidos ===
    type CatStats = {
      unidadesHoje: number; unidadesSemana: number; unidadesMes: number;
      emCurso: number; planeadas: number; concluidasHoje: number;
    };
    const novoStats = (): CatStats => ({
      unidadesHoje: 0, unidadesSemana: 0, unidadesMes: 0,
      emCurso: 0, planeadas: 0, concluidasHoje: 0,
    });
    const porCategoria: Record<Categoria, CatStats> = {
      packs_trouxas: novoStats(),
      campos_cirurgicos: novoStats(),
      outros: novoStats(),
    };
    for (const p of pedidos) {
      const cat = categoriaDe(p);
      if (p.estado === "em_producao") porCategoria[cat].emCurso += p.quantidade_alvo || 0;
      if (p.estado === "pendente") porCategoria[cat].planeadas += p.quantidade_alvo || 0;
      if (p.estado === "concluido" && p.fim_real) {
        const f = new Date(p.fim_real);
        if (f >= hoje && f < amanha) porCategoria[cat].concluidasHoje += p.quantidade_alvo || 0;
      }
    }
    // Concluídos por categoria em cada período
    for (const cat of ["packs_trouxas", "campos_cirurgicos", "outros"] as const) {
      porCategoria[cat].unidadesHoje = sumPedidosEntre(hoje, amanha, cat);
      porCategoria[cat].unidadesSemana = sumPedidosEntre(inicioSem, fimSemUteis, cat);
      porCategoria[cat].unidadesMes = sumPedidosEntre(inicioMes, fimMes, cat);
    }

    // === Produção mensal por zona (este mês vs mês passado) ===
    const porZonaMes = new Map<string, { atual: number; anterior: number }>();
    for (const z of zonas) porZonaMes.set(z.id, { atual: 0, anterior: 0 });
    for (const o of ops) {
      if (o.estado !== "concluida" || !o.fim_real) continue;
      const f = new Date(o.fim_real);
      const bucket = porZonaMes.get(o.zona_id);
      if (!bucket) continue;
      if (f >= inicioMes && f < fimMes) bucket.atual += o.quantidade_atual || 0;
      else if (f >= inicioMesPassado && f < inicioMes) bucket.anterior += o.quantidade_atual || 0;
    }
    const zonaMensal = Array.from(porZonaMes.entries())
      .map(([zid, v]) => ({ zona_id: zid, atual: v.atual, anterior: v.anterior }))
      .filter((z) => z.atual > 0 || z.anterior > 0)
      .sort((a, b) => b.atual - a.atual);

    // === OPs próximas 24h ===
    const em24h = addDays(agora, 1);
    const proximas24h = ops
      .filter((o) => o.inicio_previsto && new Date(o.inicio_previsto) >= agora && new Date(o.inicio_previsto) < em24h && o.estado !== "concluida" && o.estado !== "cancelada")
      .sort((a, b) => new Date(a.inicio_previsto!).getTime() - new Date(b.inicio_previsto!).getTime())
      .slice(0, 8);

    // === Série diária últimos 14 dias, empilhada por categoria (conta pedidos concluídos) ===
    type DiaSerie = { dia: Date; packs: number; campos: number; outros: number };
    const serie: DiaSerie[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(hoje, -i);
      const d1 = addDays(d, 1);
      const item: DiaSerie = { dia: d, packs: 0, campos: 0, outros: 0 };
      for (const p of pedidos) {
        if (p.estado !== "concluido" || !p.fim_real) continue;
        const f = new Date(p.fim_real);
        if (f < d || f >= d1) continue;
        const cat = categoriaDe(p);
        const qty = p.quantidade_alvo || 0;
        if (cat === "packs_trouxas") item.packs += qty;
        else if (cat === "campos_cirurgicos") item.campos += qty;
        else item.outros += qty;
      }
      serie.push(item);
    }

    // === Zonas congestionadas (planeadas) ===
    const porZona = new Map<string, number>();
    for (const o of ops) {
      if (o.estado === "planeada") porZona.set(o.zona_id, (porZona.get(o.zona_id) ?? 0) + 1);
    }
    const zonaCongest = Array.from(porZona.entries())
      .filter(([, n]) => n >= 5)
      .sort((a, b) => b[1] - a[1]);

    // === Projeção ===
    const diasUteisSemana = 5;
    const diasUteisPassadosNaSemana = diasUteisSemana - diasUteisRestantesNaSemana(agora);
    const diasUteisRestantesSem = Math.max(0, diasUteisSemana - diasUteisPassadosNaSemana - (agora.getDay() === 0 || agora.getDay() === 6 ? 0 : 1));
    const diasUteisMesRestantes = diasUteisRestantesNoMes(agora);

    return {
      agora,
      emCurso,
      atrasadas: atrasadas.length,
      atrasadas2dCount: atrasadas2d.length,
      rejHojeTotal, minParagensHoje,
      unidadesHoje, unidadesOntem,
      unidadesSemana, unidadesSemPassada,
      unidadesMes, unidadesMesPassado,
      porCategoria,
      serie,
      proximas24h,
      zonaCongest,
      zonaMensal,
      diasUteisRestantesSem,
      diasUteisMesRestantes,
    };
  }, [pedidos, ops, zonas, rejeitos, pausas]);

  const metaPacks = metas.find((m) => m.categoria === "packs_trouxas");
  const metaCampos = metas.find((m) => m.categoria === "campos_cirurgicos");

  const alertas: Array<{ tipo: "bad" | "warn"; msg: string }> = [];
  if (kpis.atrasadas2dCount > 0) alertas.push({ tipo: "bad", msg: `${kpis.atrasadas2dCount} OP${kpis.atrasadas2dCount > 1 ? "s" : ""} atrasada${kpis.atrasadas2dCount > 1 ? "s" : ""} há mais de 2 dias` });
  if (kpis.atrasadas > kpis.atrasadas2dCount) alertas.push({ tipo: "warn", msg: `${kpis.atrasadas - kpis.atrasadas2dCount} OP${(kpis.atrasadas - kpis.atrasadas2dCount) > 1 ? "s" : ""} atrasada${(kpis.atrasadas - kpis.atrasadas2dCount) > 1 ? "s" : ""}` });
  for (const [zid, n] of kpis.zonaCongest) alertas.push({ tipo: "warn", msg: `${ZONA_LABEL[zid] ?? zid} congestionada — ${n} planeadas` });
  if (kpis.minParagensHoje >= 120) alertas.push({ tipo: "bad", msg: `${Math.round(kpis.minParagensHoje)} min em paragens hoje` });
  if (kpis.rejHojeTotal > 0) alertas.push({ tipo: "warn", msg: `${kpis.rejHojeTotal} unidade${kpis.rejHojeTotal > 1 ? "s" : ""} rejeitada${kpis.rejHojeTotal > 1 ? "s" : ""} hoje` });

  return (
    <div className="space-y-4">
      {/* ALERTAS */}
      {alertas.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {alertas.map((a, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-extrabold",
                a.tipo === "bad" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"
              )}
            >
              {a.tipo === "bad" ? "⛔" : "⚠️"} {a.msg}
            </div>
          ))}
        </section>
      )}

      {/* POR CATEGORIA — principal */}
      <section>
        <h2 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">Por categoria</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <CategoriaCard
            titulo="Packs / Trouxas"
            cor="sky"
            c={kpis.porCategoria.packs_trouxas}
            metaDiaria={metaPacks?.meta_diaria_un ?? null}
            metaSemanal={metaPacks?.meta_semanal_un ?? null}
            metaMensal={metaPacks?.meta_mensal_un ?? null}
            diasUteisSemRestantes={kpis.diasUteisRestantesSem}
            diasUteisMesRestantes={kpis.diasUteisMesRestantes}
          />
          <CategoriaCard
            titulo="Campos Cirúrgicos"
            cor="emerald"
            c={kpis.porCategoria.campos_cirurgicos}
            metaDiaria={metaCampos?.meta_diaria_un ?? null}
            metaSemanal={metaCampos?.meta_semanal_un ?? null}
            metaMensal={metaCampos?.meta_mensal_un ?? null}
            diasUteisSemRestantes={kpis.diasUteisRestantesSem}
            diasUteisMesRestantes={kpis.diasUteisMesRestantes}
          />
        </div>
      </section>

      {/* OPERACIONAL GLOBAL */}
      <section>
        <h2 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">Estado operacional</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniStat label="Em curso" value={kpis.emCurso} tone={kpis.emCurso > 0 ? "good" : "neutral"} />
          <MiniStat label="Atrasadas" value={kpis.atrasadas} tone={kpis.atrasadas > 0 ? "bad" : "neutral"} />
          <MiniStat label="Rejeitados hoje" value={kpis.rejHojeTotal} tone={kpis.rejHojeTotal > 0 ? "bad" : "neutral"} />
          <MiniStat label="Paragens hoje" value={`${Math.round(kpis.minParagensHoje)}m`} tone={kpis.minParagensHoje > 60 ? "bad" : kpis.minParagensHoje > 0 ? "warn" : "neutral"} />
        </div>
      </section>

      {/* COMPARAÇÕES */}
      <section>
        <h2 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">Comparação</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <DeltaCard label="Hoje vs Ontem" atual={kpis.unidadesHoje} anterior={kpis.unidadesOntem} sub="unidades totais" />
          <DeltaCard label="Semana vs Semana passada" atual={kpis.unidadesSemana} anterior={kpis.unidadesSemPassada} sub="unidades (Seg–Sex)" />
          <DeltaCard label="Mês vs Mês passado" atual={kpis.unidadesMes} anterior={kpis.unidadesMesPassado} sub="unidades" />
        </div>
      </section>

      {/* GRÁFICO BARRAS 14d */}
      <section>
        <h2 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">Últimos 14 dias (empilhado por categoria)</h2>
        <BarChart serie={kpis.serie} />
      </section>

      {/* PRODUÇÃO MENSAL POR ZONA */}
      {kpis.zonaMensal.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">Produção por zona (mês atual vs mês passado)</h2>
          <ZonaMensalRanking zonas={kpis.zonaMensal} />
        </section>
      )}

      {/* PRÓXIMAS 24h */}
      {kpis.proximas24h.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">Próximas 24h ({kpis.proximas24h.length})</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 text-left">Início</th>
                  <th className="px-3 py-1.5 text-left">Ref</th>
                  <th className="px-3 py-1.5 text-left">Produto</th>
                  <th className="px-3 py-1.5 text-left">Zona</th>
                  <th className="px-3 py-1.5 text-right">Qtd</th>
                  <th className="px-3 py-1.5 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {kpis.proximas24h.map((op) => {
                  const ini = new Date(op.inicio_previsto!);
                  const hhmm = `${String(ini.getHours()).padStart(2, "0")}:${String(ini.getMinutes()).padStart(2, "0")}`;
                  const isHoje = ini.toDateString() === new Date().toDateString();
                  return (
                    <tr key={op.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-bold text-slate-700">
                        <span className={cn("rounded px-1 text-[10px] font-extrabold", isHoje ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700")}>
                          {isHoje ? "Hoje" : "Amanhã"}
                        </span>{" "}
                        {hhmm}
                      </td>
                      <td className="px-3 py-1.5 font-mono font-bold text-slate-900">{op.produto_codigo ?? "—"}</td>
                      <td className="px-3 py-1.5 font-bold text-slate-800">{op.produto_nome}</td>
                      <td className="px-3 py-1.5 text-slate-600">{ZONA_LABEL[op.zona_id] ?? op.zona_id}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-slate-900">{op.quantidade_alvo}</td>
                      <td className="px-3 py-1.5 text-slate-600 capitalize">{op.estado.replace("_", " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ZonaMensalRanking({ zonas }: { zonas: Array<{ zona_id: string; atual: number; anterior: number }> }) {
  const max = Math.max(1, ...zonas.flatMap((z) => [z.atual, z.anterior]));
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sky-500"></span> Este mês</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-slate-300"></span> Mês passado</span>
      </div>
      <div className="divide-y divide-slate-100">
        {zonas.map((z) => {
          const diff = z.atual - z.anterior;
          const pct = z.anterior > 0 ? Math.round((diff / z.anterior) * 100) : (z.atual > 0 ? 100 : 0);
          const setaCls = diff > 0 ? "text-emerald-700" : diff < 0 ? "text-red-700" : "text-slate-400";
          const seta = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
          return (
            <div key={z.zona_id} className="grid grid-cols-[140px_1fr_100px] items-center gap-3 px-3 py-2">
              <p className="truncate text-xs font-extrabold text-slate-800">{ZONA_LABEL[z.zona_id] ?? z.zona_id}</p>
              <div className="flex flex-col gap-1">
                {/* barra atual */}
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-sky-500" style={{ width: `${(z.atual / max) * 100}%` }} />
                  </div>
                  <span className="w-12 text-right text-xs font-black text-slate-900">{z.atual}</span>
                </div>
                {/* barra anterior */}
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-300" style={{ width: `${(z.anterior / max) * 100}%` }} />
                  </div>
                  <span className="w-12 text-right text-[10px] font-bold text-slate-500">{z.anterior}</span>
                </div>
              </div>
              <div className={cn("text-right text-xs font-extrabold", setaCls)}>
                {seta} {diff > 0 ? "+" : ""}{diff}
                {z.anterior > 0 && <span className="ml-1 text-[10px] font-bold opacity-80">({diff > 0 ? "+" : ""}{pct}%)</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const cls = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-white text-slate-700 border-slate-200",
  }[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2 shadow-sm", cls)}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-black leading-tight">{value}</p>
    </div>
  );
}

function DeltaCard({ label, atual, anterior, sub }: { label: string; atual: number; anterior: number; sub?: string }) {
  const diff = atual - anterior;
  const pct = anterior > 0 ? Math.round((diff / anterior) * 100) : (atual > 0 ? 100 : 0);
  const positivo = diff > 0;
  const negativo = diff < 0;
  const iguais = diff === 0;
  const corBg = iguais ? "bg-slate-50 border-slate-200" : positivo ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200";
  const corText = iguais ? "text-slate-500" : positivo ? "text-emerald-700" : "text-red-700";
  const seta = iguais ? "→" : positivo ? "↑" : "↓";
  return (
    <div className={cn("rounded-lg border px-3 py-2 shadow-sm", corBg)}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900">{atual}</span>
        <span className="text-xs font-bold text-slate-400">vs {anterior}</span>
      </div>
      <p className={cn("text-sm font-extrabold", corText)}>
        {seta} {positivo && "+"}{negativo && ""}{diff} {anterior > 0 && `(${positivo ? "+" : ""}${pct}%)`}
      </p>
      {sub && <p className="text-[10px] font-bold text-slate-400">{sub}</p>}
    </div>
  );
}

function CategoriaCard({ titulo, cor, c, metaDiaria, metaSemanal, metaMensal, diasUteisSemRestantes, diasUteisMesRestantes }: {
  titulo: string;
  cor: "sky" | "emerald";
  c: {
    unidadesHoje: number; unidadesSemana: number; unidadesMes: number;
    emCurso: number; planeadas: number; concluidasHoje: number;
  };
  metaDiaria: number | null;
  metaSemanal: number | null;
  metaMensal: number | null;
  diasUteisSemRestantes: number;
  diasUteisMesRestantes: number;
}) {
  const headerCls = cor === "sky"
    ? "bg-sky-50 border-sky-200 text-sky-800"
    : "bg-emerald-50 border-emerald-200 text-emerald-800";

  // Projeção: ritmo necessário para atingir meta (só conta o que está finalizado)
  const faltaSemana = metaSemanal ? Math.max(0, metaSemanal - c.unidadesSemana) : null;
  const ritmoNecSem = faltaSemana !== null && diasUteisSemRestantes > 0 ? Math.ceil(faltaSemana / diasUteisSemRestantes) : null;
  const faltaMes = metaMensal ? Math.max(0, metaMensal - c.unidadesMes) : null;
  const ritmoNecMes = faltaMes !== null && diasUteisMesRestantes > 0 ? Math.ceil(faltaMes / diasUteisMesRestantes) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className={cn("flex items-center justify-between border-b px-3 py-2 text-sm font-black", headerCls)}>
        <span>{titulo}</span>
        <span className="text-[10px] font-bold opacity-70">
          Em curso: {c.emCurso} · Planeadas: {c.planeadas} · Concluídas hoje: {c.concluidasHoje}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-2">
        <Progresso label="Hoje" valor={c.unidadesHoje} meta={metaDiaria} />
        <Progresso label="Semana (5d)" valor={c.unidadesSemana} meta={metaSemanal} />
        <Progresso label="Mês" valor={c.unidadesMes} meta={metaMensal} />
      </div>
      {(ritmoNecSem !== null || ritmoNecMes !== null) && (
        <div className="flex flex-wrap gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
          {ritmoNecSem !== null && (
            <span>
              <span className="text-slate-400">Para meta semanal:</span>{" "}
              <span className="text-slate-900">{ritmoNecSem}/dia</span>
              <span className="text-slate-400"> ({diasUteisSemRestantes}d úteis)</span>
            </span>
          )}
          {ritmoNecMes !== null && (
            <span>
              <span className="text-slate-400">Para meta mensal:</span>{" "}
              <span className="text-slate-900">{ritmoNecMes}/dia</span>
              <span className="text-slate-400"> ({diasUteisMesRestantes}d úteis)</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Progresso({ label, valor, meta }: { label: string; valor: number; meta: number | null }) {
  const pct = meta && meta > 0 ? Math.min(100, Math.round((valor / meta) * 100)) : null;
  const barCls = pct === null
    ? "bg-slate-200"
    : pct >= 100 ? "bg-emerald-500"
    : pct >= 70 ? "bg-sky-500"
    : pct >= 40 ? "bg-amber-500"
    : "bg-red-400";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
      <p className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-black leading-tight text-slate-900">
        {valor}
        {meta !== null && meta > 0 && <span className="text-xs font-bold text-slate-400"> / {meta}</span>}
      </p>
      {pct !== null && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200">
          <div className={cn("h-full", barCls)} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function BarChart({ serie }: { serie: Array<{ dia: Date; packs: number; campos: number; outros: number }> }) {
  const max = Math.max(1, ...serie.map((p) => p.packs + p.campos + p.outros));
  const diasLabel = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      {/* Legenda */}
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] font-extrabold text-slate-600">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sky-500"></span> Packs / Trouxas</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-emerald-500"></span> Campos Cirúrgicos</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-slate-400"></span> Outros</span>
      </div>
      <div className="flex h-40 items-end gap-1.5">
        {serie.map((p, i) => {
          const total = p.packs + p.campos + p.outros;
          const hTotal = (total / max) * 100;
          const isHoje = p.dia.toDateString() === new Date().toDateString();
          const isFimSem = p.dia.getDay() === 0 || p.dia.getDay() === 6;
          return (
            <div key={i} className="flex flex-1 flex-col items-center">
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className={cn(
                    "flex w-full flex-col-reverse overflow-hidden rounded-t ring-1",
                    isHoje ? "ring-emerald-600" : "ring-transparent",
                    isFimSem && "opacity-50"
                  )}
                  style={{ height: `${Math.max(2, hTotal)}%` }}
                  title={`${p.dia.toLocaleDateString("pt-PT")} · Packs: ${p.packs} · Campos: ${p.campos} · Outros: ${p.outros}`}
                >
                  {p.packs > 0 && <div className="bg-sky-500" style={{ height: `${(p.packs / total) * 100}%` }} />}
                  {p.campos > 0 && <div className="bg-emerald-500" style={{ height: `${(p.campos / total) * 100}%` }} />}
                  {p.outros > 0 && <div className="bg-slate-400" style={{ height: `${(p.outros / total) * 100}%` }} />}
                </div>
                {total > 0 && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-black text-slate-600">
                    {total}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {serie.map((p, i) => (
          <div key={i} className="flex-1 text-center">
            <p className="text-[9px] font-extrabold text-slate-500">{diasLabel[p.dia.getDay()]}</p>
            <p className="text-[9px] font-bold text-slate-400">{String(p.dia.getDate()).padStart(2, "0")}/{String(p.dia.getMonth() + 1).padStart(2, "0")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
