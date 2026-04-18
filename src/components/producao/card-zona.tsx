"use client";

import { useRef, useState, useEffect } from "react";
import { cn, formatDuration, minutesUntil, formatShortDateTime } from "@/lib/utils";
import { ESTADO_OP_COR, ESTADO_OP_LABEL, PRIORIDADE_OP_COR, ZONA_LABEL } from "@/lib/constants";
import type { Funcionario, OrdemProducao, ZonaProducao } from "@/lib/types";

const OPS_PER_PAGE = 3;
const ROTATION_SECONDS = 15;

/* ============================================================
   Badges de tipo de linha (Manual / Termoformadora / Stock)
   ============================================================ */
const TIPO_BADGE: Record<string, { label: string; cor: string }> = {
  manual: { label: "Manual", cor: "bg-amber-100 text-amber-700 border-amber-200" },
  termoformadora: { label: "Termo", cor: "bg-violet-100 text-violet-700 border-violet-200" },
  stock: { label: "Stock", cor: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  assembling: { label: "Manual", cor: "bg-amber-100 text-amber-700 border-amber-200" },
};

/* ============================================================
   CardZona — suporta zona única ou múltiplas (linhas combinadas)
   ============================================================ */
interface CardZonaProps {
  zona: ZonaProducao;
  zonasExtra?: ZonaProducao[];
  ordens: OrdemProducao[];
  funcionarios: Funcionario[];
  onOpenOP?: (op: OrdemProducao | null, zonaId: string) => void;
  onOpenTeam?: (zonaId: string) => void;
  onMoveOP?: (opId: string, novaZonaId: string) => void;
  kiosk?: boolean;
  showLinhaBadge?: boolean;
}

export function CardZona({ zona, zonasExtra, ordens, funcionarios, onOpenOP, onOpenTeam, onMoveOP, kiosk, showLinhaBadge }: CardZonaProps) {
  const allZonaIds = [zona.id, ...(zonasExtra?.map((z) => z.id) ?? [])];
  const emCurso = ordens.filter((o) => o.estado === "em_curso");
  const ativas = ordens.filter((o) =>
    o.estado === "em_curso" || o.estado === "planeada" || o.estado === "pausada" || o.estado === "concluida"
  );
  const equipa = funcionarios.filter((f) => f.zona_atual && allZonaIds.includes(f.zona_atual) && f.ativo);

  // Ordenar por inicio_previsto asc (mais antiga primeiro: 16, 21, 23, 29…)
  const ativasOrdenadas = [...ativas].sort((a, b) => {
    const da = a.inicio_previsto ?? a.created_at;
    const db = b.inicio_previsto ?? b.created_at;
    return new Date(da).getTime() - new Date(db).getTime();
  });

  // Paginação / carrossel
  const totalPages = Math.max(1, Math.ceil(ativasOrdenadas.length / OPS_PER_PAGE));
  const needsCarousel = totalPages > 1;
  const [page, setPage] = useState(0);

  // Clamp page if data changes
  useEffect(() => {
    if (page >= totalPages) setPage(0);
  }, [page, totalPages]);

  // Auto-rotate
  useEffect(() => {
    if (!needsCarousel) return;
    const id = setInterval(() => {
      setPage((p) => (p + 1) % totalPages);
    }, ROTATION_SECONDS * 1000);
    return () => clearInterval(id);
  }, [needsCarousel, totalPages]);

  const pageOPs = ativasOrdenadas.slice(page * OPS_PER_PAGE, (page + 1) * OPS_PER_PAGE);

  // Drag & drop
  const dragCounter = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    setDragOver(true);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const opId = e.dataTransfer.getData("application/op-id");
    const fromZona = e.dataTransfer.getData("application/from-zona");
    if (opId && !allZonaIds.includes(fromZona as typeof zona.id) && onMoveOP) {
      onMoveOP(opId, zona.id);
    }
  }

  const responsaveis = [...new Set([zona.responsavel, ...(zonasExtra?.map((z) => z.responsavel) ?? [])].filter(Boolean))];

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all",
        dragOver ? "border-blue-400 ring-2 ring-blue-200 bg-blue-50/30" : "border-slate-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={cn("truncate font-extrabold text-slate-900", kiosk ? "text-base" : "text-sm")}>
            {showLinhaBadge ? zona.nome : (ZONA_LABEL[zona.id] ?? zona.nome)}
          </h3>
          <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
            {ativas.length} OP{ativas.length === 1 ? "" : "s"}
          </span>
          {needsCarousel && (
            <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
              {page + 1}/{totalPages}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar do carrossel */}
      {needsCarousel && (
        <div className="h-1 w-full bg-slate-100">
          <div
            key={`${page}-${totalPages}`}
            className="h-full bg-blue-400"
            style={{
              animation: `progressFill ${ROTATION_SECONDS}s linear`,
            }}
          />
        </div>
      )}

      {/* OPs — grid de 3 linhas iguais para preencher o espaço */}
      <div className="grid flex-1 grid-rows-3 gap-1 overflow-hidden p-1.5">
        {pageOPs.length > 0 ? (
          pageOPs.map((op) => (
            <OPRow
              key={op.id}
              op={op}
              principal={op.estado === "em_curso"}
              onClick={onOpenOP ? () => onOpenOP(op, op.zona_id) : undefined}
              showLinha={showLinhaBadge}
            />
          ))
        ) : (
          <div className="row-span-3 flex items-center justify-center text-xs font-bold text-slate-300">
            Sem OPs ativas
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
        {responsaveis.length > 0 && (
          <div className="mb-1 flex items-center gap-1.5 text-xs font-bold">
            <span className="text-slate-400">Resp:</span>
            <span className="text-slate-800">{responsaveis.join(", ")}</span>
          </div>
        )}
        <button
          onClick={onOpenTeam ? () => onOpenTeam(zona.id) : undefined}
          className={cn(
            "flex w-full items-center gap-2 text-left text-xs font-bold",
            onOpenTeam && "cursor-pointer hover:text-slate-900"
          )}
        >
          <span className="text-slate-400">Equipa:</span>
          {equipa.length === 0 && <span className="text-slate-400 italic">— ninguém —</span>}
          <div className="flex flex-wrap items-center gap-1">
            {equipa.map((f) => (
              <span
                key={f.id}
                className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-extrabold text-white shadow-sm"
                style={{ backgroundColor: f.cor ?? "#64748b" }}
                title={f.nome}
              >
                {f.iniciais ?? f.nome.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            ))}
          </div>
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   OPRow — draggable + badge de linha
   ============================================================ */
function OPRow({ op, principal, onClick, showLinha }: { op: OrdemProducao; principal?: boolean; onClick?: () => void; showLinha?: boolean }) {
  const pct = op.quantidade_alvo > 0 ? Math.min(100, (op.quantidade_atual / op.quantidade_alvo) * 100) : 0;
  const restante = minutesUntil(op.fim_previsto);
  const tipoBadge = op.tipo_linha ? TIPO_BADGE[op.tipo_linha] : undefined;
  const concluida = op.estado === "concluida";
  const atraso = !concluida && restante !== null && restante < 0;

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("application/op-id", op.id);
    e.dataTransfer.setData("application/from-zona", op.zona_id);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }

  // Linha compacta: OP + cliente + datas tudo junto
  const infoSegments: string[] = [];
  if (op.numero) infoSegments.push(`OP ${op.numero}`);
  if (op.cliente) infoSegments.push(op.cliente);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      className={cn(
        "flex min-h-0 flex-col justify-center overflow-hidden rounded-lg border border-l-4 px-2 py-1.5 transition-all select-none",
        concluida ? "border-blue-200 border-l-blue-400 bg-blue-50" :
        atraso ? "border-red-300 border-l-red-500 bg-red-50/40 ring-1 ring-red-200" :
        principal ? "border-emerald-200 border-l-emerald-400 bg-emerald-50" :
        "border-slate-200 border-l-slate-300 bg-white",
        "cursor-grab active:cursor-grabbing active:opacity-60 active:scale-[0.97]",
        onClick && "hover:shadow-md"
      )}
    >
      {/* Linha 1: badges (ref, tipo, estado, prioridade) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {op.produto_codigo && (
          <span className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm font-extrabold text-white">
            {op.produto_codigo}
          </span>
        )}
        {tipoBadge && (
          <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-extrabold", tipoBadge.cor)}>
            {tipoBadge.label}
          </span>
        )}
        <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-bold", ESTADO_OP_COR[op.estado])}>
          {ESTADO_OP_LABEL[op.estado]}
        </span>
        {op.prioridade !== "normal" && (
          <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-bold capitalize", PRIORIDADE_OP_COR[op.prioridade])}>
            {op.prioridade}
          </span>
        )}
        {atraso && (
          <span className="shrink-0 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm animate-pulse">
            ⚠ Atraso
          </span>
        )}
      </div>

      {/* Linha 2: nome do produto + lote — até 2 linhas */}
      <p className="mt-1 line-clamp-2 text-sm font-extrabold leading-snug text-slate-900">
        {op.produto_nome}
        {op.lote && (
          <span className="ml-1.5 rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-extrabold text-sky-700">
            Lote {op.lote}
          </span>
        )}
      </p>

      {/* Linha 3: OP + cliente + datas */}
      <div className="mt-0.5 flex items-center gap-2 text-sm font-bold text-slate-400">
        {infoSegments.length > 0 && (
          <span className="shrink-0 text-slate-500">{infoSegments.join(" · ")}</span>
        )}
        {(op.inicio_previsto || op.fim_previsto) && infoSegments.length > 0 && (
          <span className="text-slate-200">|</span>
        )}
        {op.inicio_previsto && (
          <span suppressHydrationWarning>▸{formatShortDateTime(op.inicio_previsto)}</span>
        )}
        {op.inicio_previsto && op.fim_previsto && <span className="text-slate-200">→</span>}
        {op.fim_previsto && (
          <span suppressHydrationWarning className={cn(atraso && "text-red-500")}>
            ■{formatShortDateTime(op.fim_previsto)}
          </span>
        )}
      </div>

      {/* Linha 4: barra de progresso */}
      {op.quantidade_alvo > 0 && (
        <div className="mt-1.5">
          <div className="flex items-center justify-between text-sm font-bold text-slate-600">
            <span>{op.quantidade_atual} / {op.quantidade_alvo}</span>
            {restante !== null && !concluida && (
              <span suppressHydrationWarning className={cn(atraso ? "text-red-600" : "text-slate-500")}>
                {atraso ? `+${formatDuration(-restante)}` : formatDuration(restante)}
              </span>
            )}
          </div>
          <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              suppressHydrationWarning
              className={cn("h-full rounded-full transition-all", principal ? "bg-emerald-500" : "bg-slate-400")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
