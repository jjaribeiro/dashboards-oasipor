"use client";

import { cn, formatDuration, minutesUntil } from "@/lib/utils";
import { ESTADO_OP_COR, ESTADO_OP_LABEL, PRIORIDADE_OP_COR, ZONA_LABEL } from "@/lib/constants";
import type { Funcionario, OrdemProducao, ZonaProducao } from "@/lib/types";

interface CardZonaProps {
  zona: ZonaProducao;
  ordens: OrdemProducao[];
  funcionarios: Funcionario[];
  onOpenOP?: (op: OrdemProducao | null, zonaId: string) => void;
  onOpenTeam?: (zonaId: string) => void;
  kiosk?: boolean;
}

export function CardZona({ zona, ordens, funcionarios, onOpenOP, onOpenTeam, kiosk }: CardZonaProps) {
  const emCurso = ordens.find((o) => o.estado === "em_curso");
  const ativas = ordens.filter((o) => o.estado === "em_curso" || o.estado === "planeada" || o.estado === "pausada");
  const equipa = funcionarios.filter((f) => f.zona_atual === zona.id && f.ativo);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={cn("truncate font-extrabold text-slate-900", kiosk ? "text-base" : "text-sm")}>
            {ZONA_LABEL[zona.id] ?? zona.nome}
          </h3>
          <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
            {ativas.length} OP{ativas.length === 1 ? "" : "s"}
          </span>
        </div>
        {onOpenOP && (
          <button
            onClick={() => onOpenOP(null, zona.id)}
            className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
            title="Nova OP"
          >
            + OP
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-hidden p-2">
        {emCurso ? <OPRow op={emCurso} principal onClick={onOpenOP ? () => onOpenOP(emCurso, zona.id) : undefined} /> : (
          <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs font-bold text-slate-400">
            Sem OP em curso
          </div>
        )}
        {ativas.filter((o) => o.id !== emCurso?.id).slice(0, 2).map((op) => (
          <OPRow key={op.id} op={op} onClick={onOpenOP ? () => onOpenOP(op, zona.id) : undefined} />
        ))}
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-2 py-1.5">
        <button
          onClick={onOpenTeam ? () => onOpenTeam(zona.id) : undefined}
          className={cn(
            "flex w-full items-center gap-1.5 text-left text-[10px] font-bold",
            onOpenTeam && "cursor-pointer hover:text-slate-900"
          )}
        >
          <span className="text-slate-400">Equipa:</span>
          {equipa.length === 0 && <span className="text-slate-400 italic">— ninguém —</span>}
          <div className="flex flex-wrap items-center gap-1">
            {equipa.map((f) => (
              <span
                key={f.id}
                className="inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-extrabold text-white shadow-sm"
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

function OPRow({ op, principal, onClick }: { op: OrdemProducao; principal?: boolean; onClick?: () => void }) {
  const pct = op.quantidade_alvo > 0 ? Math.min(100, (op.quantidade_atual / op.quantidade_alvo) * 100) : 0;
  const restante = minutesUntil(op.fim_previsto);

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border p-2 transition-all",
        principal ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white",
        onClick && "cursor-pointer hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {op.produto_codigo && (
              <span className="shrink-0 rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-white">
                {op.produto_codigo}
              </span>
            )}
            <p className={cn("truncate font-bold text-slate-900", principal ? "text-sm" : "text-xs")}>
              {op.produto_nome}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
            {op.numero && <span>OP {op.numero}</span>}
            {op.cliente && <span className="truncate">· {op.cliente}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", ESTADO_OP_COR[op.estado])}>
            {ESTADO_OP_LABEL[op.estado]}
          </span>
          {op.prioridade !== "normal" && (
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold capitalize", PRIORIDADE_OP_COR[op.prioridade])}>
              {op.prioridade}
            </span>
          )}
        </div>
      </div>

      {op.quantidade_alvo > 0 && (
        <div className="mt-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
            <span>{op.quantidade_atual} / {op.quantidade_alvo}</span>
            {restante !== null && (
              <span suppressHydrationWarning className={cn(restante < 0 ? "text-red-600" : "text-slate-500")}>
                {restante < 0 ? `+${formatDuration(-restante)}` : `${formatDuration(restante)}`}
              </span>
            )}
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
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
