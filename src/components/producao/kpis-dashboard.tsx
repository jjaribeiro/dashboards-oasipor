"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ZONA_LABEL } from "@/lib/constants";
import type {
  OrdemProducao,
  PedidoProducao,
  ZonaProducao,
  ProducaoRejeito,
  ProducaoPausa,
  AuditLog,
  MetaCategoria,
} from "@/lib/types";

interface Props {
  zonas: ZonaProducao[];
  pedidos: PedidoProducao[];
  ops: OrdemProducao[];
  rejeitos: ProducaoRejeito[];
  pausas: ProducaoPausa[];
  audit: AuditLog[];
  metas: MetaCategoria[];
}

type Periodo = "hoje" | "semana" | "mes";

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function endOfDay(d: Date) { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
function startOfWeek(d: Date) { const r = startOfDay(d); const day = r.getDay() || 7; r.setDate(r.getDate() - (day - 1)); return r; }
function startOfMonth(d: Date) { const r = startOfDay(d); r.setDate(1); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d: Date, n: number) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }

function rangeFor(periodo: Periodo) {
  const now = new Date();
  if (periodo === "hoje") {
    const ini = startOfDay(now);
    return { ini, fim: now, prevIni: addDays(ini, -1), prevFim: addDays(now, -1), label: "vs ontem" };
  }
  if (periodo === "semana") {
    const ini = startOfWeek(now);
    return { ini, fim: now, prevIni: addDays(ini, -7), prevFim: addDays(now, -7), label: "vs semana passada" };
  }
  const ini = startOfMonth(now);
  return { ini, fim: now, prevIni: addMonths(ini, -1), prevFim: addMonths(now, -1), label: "vs mês passado" };
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

export function KpisDashboard({ zonas, pedidos, ops, rejeitos, pausas, audit, metas }: Props) {
  void audit; void rejeitos; // reservados
  const [periodo, setPeriodo] = useState<Periodo>("semana");

  const { ini, fim, prevIni, prevFim, label: deltaLabel } = useMemo(() => rangeFor(periodo), [periodo]);

  const metasMap = useMemo(() => {
    const m: Record<string, MetaCategoria | undefined> = {};
    for (const x of metas) m[x.categoria] = x;
    return m;
  }, [metas]);

  const metaFor = (cat: "packs_trouxas" | "campos_cirurgicos") => {
    const m = metasMap[cat];
    if (!m) return 0;
    if (periodo === "hoje") return m.meta_diaria_un ?? 0;
    if (periodo === "semana") return m.meta_semanal_un ?? 0;
    return m.meta_mensal_un ?? 0;
  };

  const data = useMemo(() => {
    // OPs concluídas no período
    const concluidasPeriodo = ops.filter((o) => o.estado === "concluida" && o.fim_real && new Date(o.fim_real) >= ini && new Date(o.fim_real) <= fim);
    const concluidasPrev = ops.filter((o) => o.estado === "concluida" && o.fim_real && new Date(o.fim_real) >= prevIni && new Date(o.fim_real) <= prevFim);

    const unidades = concluidasPeriodo.reduce((a, o) => a + (o.quantidade_atual || 0), 0);
    const unidadesPrev = concluidasPrev.reduce((a, o) => a + (o.quantidade_atual || 0), 0);

    const rejeitadas = concluidasPeriodo.reduce((a, o) => a + (o.quantidade_rejeitada || 0), 0);
    const qualidadePct = unidades > 0 ? ((unidades - rejeitadas) / unidades) * 100 : 100;
    const rejeitadasPrev = concluidasPrev.reduce((a, o) => a + (o.quantidade_rejeitada || 0), 0);
    const qualidadePctPrev = unidadesPrev > 0 ? ((unidadesPrev - rejeitadasPrev) / unidadesPrev) * 100 : 100;

    // Produção por categoria no período
    const packsProduzidos = concluidasPeriodo.filter((o) => o.categoria === "pack" || o.categoria === "trouxa").reduce((a, o) => a + (o.quantidade_atual || 0), 0);
    const camposProduzidos = concluidasPeriodo.filter((o) => o.categoria === "campo").reduce((a, o) => a + (o.quantidade_atual || 0), 0);

    // Desvio tempo
    let desvioAcc = 0, desvioN = 0;
    for (const o of concluidasPeriodo) {
      if (!o.inicio || !o.fim_real || !o.fim_previsto) continue;
      const real = new Date(o.fim_real).getTime() - new Date(o.inicio).getTime();
      const prev = new Date(o.fim_previsto).getTime() - new Date(o.inicio).getTime();
      if (prev > 0) { desvioAcc += (real - prev) / prev; desvioN++; }
    }
    const desvioPct = desvioN > 0 ? (desvioAcc / desvioN) * 100 : 0;

    // Paragens no período
    const pausasPeriodo = pausas.filter((p) => new Date(p.created_at) >= ini && new Date(p.created_at) <= fim);
    const minParados = pausasPeriodo.reduce((a, p) => a + (p.duracao_min || 0), 0);

    // OEE: Availability × Performance × Quality
    // Tempo disponível: aproximação — 8h/dia × dias úteis × zonas de produção (excluindo câmaras/esterilizador)
    const nZonas = zonas.filter((z) => z.tipo !== "camara" && z.tipo !== "esterilizador").length || 1;
    const diasPeriodo = Math.max(1, Math.ceil((fim.getTime() - ini.getTime()) / (86400000)));
    const tempoDisponivelMin = 8 * 60 * diasPeriodo * nZonas;
    const availability = Math.max(0, Math.min(1, 1 - minParados / Math.max(1, tempoDisponivelMin)));
    const performance = Math.max(0, Math.min(1, 1 - Math.abs(desvioPct) / 100));
    const quality = Math.max(0, Math.min(1, qualidadePct / 100));
    const oeePct = availability * performance * quality * 100;

    // Mesmo cálculo OEE para período anterior (para delta)
    const pausasPrev = pausas.filter((p) => new Date(p.created_at) >= prevIni && new Date(p.created_at) <= prevFim);
    const minParadosPrev = pausasPrev.reduce((a, p) => a + (p.duracao_min || 0), 0);
    const diasPrev = Math.max(1, Math.ceil((prevFim.getTime() - prevIni.getTime()) / 86400000));
    const tempoDispPrev = 8 * 60 * diasPrev * nZonas;
    const availPrev = Math.max(0, Math.min(1, 1 - minParadosPrev / Math.max(1, tempoDispPrev)));
    let desvioAccPrev = 0, desvioNPrev = 0;
    for (const o of concluidasPrev) {
      if (!o.inicio || !o.fim_real || !o.fim_previsto) continue;
      const real = new Date(o.fim_real).getTime() - new Date(o.inicio).getTime();
      const prev = new Date(o.fim_previsto).getTime() - new Date(o.inicio).getTime();
      if (prev > 0) { desvioAccPrev += (real - prev) / prev; desvioNPrev++; }
    }
    const desvioPrev = desvioNPrev > 0 ? (desvioAccPrev / desvioNPrev) * 100 : 0;
    const perfPrev = Math.max(0, Math.min(1, 1 - Math.abs(desvioPrev) / 100));
    const qualPrev = qualidadePctPrev / 100;
    const oeePrevPct = availPrev * perfPrev * qualPrev * 100;

    // Produção últimos 14 dias (para sparkline)
    const serie14: { dia: Date; valor: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = startOfDay(addDays(new Date(), -i));
      const dEnd = endOfDay(d);
      const v = ops
        .filter((o) => o.estado === "concluida" && o.fim_real && new Date(o.fim_real) >= d && new Date(o.fim_real) <= dEnd)
        .reduce((a, o) => a + (o.quantidade_atual || 0), 0);
      serie14.push({ dia: d, valor: v });
    }

    // Produção por zona
    const prodZona = new Map<string, number>();
    for (const o of concluidasPeriodo) prodZona.set(o.zona_id, (prodZona.get(o.zona_id) || 0) + (o.quantidade_atual || 0));

    // Fila (estados ativos agora)
    const fila = new Map<string, number>();
    for (const o of ops.filter((o) => o.estado === "planeada" || o.estado === "em_curso" || o.estado === "pausada")) {
      fila.set(o.zona_id, (fila.get(o.zona_id) || 0) + 1);
    }

    // Produção por operador
    const prodOp = new Map<string, number>();
    for (const o of concluidasPeriodo) {
      if (o.responsavel) prodOp.set(o.responsavel, (prodOp.get(o.responsavel) || 0) + (o.quantidade_atual || 0));
    }

    // Fluxo
    const now = new Date();
    const opsAtraso = ops.filter((o) => (o.estado === "planeada" || o.estado === "em_curso" || o.estado === "pausada") && o.fim_previsto && new Date(o.fim_previsto) < now).length;
    const pedidosAtivos = pedidos.filter((p) => p.estado === "pendente" || p.estado === "programado" || p.estado === "em_producao").length;

    const pedidosConcluidos = pedidos.filter((p) => p.estado === "concluido" && p.created_at && p.fim_real);
    let leadTimeMs = 0;
    for (const p of pedidosConcluidos) leadTimeMs += new Date(p.fim_real!).getTime() - new Date(p.created_at).getTime();
    const leadTimeDias = pedidosConcluidos.length > 0 ? leadTimeMs / pedidosConcluidos.length / 86400000 : 0;

    // Paragens por motivo
    const pausasMotivo = new Map<string, number>();
    for (const p of pausasPeriodo) pausasMotivo.set(p.motivo, (pausasMotivo.get(p.motivo) || 0) + (p.duracao_min || 0));

    return {
      unidades, unidadesPrev,
      opsConcl: concluidasPeriodo.length, opsConclPrev: concluidasPrev.length,
      packsProduzidos, camposProduzidos,
      qualidadePct, rejeitadas,
      desvioPct,
      oeePct, oeePrevPct,
      availability, performance, quality,
      minParados,
      serie14,
      prodZona, fila, prodOp,
      opsAtraso, pedidosAtivos, leadTimeDias,
      pausasMotivo,
    };
  }, [ops, pedidos, pausas, zonas, ini, fim, prevIni, prevFim]);

  const deltaUnidades = pctDelta(data.unidades, data.unidadesPrev);
  const deltaOps = pctDelta(data.opsConcl, data.opsConclPrev);
  const deltaOee = data.oeePct - data.oeePrevPct;

  const metaPacks = metaFor("packs_trouxas");
  const metaCampos = metaFor("campos_cirurgicos");

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header compacto */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black leading-tight text-slate-900">KPIs de Produção</h1>
          <p className="text-[11px] font-bold text-slate-500">Vista agregada · {periodo === "hoje" ? "Hoje" : periodo === "semana" ? "Esta semana" : "Este mês"} · {deltaLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/producao/planeamento" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">← Planeamento</Link>
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-bold">
            {(["hoje", "semana", "mes"] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={periodo === p ? "rounded-md bg-slate-900 px-2.5 py-1 text-white" : "rounded-md px-2.5 py-1 text-slate-600 hover:bg-slate-100"}
              >
                {p === "hoje" ? "Hoje" : p === "semana" ? "Esta semana" : "Este mês"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 1: 6 KPI cards */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="OEE" value={`${data.oeePct.toFixed(0)}%`} delta={deltaOee} deltaUnit="pp" tone={data.oeePct >= 70 ? "emerald" : data.oeePct >= 50 ? "amber" : "red"} icon="⚡" />
        <KpiCard label="Unidades produzidas" value={data.unidades.toLocaleString("pt-PT")} delta={deltaUnidades} deltaUnit="%" tone="sky" icon="📦" />
        <KpiCard label="OPs concluídas" value={data.opsConcl} delta={deltaOps} deltaUnit="%" tone="violet" icon="✅" />
        <KpiCard label="Qualidade" value={`${data.qualidadePct.toFixed(1)}%`} sub={`${data.rejeitadas} rej.`} tone={data.qualidadePct >= 98 ? "emerald" : data.qualidadePct >= 95 ? "amber" : "red"} icon="🎯" />
        <KpiCard label="Pedidos em atraso" value={data.opsAtraso} sub={`${data.pedidosAtivos} ativos`} tone={data.opsAtraso === 0 ? "emerald" : data.opsAtraso < 5 ? "amber" : "red"} icon="⏰" />
        <KpiCard label="Lead time médio" value={`${data.leadTimeDias.toFixed(1)} d`} sub={`${Math.round(data.minParados)} min parados`} tone="slate" icon="⏱" />
      </div>

      {/* Row 2: Charts + OEE gauge + Metas */}
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-12 gap-3">
        {/* Trend line 14 dias */}
        <Panel titulo="Produção diária — últimos 14 dias" className="col-span-12 lg:col-span-6">
          <SparkArea data={data.serie14} />
        </Panel>

        {/* OEE gauge + decomposição */}
        <Panel titulo="OEE — decomposição" className="col-span-6 lg:col-span-3">
          <div className="flex h-full flex-col items-center justify-between">
            <Gauge value={data.oeePct} size={130} />
            <div className="grid w-full grid-cols-3 gap-1 text-center text-[10px] font-extrabold">
              <MiniStat label="Disp." value={`${(data.availability * 100).toFixed(0)}%`} tone="sky" />
              <MiniStat label="Perf." value={`${(data.performance * 100).toFixed(0)}%`} tone="violet" />
              <MiniStat label="Qual." value={`${(data.quality * 100).toFixed(0)}%`} tone="emerald" />
            </div>
          </div>
        </Panel>

        {/* Metas vs produzido */}
        <Panel titulo="Metas vs produzido" className="col-span-6 lg:col-span-3">
          <div className="flex h-full flex-col justify-center gap-3">
            <MetaBar label="Packs/Trouxas" atual={data.packsProduzidos} meta={metaPacks} tone="emerald" />
            <MetaBar label="Campos Cirúrgicos" atual={data.camposProduzidos} meta={metaCampos} tone="sky" />
          </div>
        </Panel>

        {/* Produção por zona */}
        <Panel titulo="Produção por zona" className="col-span-12 md:col-span-6 lg:col-span-4">
          <BarsZona zonas={zonas} valores={data.prodZona} unidade="un" tone="emerald" />
        </Panel>

        {/* Fila por zona agora */}
        <Panel titulo="Fila de OPs (agora)" className="col-span-12 md:col-span-6 lg:col-span-4">
          <BarsZona zonas={zonas} valores={data.fila} unidade="OP" tone="amber" />
        </Panel>

        {/* Top operadores */}
        <Panel titulo="Top operadores" className="col-span-12 md:col-span-6 lg:col-span-4">
          <TopOperadores prodOp={data.prodOp} />
        </Panel>
      </div>
    </div>
  );
}

/* ========= CARDS ========= */

function KpiCard({ label, value, sub, delta, deltaUnit, tone = "slate", icon }: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number;
  deltaUnit?: "%" | "pp";
  tone?: "emerald" | "amber" | "red" | "slate" | "sky" | "violet";
  icon?: string;
}) {
  const toneBg: Record<string, string> = {
    emerald: "from-emerald-50 to-white border-emerald-200",
    amber: "from-amber-50 to-white border-amber-200",
    red: "from-red-50 to-white border-red-200",
    sky: "from-sky-50 to-white border-sky-200",
    violet: "from-violet-50 to-white border-violet-200",
    slate: "from-slate-50 to-white border-slate-200",
  };
  const showDelta = typeof delta === "number" && Number.isFinite(delta);
  const deltaUp = (delta ?? 0) > 0.5;
  const deltaDown = (delta ?? 0) < -0.5;
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${toneBg[tone]} p-3 shadow-sm`}>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-lg leading-none">{icon}</span>}
      </div>
      <p className="mt-1 text-2xl font-black leading-tight text-slate-900">{value}</p>
      <div className="mt-0.5 flex items-center gap-1">
        {showDelta && (
          <span className={`text-[10px] font-extrabold ${deltaUp ? "text-emerald-600" : deltaDown ? "text-red-600" : "text-slate-400"}`}>
            {deltaUp ? "▲" : deltaDown ? "▼" : "•"} {Math.abs(delta!).toFixed(1)}{deltaUnit ?? "%"}
          </span>
        )}
        {sub && <span className="text-[10px] font-bold text-slate-500">{showDelta ? "· " : ""}{sub}</span>}
      </div>
    </div>
  );
}

function Panel({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${className}`}>
      <h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">{titulo}</h3>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "sky" | "violet" | "emerald" }) {
  const c = tone === "sky" ? "text-sky-700 bg-sky-50" : tone === "violet" ? "text-violet-700 bg-violet-50" : "text-emerald-700 bg-emerald-50";
  return (
    <div className={`rounded px-1.5 py-1 ${c}`}>
      <p className="text-[9px] opacity-70">{label}</p>
      <p className="text-xs font-black">{value}</p>
    </div>
  );
}

/* ========= CHARTS (SVG puro) ========= */

function SparkArea({ data }: { data: { dia: Date; valor: number }[] }) {
  const W = 600;
  const H = 160;
  const padX = 28;
  const padY = 16;
  const max = Math.max(1, ...data.map((d) => d.valor));
  const stepX = (W - padX * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (H - padY * 2) * (1 - d.valor / max),
    ...d,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${H - padY} L${points[0].x},${H - padY} Z`;
  const total = data.reduce((a, d) => a + d.valor, 0);
  const media = total / data.length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-baseline gap-3">
        <span className="text-xl font-black text-slate-900">{total.toLocaleString("pt-PT")}</span>
        <span className="text-[10px] font-bold text-slate-500">un / 14d · média {Math.round(media)} un/dia</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* grid lines */}
          {[0.25, 0.5, 0.75].map((t) => (
            <line key={t} x1={padX} x2={W - padX} y1={padY + (H - padY * 2) * t} y2={padY + (H - padY * 2) * t} stroke="rgb(226 232 240)" strokeDasharray="2 3" />
          ))}
          <path d={areaPath} fill="url(#sparkGradient)" />
          <path d={linePath} fill="none" stroke="rgb(16 185 129)" strokeWidth={2.2} />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill="white" stroke="rgb(16 185 129)" strokeWidth={2} />
              <title>{`${p.dia.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}: ${p.valor} un`}</title>
            </g>
          ))}
          {points.map((p, i) => i % 2 === 0 ? (
            <text key={`l-${i}`} x={p.x} y={H - 2} fontSize={9} fontWeight={700} fill="rgb(100 116 139)" textAnchor="middle">
              {p.dia.getDate()}/{p.dia.getMonth() + 1}
            </text>
          ) : null)}
        </svg>
      </div>
    </div>
  );
}

function Gauge({ value, size }: { value: number; size: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 70 ? "rgb(16 185 129)" : pct >= 50 ? "rgb(245 158 11)" : "rgb(239 68 68)";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(241 245 249)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-900">{pct.toFixed(0)}%</span>
        <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500">OEE</span>
      </div>
    </div>
  );
}

function MetaBar({ label, atual, meta, tone }: { label: string; atual: number; meta: number; tone: "emerald" | "sky" }) {
  const pct = meta > 0 ? Math.min(100, (atual / meta) * 100) : 0;
  const atraso = meta > 0 && atual < meta;
  const cor = tone === "emerald" ? "bg-emerald-500" : "bg-sky-500";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-extrabold text-slate-700">{label}</span>
        <span className={`text-[11px] font-black ${pct >= 100 ? "text-emerald-600" : atraso ? "text-slate-700" : "text-slate-900"}`}>
          {atual.toLocaleString("pt-PT")} / {meta > 0 ? meta.toLocaleString("pt-PT") : "—"}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%`, transition: "width 0.6s ease" }} />
        {pct >= 100 && <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white">✓ META ATINGIDA</div>}
      </div>
      <p className="mt-0.5 text-[9px] font-bold text-slate-500">{pct.toFixed(0)}% da meta</p>
    </div>
  );
}

function BarsZona({ zonas, valores, unidade, tone }: { zonas: ZonaProducao[]; valores: Map<string, number>; unidade: string; tone: "emerald" | "amber" }) {
  const linhas = zonas
    .filter((z) => z.tipo !== "camara" && z.tipo !== "esterilizador")
    .map((z) => ({ id: z.id, label: ZONA_LABEL[z.id] ?? z.nome, valor: valores.get(z.id) ?? 0 }));
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  const cor = tone === "emerald" ? "bg-gradient-to-r from-emerald-400 to-emerald-600" : "bg-gradient-to-r from-amber-400 to-amber-600";
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5">
      {linhas.map((l) => (
        <li key={l.id} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-[10px] font-extrabold text-slate-700">{l.label}</span>
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
            <div className={`h-full rounded ${cor}`} style={{ width: `${(l.valor / max) * 100}%`, transition: "width 0.4s ease" }} />
          </div>
          <span className="w-14 shrink-0 text-right text-[11px] font-black tabular-nums text-slate-900">{l.valor} <span className="text-[9px] font-bold text-slate-400">{unidade}</span></span>
        </li>
      ))}
    </ul>
  );
}

function TopOperadores({ prodOp }: { prodOp: Map<string, number> }) {
  const sorted = Array.from(prodOp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(1, ...sorted.map((s) => s[1]));
  if (sorted.length === 0) return <p className="flex h-full items-center justify-center text-xs font-bold text-slate-400">Sem dados no período</p>;
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5">
      {sorted.map(([nome, v], i) => (
        <li key={nome} className="flex items-center gap-2">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
          <span className="w-24 shrink-0 truncate text-[11px] font-extrabold text-slate-800">{nome}</span>
          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="w-14 shrink-0 text-right text-[11px] font-black tabular-nums text-slate-900">{v.toLocaleString("pt-PT")}</span>
        </li>
      ))}
    </ul>
  );
}
