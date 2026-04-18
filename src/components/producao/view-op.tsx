"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ESTADO_OP_COR, ESTADO_OP_LABEL, PRIORIDADE_OP_COR, ZONA_LABEL, TIPO_LINHA_LABEL } from "@/lib/constants";
import { cn, formatShortDateTime } from "@/lib/utils";
import type { OrdemProducao } from "@/lib/types";

interface ViewOPProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  op: OrdemProducao | null;
}

export function ViewOP({ open, onOpenChange, op }: ViewOPProps) {
  if (!op) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-200 bg-white text-slate-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes da OP</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {op.produto_codigo && (
              <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm font-extrabold text-white">
                {op.produto_codigo}
              </span>
            )}
            <span className={cn("rounded-md border px-2 py-0.5 text-sm font-extrabold", ESTADO_OP_COR[op.estado])}>
              {ESTADO_OP_LABEL[op.estado]}
            </span>
            {op.prioridade !== "normal" && (
              <span className={cn("rounded-md border px-2 py-0.5 text-sm font-extrabold capitalize", PRIORIDADE_OP_COR[op.prioridade])}>
                {op.prioridade}
              </span>
            )}
            {op.numero && <span className="text-sm font-bold text-slate-500">OP {op.numero}</span>}
          </div>

          {/* Nome */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Produto</p>
            <p className="text-xl font-black text-slate-900">{op.produto_nome}</p>
          </div>

          {/* Grid de info */}
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
            <InfoRow label="Cliente" value={op.cliente ?? "—"} />
            <InfoRow label="Zona" value={ZONA_LABEL[op.zona_id] ?? op.zona_id} />
            {op.tipo_linha && <InfoRow label="Tipo" value={TIPO_LINHA_LABEL[op.tipo_linha] ?? op.tipo_linha} />}
            <InfoRow label="Qtd Feita" value={`${op.quantidade_atual}`} />
            <InfoRow label="Qtd Alvo" value={`${op.quantidade_alvo}`} />
            {op.inicio_previsto && (
              <InfoRow label="Início Previsto" value={formatShortDateTime(op.inicio_previsto)} />
            )}
            {op.fim_previsto && (
              <InfoRow label="Fim Previsto" value={formatShortDateTime(op.fim_previsto)} />
            )}
            {op.inicio && (
              <InfoRow label="Início Real" value={formatShortDateTime(op.inicio)} />
            )}
            {op.fim_real && (
              <InfoRow label="Fim Real" value={formatShortDateTime(op.fim_real)} />
            )}
          </div>

          {/* Notas */}
          {op.notas && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Notas</p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-700">{op.notas}</p>
            </div>
          )}

          <p className="text-center text-xs font-bold text-slate-400">
            Apenas visualização. Para editar, contacta a gestão.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
