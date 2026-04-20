"use client";

import { useMemo, useState } from "react";
import { ZONA_LABEL, ESTADO_OP_LABEL, ESTADO_OP_COR, PRIORIDADE_OP_COR } from "@/lib/constants";
import { cn, formatShortDateTime } from "@/lib/utils";
import { FormOP } from "./form-op";
import type { OrdemProducao, PedidoProducao, ZonaProducao } from "@/lib/types";

export function OPsTab({ ops, pedidos, zonas }: { ops: OrdemProducao[]; pedidos: PedidoProducao[]; zonas: ZonaProducao[] }) {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("");
  const [zonaFiltro, setZonaFiltro] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<OrdemProducao | null>(null);

  const pedidoPorId = useMemo(() => {
    const m = new Map<string, PedidoProducao>();
    for (const p of pedidos) m.set(p.id, p);
    return m;
  }, [pedidos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ops.filter((o) => {
      if (estado && o.estado !== estado) return false;
      if (zonaFiltro && o.zona_id !== zonaFiltro) return false;
      if (!q) return true;
      const ped = o.pedido_id ? pedidoPorId.get(o.pedido_id) : null;
      return (
        (o.produto_codigo ?? "").toLowerCase().includes(q) ||
        (o.produto_nome ?? "").toLowerCase().includes(q) ||
        (o.cliente ?? "").toLowerCase().includes(q) ||
        (o.numero ?? "").toLowerCase().includes(q) ||
        (o.lote ?? "").toLowerCase().includes(q) ||
        (ped?.numero ?? "").toLowerCase().includes(q)
      );
    });
  }, [ops, search, estado, zonaFiltro, pedidoPorId]);

  function abrirEdit(op: OrdemProducao) {
    setEditItem(op);
    setFormOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar por OP, PP, ref, produto, cliente, lote..."
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        >
          <option value="">Todos os estados</option>
          {Object.entries(ESTADO_OP_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        <select
          value={zonaFiltro}
          onChange={(e) => setZonaFiltro(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        >
          <option value="">Todas as zonas</option>
          {zonas.map((z) => <option key={z.id} value={z.id}>{ZONA_LABEL[z.id] ?? z.nome}</option>)}
        </select>
        <span className="ml-auto text-xs font-bold text-slate-500">{filtered.length} OPs</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2 text-left">Nº OP</th>
                <th className="px-3 py-2 text-left">Lote</th>
                <th className="px-3 py-2 text-left">Nº PP</th>
                <th className="px-3 py-2 text-left">Ref</th>
                <th className="px-3 py-2 text-left">Produto</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Zona</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Prio</th>
                <th className="px-3 py-2 text-right">Qtd</th>
                <th className="px-3 py-2 text-left">Início prev.</th>
                <th className="px-3 py-2 text-left">Fim prev.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, idx) => {
                const ped = o.pedido_id ? pedidoPorId.get(o.pedido_id) : null;
                return (
                  <tr
                    key={o.id}
                    onClick={() => abrirEdit(o)}
                    className="cursor-pointer border-b border-slate-100 hover:bg-sky-50"
                  >
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-1.5 font-mono font-extrabold text-slate-900">{o.numero ?? <span className="italic text-slate-300">—</span>}</td>
                    <td className="px-3 py-1.5 font-mono font-bold text-slate-700">{o.lote ?? <span className="italic text-slate-300">—</span>}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-600">{ped?.numero ?? <span className="italic text-slate-300">—</span>}</td>
                    <td className="px-3 py-1.5 font-mono font-bold text-slate-900">{o.produto_codigo ?? "—"}</td>
                    <td className="px-3 py-1.5 font-bold text-slate-800">{o.produto_nome}</td>
                    <td className="px-3 py-1.5 text-slate-600">{o.cliente ?? ped?.cliente ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-700">{ZONA_LABEL[o.zona_id] ?? o.zona_id}</td>
                    <td className="px-3 py-1.5"><span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold", ESTADO_OP_COR[o.estado])}>{ESTADO_OP_LABEL[o.estado]}</span></td>
                    <td className="px-3 py-1.5"><span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold capitalize", PRIORIDADE_OP_COR[o.prioridade])}>{o.prioridade}</span></td>
                    <td className="px-3 py-1.5 text-right font-bold text-slate-900">{o.quantidade_atual}/{o.quantidade_alvo}</td>
                    <td className="px-3 py-1.5 text-slate-500" suppressHydrationWarning>{o.inicio_previsto ? formatShortDateTime(o.inicio_previsto) : "—"}</td>
                    <td className="px-3 py-1.5 text-slate-500" suppressHydrationWarning>{o.fim_previsto ? formatShortDateTime(o.fim_previsto) : "—"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="px-3 py-8 text-center text-sm font-bold text-slate-400">Sem OPs</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && editItem && (() => {
        const idx = filtered.findIndex((o) => o.id === editItem.id);
        const prev = idx > 0 ? filtered[idx - 1] : null;
        const next = idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1] : null;
        return (
          <FormOP
            open={formOpen}
            onOpenChange={setFormOpen}
            editItem={editItem}
            onPrev={prev ? () => setEditItem(prev) : undefined}
            onNext={next ? () => setEditItem(next) : undefined}
            navInfo={idx >= 0 ? { current: idx + 1, total: filtered.length } : undefined}
          />
        );
      })()}
    </div>
  );
}
