"use client";

import { useMemo, useState } from "react";
import { ZONA_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { OrdemProducao, ZonaProducao, PedidoProducao } from "@/lib/types";

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// Cores por ESTADO (atraso sobrepõe)
const ESTADO_COR: Record<string, { bg: string; text: string; label: string }> = {
  em_curso:   { bg: "bg-emerald-500", text: "text-white", label: "Em Curso" },
  planeada:   { bg: "bg-sky-500",     text: "text-white", label: "Planeada" },
  pausada:    { bg: "bg-yellow-500",  text: "text-white", label: "Pausada" },
  concluida:  { bg: "bg-slate-400",   text: "text-white", label: "Concluída" },
  cancelada:  { bg: "bg-slate-300",   text: "text-slate-600", label: "Cancelada" },
};
const COR_ATRASO = { bg: "bg-red-500", text: "text-white", label: "Atrasada" };

function getCor(op: OrdemProducao) {
  if (
    (op.estado === "em_curso" || op.estado === "planeada") &&
    op.fim_previsto && new Date(op.fim_previsto) < new Date()
  ) return COR_ATRASO;
  return ESTADO_COR[op.estado] ?? ESTADO_COR.planeada;
}

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay() || 7;
  r.setDate(r.getDate() - (day - 1));
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function formatDayLabel(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function GanttTab({ pedidos = [], ops, zonas }: { pedidos?: PedidoProducao[]; ops: OrdemProducao[]; zonas: ZonaProducao[] }) {
  const [semanaOffset, setSemanaOffset] = useState(0);

  const { weekStart, weekEnd, days } = useMemo(() => {
    const base = addDays(startOfWeek(new Date()), semanaOffset * 7);
    const end = addDays(base, 7);
    const ds = Array.from({ length: 7 }, (_, i) => addDays(base, i));
    return { weekStart: base, weekEnd: end, days: ds };
  }, [semanaOffset]);

  const weekMs = 7 * 24 * 3600 * 1000;

  // Map pedido por id (para enriquecer linha de OP com prio/comercial/stock e datas do planeamento)
  const pedidoPorId = useMemo(() => {
    const m = new Map<string, PedidoProducao>();
    for (const p of pedidos) m.set(p.id, p);
    return m;
  }, [pedidos]);

  const opsDaSemana = useMemo(() => {
    const ordemZonas: Record<string, number> = {};
    zonas.forEach((z, i) => { ordemZonas[z.id] = i; });
    return ops
      .filter((o) => {
        const ped = o.pedido_id ? pedidoPorId.get(o.pedido_id) : undefined;
        const iniRaw = ped?.data_agendada ?? o.inicio_previsto;
        const fimRaw = ped?.data_fim_agendada ?? ped?.data_agendada ?? o.fim_previsto;
        if (!iniRaw || !fimRaw) return false;
        const ini = new Date(iniRaw);
        const fimDate = new Date(fimRaw);
        // Adicionar +1 dia ao fim para incluir o próprio dia (data_fim_agendada é normalmente 11:00)
        const fim = new Date(fimDate.getFullYear(), fimDate.getMonth(), fimDate.getDate() + 1);
        return ini < weekEnd && fim >= weekStart;
      })
      .sort((a, b) => {
        const oa = ordemZonas[a.zona_id] ?? 999;
        const ob = ordemZonas[b.zona_id] ?? 999;
        if (oa !== ob) return oa - ob;
        const aPed = a.pedido_id ? pedidoPorId.get(a.pedido_id) : undefined;
        const bPed = b.pedido_id ? pedidoPorId.get(b.pedido_id) : undefined;
        const aIni = new Date(aPed?.data_agendada ?? a.inicio_previsto ?? 0).getTime();
        const bIni = new Date(bPed?.data_agendada ?? b.inicio_previsto ?? 0).getTime();
        return aIni - bIni;
      });
  }, [ops, weekStart, weekEnd, zonas, pedidoPorId]);

  // Pedidos programados nesta semana (data_agendada cai entre weekStart e weekEnd)
  const pedidosDaSemana = useMemo(() =>
    pedidos
      .filter((p) => {
        if (p.estado === "concluido" || p.estado === "cancelado") return false;
        if (!p.data_agendada) return false;
        const d = new Date(p.data_agendada);
        return d >= weekStart && d < weekEnd;
      })
      .sort((a, b) => new Date(a.data_agendada!).getTime() - new Date(b.data_agendada!).getTime()),
  [pedidos, weekStart, weekEnd]);

  function calcPedidoBar(p: PedidoProducao) {
    const d = new Date(p.data_agendada!);
    // bar ocupa o dia todo (24h)
    const diaInicio = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const startOffset = Math.max(0, diaInicio - weekStart.getTime());
    const dayMs = 24 * 3600 * 1000;
    const leftPct = (startOffset / weekMs) * 100;
    const widthPct = (dayMs / weekMs) * 100;
    return { leftPct, widthPct };
  }

  function calcBar(op: OrdemProducao) {
    // Preferir as datas do pedido (data_agendada/data_fim_agendada do planeamento) se existirem
    const ped = op.pedido_id ? pedidoPorId.get(op.pedido_id) : undefined;
    const iniRaw = ped?.data_agendada ?? op.inicio_previsto;
    const fimRaw = ped?.data_fim_agendada ?? ped?.data_agendada ?? op.fim_previsto;
    if (!iniRaw || !fimRaw) return { leftPct: 0, widthPct: 0 };
    const dayMs = 24 * 3600 * 1000;
    // Normalizar ao início do dia local (00:00) para a barra cobrir o dia inteiro
    const iniDate = new Date(iniRaw);
    const iniStart = new Date(iniDate.getFullYear(), iniDate.getMonth(), iniDate.getDate()).getTime();
    const fimDate = new Date(fimRaw);
    const fimEnd = new Date(fimDate.getFullYear(), fimDate.getMonth(), fimDate.getDate()).getTime() + dayMs;
    const startOffset = Math.max(0, iniStart - weekStart.getTime());
    const endOffset = Math.min(weekMs, Math.max(iniStart + dayMs, fimEnd) - weekStart.getTime());
    const leftPct = (startOffset / weekMs) * 100;
    const widthPct = Math.max(2, ((endOffset - startOffset) / weekMs) * 100);
    return { leftPct, widthPct };
  }

  const hojeMs = new Date().getTime();
  const hojePct = hojeMs >= weekStart.getTime() && hojeMs < weekEnd.getTime()
    ? ((hojeMs - weekStart.getTime()) / weekMs) * 100
    : null;

  let lastZona = "";

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <button
          onClick={() => setSemanaOffset((s) => s - 1)}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-700 hover:bg-slate-200"
        >
          ← Semana anterior
        </button>
        <button
          onClick={() => setSemanaOffset(0)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-extrabold",
            semanaOffset === 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
        >
          Hoje
        </button>
        <button
          onClick={() => setSemanaOffset((s) => s + 1)}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-700 hover:bg-slate-200"
        >
          Semana seguinte →
        </button>
        <div className="ml-4 text-sm font-black text-slate-800">
          {formatDayLabel(weekStart)} — {formatDayLabel(addDays(weekStart, 6))}
        </div>
        <div className="ml-auto text-xs font-bold text-slate-500">
          {opsDaSemana.length} OP{opsDaSemana.length === 1 ? "" : "s"} nesta semana
        </div>
      </div>

      {/* Gantt */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Header dias */}
        <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: "460px repeat(7, 1fr)" }}>
          <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">OP / Produto</div>
          {days.map((d, i) => {
            const isHoje = d.toDateString() === new Date().toDateString();
            return (
              <div
                key={i}
                className={cn(
                  "border-l border-slate-200 px-2 py-2 text-center text-[10px] font-extrabold uppercase tracking-wide",
                  isHoje ? "bg-emerald-100 text-emerald-700" : "text-slate-500"
                )}
              >
                {DIAS_SEMANA[i]} {formatDayLabel(d)}
              </div>
            );
          })}
        </div>

        {/* Linhas */}
        <div className="relative flex flex-1 flex-col min-h-0 overflow-y-auto">
          {/* Linha vertical do "agora" */}
          {hojePct !== null && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-red-500"
              style={{ left: `calc(460px + ((100% - 460px) * ${hojePct} / 100))` }}
            />
          )}

          {opsDaSemana.length === 0 && (
            <div className="px-3 py-12 text-center text-sm font-bold text-slate-400">
              Sem OPs programadas para esta semana
            </div>
          )}

          {opsDaSemana.map((op) => {
            const { leftPct, widthPct } = calcBar(op);
            const cor = getCor(op);
            const isNewZona = op.zona_id !== lastZona;
            lastZona = op.zona_id;
            const ped = op.pedido_id ? pedidoPorId.get(op.pedido_id) : undefined;
            const prio = (ped?.prioridade ?? op.prioridade) as string;
            const tipoLinha = ped?.tipo_linha ?? op.tipo_linha;
            const tipoLabel = tipoLinha === "termoformadora" ? "T" : tipoLinha === "manual" ? "M" : tipoLinha === "stock" ? "S" : tipoLinha === "campos" ? "C" : null;
            const prioLetter = prio === "urgente" ? "U" : prio === "alta" ? "A" : prio === "normal" ? "N" : prio === "baixa" ? "B" : "";
            const prioCls = prio === "urgente" ? "bg-red-100 text-red-700"
              : prio === "alta" ? "bg-orange-100 text-orange-700"
              : prio === "normal" ? "bg-slate-100 text-slate-700"
              : prio === "baixa" ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-50 text-slate-400";
            const noStock = ped?.stock_status === "pendente";
            const numeroPP = ped?.numero ?? op.numero;
            const deadline = ped?.fim_previsto ?? op.fim_previsto;
            const fullTip = `${numeroPP ?? ""} ${op.produto_codigo ?? ""} ${op.produto_nome} · ${op.cliente ?? ped?.cliente ?? ""}${ped?.comercial ? " · 👤 " + ped.comercial : ""} · ${op.quantidade_atual}/${op.quantidade_alvo} un · ${cor.label}${deadline ? " · deadline " + new Date(deadline).toLocaleDateString("pt-PT") : ""}${noStock ? " · ⚠ falta CP/MP" : ""}`;
            return (
              <div key={op.id}>
                {isNewZona && (
                  <div className="grid border-b border-t border-slate-200 bg-slate-100" style={{ gridTemplateColumns: "460px 1fr" }}>
                    <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                      {ZONA_LABEL[op.zona_id] ?? op.zona_id}
                    </div>
                    <div />
                  </div>
                )}
                <div className="grid border-b border-slate-100 hover:bg-slate-50" style={{ gridTemplateColumns: "460px 1fr", minHeight: 44, maxHeight: 80 }}>
                  <div className="flex flex-col justify-center border-r border-slate-200 px-2 py-0.5 leading-tight" title={fullTip}>
                    <div className="flex min-w-0 items-center gap-1">
                      {prioLetter && (
                        <span className={cn("shrink-0 rounded px-1 text-[10px] font-extrabold", prioCls)} title={`Prio ${prio}`}>{prioLetter}</span>
                      )}
                      {numeroPP && (
                        <span className="shrink-0 rounded bg-slate-900 px-1 font-mono text-[10px] font-extrabold text-white">{numeroPP}</span>
                      )}
                      {op.produto_codigo && (
                        <span className="shrink-0 font-mono text-[10px] font-bold text-slate-500">{op.produto_codigo}</span>
                      )}
                      {tipoLabel && (
                        <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-extrabold text-slate-700">{tipoLabel}</span>
                      )}
                      <span className="truncate text-xs font-extrabold text-slate-900">{op.produto_nome}</span>
                      {op.lote && <span className="shrink-0 rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-700">L {op.lote}</span>}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <span className="truncate">{op.cliente ?? ped?.cliente ?? "—"}</span>
                      {deadline && (
                        <span className="shrink-0">· 📅 {new Date(deadline).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}</span>
                      )}
                      {ped?.comercial && (
                        <span className="shrink-0 truncate text-indigo-600">· 👤 {ped.comercial}</span>
                      )}
                      {noStock && <span className="shrink-0 rounded bg-amber-100 px-1 text-amber-700">⚠</span>}
                    </div>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 grid grid-cols-7">
                      {Array.from({ length: 7 }, (_, i) => (
                        <div key={i} className={cn("border-r border-slate-100", i === 6 && "border-r-0")} />
                      ))}
                    </div>
                    <div
                      title={fullTip}
                      className={cn("absolute rounded-md shadow-sm flex items-center justify-center px-2", cor.bg)}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: 6, bottom: 6 }}
                    >
                      <span className={cn("truncate text-[11px] font-extrabold", cor.text)}>
                        {op.quantidade_atual}/{op.quantidade_alvo} un
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <span className="font-black text-slate-600">Estados:</span>
        <LegendaItem cor="bg-sky-500" label="Planeada" />
        <LegendaItem cor="bg-emerald-500" label="Em curso" />
        <LegendaItem cor="bg-yellow-500" label="Pausada" />
        <LegendaItem cor="bg-red-500" label="Atrasada" />
        <LegendaItem cor="bg-slate-400" label="Concluída" />
        <span className="mx-2 text-slate-300">|</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-red-500"></span> Agora</span>
      </div>
    </div>
  );
}

function LegendaItem({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("inline-block h-3 w-6 rounded", cor)}></span>
      {label}
    </span>
  );
}
