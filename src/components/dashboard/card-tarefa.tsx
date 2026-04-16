"use client";

import { cn, getPriorityColor, getPriorityBadgeColor, getUrgencyLevel, formatDate, daysLabel } from "@/lib/utils";
import { PRIORIDADE_LABELS, TIPO_TAREFA } from "@/lib/constants";
import type { Tarefa } from "@/lib/types";

interface CardTarefaProps {
  item: Tarefa;
  onComplete: (id: string) => void;
  onEdit: (item: Tarefa) => void;
  completing?: boolean;
}

const TIPO_ICONS: Record<string, string> = {
  reuniao: "🤝",
  reuniao_comercial: "💼",
  follow_up: "📞",
  follow_up_cotacao: "💬",
  tarefa: "📝",
  pedido_esclarecimento: "❓",
  pronuncia: "⚖️",
};

export function CardTarefa({ item, onComplete, onEdit, completing }: CardTarefaProps) {
  const priorityColor = getPriorityColor(item.prioridade);
  const priorityBadge = getPriorityBadgeColor(item.prioridade);
  const urgency = getUrgencyLevel(item.data_hora);
  const tipoIcon = TIPO_ICONS[item.tipo] ?? "📝";

  return (
    <div
      className={cn(
        "group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 border-l-4 bg-white p-3 shadow-sm transition-all hover:shadow-md",
        priorityColor,
        urgency === "overdue" && item.data_hora && "pulse-overdue",
        completing && "animate-fade-out"
      )}
      onClick={() => onEdit(item)}
    >
      {/* Dossier chip destacado no topo */}
      {item.numero_dossier && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-emerald-800">
            Dossier {item.numero_dossier}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 text-sm">{tipoIcon}</span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-900">
              {item.cliente || TIPO_TAREFA[item.tipo]}
            </h3>
            {item.nome_procedimento && (
              <p className="mt-0.5 truncate text-xs font-bold text-slate-700">
                <span className="text-slate-500">Procedimento: </span>
                {item.nome_procedimento}
              </p>
            )}
          </div>
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

      {item.descricao && (
        <p className="mt-1 truncate text-xs font-bold text-slate-700">{item.descricao}</p>
      )}

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
          {daysLabel(item.data_hora)}
        </span>
        <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold", priorityBadge)}>
          {PRIORIDADE_LABELS[item.prioridade]}
        </span>
        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
          {TIPO_TAREFA[item.tipo]}
        </span>
      </div>

      {item.data_hora && (
        <p className="mt-1.5 text-xs font-bold text-slate-500">
          Data-Limite: {formatDate(item.data_hora)}
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
