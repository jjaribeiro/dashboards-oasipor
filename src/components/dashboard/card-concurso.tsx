"use client";

import { cn, getUrgencyLevel, getUrgencyColor, formatDate, daysLabel } from "@/lib/utils";
import { ESTADO_CONCURSO } from "@/lib/constants";
import type { Concurso } from "@/lib/types";

interface CardConcursoProps {
  item: Concurso;
  onComplete: (id: string) => void;
  onEdit: (item: Concurso) => void;
  completing?: boolean;
}

export function CardConcurso({ item, onComplete, onEdit, completing }: CardConcursoProps) {
  const urgency = getUrgencyLevel(item.prazo);
  const urgencyColor = getUrgencyColor(urgency);

  return (
    <div
      className={cn(
        "group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 border-l-4 bg-white p-3 shadow-sm transition-all hover:shadow-md",
        urgencyColor,
        urgency === "overdue" && "pulse-overdue",
        completing && "animate-fade-out"
      )}
      onClick={() => onEdit(item)}
    >
      {/* Dossier chip destacado no topo */}
      {item.numero_dossier && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-md border border-blue-300 bg-blue-100 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-blue-800">
            Dossier {item.numero_dossier}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900">{item.cliente}</h3>
          {item.nome_procedimento && (
            <p className="mt-0.5 truncate text-xs font-bold text-slate-700">
              <span className="text-slate-500">Procedimento: </span>
              {item.nome_procedimento}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete(item.id);
          }}
          className="shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-emerald-100 hover:text-emerald-600 group-hover:opacity-100"
          title="Marcar como concluído"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold",
            urgency === "overdue"
              ? "border-red-200 bg-red-100 text-red-700"
              : urgency === "today"
              ? "border-orange-200 bg-orange-100 text-orange-700"
              : urgency === "soon"
              ? "border-yellow-200 bg-yellow-100 text-yellow-700"
              : "border-emerald-200 bg-emerald-100 text-emerald-700"
          )}
        >
          {daysLabel(item.prazo)}
        </span>
        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
          {ESTADO_CONCURSO[item.estado]}
        </span>
      </div>

      {item.prazo && (
        <p className="mt-1.5 text-xs font-bold text-slate-500">
          Data-Limite: {formatDate(item.prazo)}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1.5 text-[10px] font-bold">
        {item.vendedor && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
            <span className="text-slate-400">Comercial:</span> {item.vendedor}
          </span>
        )}
        {item.responsavel && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
            <span className="text-blue-500">Responsável:</span> {item.responsavel}
          </span>
        )}
      </div>
    </div>
  );
}
