"use client";

import { useRef, useState } from "react";
import { cn, formatDuration, minutesUntil } from "@/lib/utils";
import { ESTADO_OP_COR, ESTADO_OP_LABEL, PRIORIDADE_OP_COR, ZONA_LABEL } from "@/lib/constants";
import type { Funcionario, OrdemProducao, ZonaProducao } from "@/lib/types";

/* ============================================================
   Badges de tipo de linha (Assembling / Termoformadora / Stock)
   ============================================================ */
const TIPO_BADGE: Record<string, { label: string; cor: string }> = {
  manual: { label: "Manual", cor: "bg-amber-100 text-amber-700 border-amber-200" },
  termoformadora: { label: "Termo", cor: "bg-violet-100 text-violet-700 border-violet-200" },
  stock: { label: "Stock", cor: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  // Retrocompatibilidade
  assembling: { label: "Manual", cor: "bg-amber-100 text-amber-700 border-amber-200" },
};

/* ============================================================
   CardZona — suporta zona única ou múltiplas (linhas combinadas)
   ============================================================ */
interface CardZonaProps {
  zona: ZonaProducao;
  /** Zonas extra cujas OPs também aparecem neste card */
  zonasExtra?: ZonaProducao[];
  ordens: OrdemProducao[];
  funcionarios: Funcionario[];
  onOpenOP?: (op: OrdemProducao | null, zonaId: string) => void;
  onOpenTeam?: (zonaId: string) => void;
  onMoveOP?: (opId: string, novaZonaId: string) => void;
  kiosk?: boolean;
  /** Mostrar badges de linha quando há zonas combinadas */
  showLinhaBadge?: boolean;
}

export function CardZona({ zona, zonasExtra, ordens, funcionarios, onOpenOP, onOpenTeam, onMoveOP, kiosk, showLinhaBadge }: CardZonaProps) {
  const allZonaIds = [zona.id, ...(zonasExtra?.map((z) => z.id) ?? [])];
  const emCurso = ordens.filter((o) => o.estado === "em_curso");
  const ativas = ordens.filter((o) => o.estado === "em_curso" || o.estado === "planeada" || o.estado === "pausada");
  const equipa = funcionarios.filter((f) => f.zona_atual && allZonaIds.includes(f.zona_atual) && f.ativo);

  // Drag & drop com counter para evitar flicker em child elements
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
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
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

  // Responsáveis únicos de todas as zonas combinadas
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
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={cn("truncate font-extrabold text-slate-900", kiosk ? "text-base" : "text-sm")}>
            {showLinhaBadge ? zona.nome : (ZONA_LABEL[zona.id] ?? zona.nome)}
          </h3>
          <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
            {ativas.length} OP{ativas.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex-1 grid grid-rows-4 gap-2 overflow-hidden p-2">
        {(() => {
          const MAX = 4;
          const visiveis: OrdemProducao[] = [];
          emCurso.forEach((op) => { if (visiveis.length < MAX) visiveis.push(op); });
          ativas.filter((o) => o.estado !== "em_curso").forEach((op) => { if (visiveis.length < MAX) visiveis.push(op); });
          const restantes = ativas.length - visiveis.length;

          // Sempre 4 slots — preenchidos com OPs ou vazios
          return Array.from({ length: MAX }, (_, i) => {
            const op = visiveis[i];
            if (op) {
              return (
                <OPRow
                  key={op.id}
                  op={op}
                  principal={op.estado === "em_curso"}
                  onClick={onOpenOP ? () => onOpenOP(op, op.zona_id) : undefined}
                  showLinha={showLinhaBadge}
                />
              );
            }
            if (i === visiveis.length && restantes > 0) {
              return (
                <div key={`rest-${i}`} className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs font-bold text-slate-400">
                  +{restantes} OP{restantes > 1 ? "s" : ""}
                </div>
              );
            }
            return (
              <div key={`empty-${i}`} className="rounded-xl border border-dashed border-slate-100" />
            );
          });
        })()}
      </div>

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
   OPRow — agora draggable + badge de linha opcional
   ============================================================ */
function OPRow({ op, principal, onClick, showLinha }: { op: OrdemProducao; principal?: boolean; onClick?: () => void; showLinha?: boolean }) {
  const pct = op.quantidade_alvo > 0 ? Math.min(100, (op.quantidade_atual / op.quantidade_alvo) * 100) : 0;
  const restante = minutesUntil(op.fim_previsto);
  const tipoBadge = op.tipo_linha ? TIPO_BADGE[op.tipo_linha] : undefined;

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("application/op-id", op.id);
    e.dataTransfer.setData("application/from-zona", op.zona_id);
    e.dataTransfer.effectAllowed = "move";
    // Ghost image com slight scale
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col rounded-xl border p-3 transition-all select-none",
        principal ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white",
        "cursor-grab active:cursor-grabbing active:opacity-60 active:scale-[0.97]",
        onClick && "hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {op.produto_codigo && (
              <span className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm font-extrabold text-white">
                {op.produto_codigo}
              </span>
            )}
            {tipoBadge && (
              <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-extrabold", tipoBadge.cor)}>
                {tipoBadge.label}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1">
              <span className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-bold", ESTADO_OP_COR[op.estado])}>
                {ESTADO_OP_LABEL[op.estado]}
              </span>
              {op.prioridade !== "normal" && (
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-bold capitalize", PRIORIDADE_OP_COR[op.prioridade])}>
                  {op.prioridade}
                </span>
              )}
            </div>
          </div>
          <p className={cn("mt-1 truncate font-extrabold text-slate-900", principal ? "text-base" : "text-sm")}>
            {op.produto_nome}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-sm font-bold text-slate-500">
            {op.numero && <span>OP {op.numero}</span>}
            {op.cliente && <span className="truncate">· {op.cliente}</span>}
          </div>
        </div>
      </div>

      {op.quantidade_alvo > 0 && (
        <div className="mt-auto pt-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>{op.quantidade_atual} / {op.quantidade_alvo}</span>
            {restante !== null && (
              <span suppressHydrationWarning className={cn(restante < 0 ? "text-red-600" : "text-slate-500")}>
                {restante < 0 ? `+${formatDuration(-restante)}` : `${formatDuration(restante)}`}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200">
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
