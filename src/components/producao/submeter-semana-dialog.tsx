"use client";

import { useEffect, useState } from "react";
import type { PedidoProducao } from "@/lib/types";

interface Props {
  open: boolean;
  pedidos: PedidoProducao[];
  onClose: () => void;
  onConfirm: (rotulagemIds: Set<string>) => Promise<void> | void;
}

export function SubmeterSemanaDialog({ open, pedidos, onClose, onConfirm }: Props) {
  const [rotulagemIds, setRotulagemIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      // Default: pré-seleciona pedidos com a flag precisa_rotulagem já marcada
      const inicial = new Set<string>();
      for (const p of pedidos) if (p.precisa_rotulagem) inicial.add(p.id);
      setRotulagemIds(inicial);
    }
  }, [open, pedidos]);

  if (!open) return null;

  function toggle(id: string) {
    setRotulagemIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setRotulagemIds((s) => {
      if (s.size === pedidos.length) return new Set();
      return new Set(pedidos.map((p) => p.id));
    });
  }

  async function handleConfirm() {
    setSubmitting(true);
    try { await onConfirm(rotulagemIds); } finally { setSubmitting(false); }
  }

  const todasMarcadas = rotulagemIds.size === pedidos.length && pedidos.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">Submeter semana</h2>
            <p className="mt-0.5 text-sm font-bold text-slate-500">
              {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"} · marca os que precisam de inspeção de rotulagem
            </p>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          <span>Pedidos a submeter</span>
          <button onClick={toggleAll} className="rounded bg-white px-2 py-1 text-[11px] font-extrabold text-emerald-700 hover:bg-emerald-50">
            {todasMarcadas ? "Desmarcar todos" : "Marcar todos para rotulagem"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {pedidos.length === 0 ? (
            <p className="py-12 text-center text-sm font-bold text-slate-400">Sem pedidos para submeter</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pedidos.map((p) => {
                const checked = rotulagemIds.has(p.id);
                return (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-6 py-3 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.id)}
                        className="h-5 w-5 shrink-0 cursor-pointer"
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex min-w-0 items-center gap-2">
                          {p.numero && (
                            <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-white">{p.numero}</span>
                          )}
                          {p.produto_codigo && (
                            <span className="shrink-0 font-mono text-[11px] font-bold text-slate-500">{p.produto_codigo}</span>
                          )}
                          <span className="truncate text-sm font-extrabold text-slate-900">{p.produto_nome}</span>
                        </div>
                        <div className="flex min-w-0 items-center gap-2 text-[11px] font-bold text-slate-500">
                          <span className="truncate">{p.cliente ?? "—"}</span>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{p.quantidade_alvo} un</span>
                          {p.data_agendada && (
                            <span className="shrink-0">📅 {new Date(p.data_agendada).toLocaleDateString("pt-PT")}</span>
                          )}
                        </div>
                      </div>
                      {checked && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
                          🏷 Rotulagem
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
          <span className="text-xs font-bold text-slate-600">
            {rotulagemIds.size} de {pedidos.length} marcados para rotulagem
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              disabled={submitting}
            >Cancelar</button>
            <button
              onClick={handleConfirm}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              disabled={submitting || pedidos.length === 0}
            >
              {submitting ? "A submeter…" : `✓ Submeter ${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
