"use client";

import { useMemo, useCallback, useState } from "react";
import { ZONA_LABEL, ESTADO_OP_LABEL, ESTADO_OP_COR, PRIORIDADE_OP_COR, ZONAS_ORDEM } from "@/lib/constants";
import { cn, formatShortDateTime } from "@/lib/utils";
import { FormOP } from "./form-op";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { notifyMutation } from "@/hooks/use-realtime-table";
import type { OrdemProducao, PedidoProducao, ZonaProducao } from "@/lib/types";

type EditableField =
  | "numero"
  | "lote"
  | "produto_codigo"
  | "produto_nome"
  | "cliente"
  | "quantidade_alvo"
  | "estado"
  | "prioridade"
  | "zona_id"
  | "inicio_previsto"
  | "fim_previsto";

export function OPsTab({ ops, pedidos, zonas, setOps }: { ops: OrdemProducao[]; pedidos: PedidoProducao[]; zonas: ZonaProducao[]; setOps?: React.Dispatch<React.SetStateAction<OrdemProducao[]>> }) {
  const patchOp = (id: string, patch: Partial<OrdemProducao>) =>
    setOps?.((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("");
  const [zonaFiltro, setZonaFiltro] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<OrdemProducao | null>(null);
  const [detalhesMode, setDetalhesMode] = useState(false);

  const pedidoPorId = useMemo(() => {
    const m = new Map<string, PedidoProducao>();
    for (const p of pedidos) m.set(p.id, p);
    return m;
  }, [pedidos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ops
      .filter((o) => {
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
      })
      // Stable sort: by created_at ASC so editing doesn't shuffle rows
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [ops, search, estado, zonaFiltro, pedidoPorId]);

  function abrirEdit(op: OrdemProducao) {
    setEditItem(op);
    setFormOpen(true);
  }

  async function salvarCampo(op: OrdemProducao, campo: EditableField, novoValor: string) {
    const atual = (op as unknown as Record<string, unknown>)[campo];
    let valor: string | number | null = novoValor.trim() === "" ? null : novoValor;

    if (campo === "quantidade_alvo") {
      valor = Number(novoValor) || 0;
      if (valor === atual) return;
    } else if (campo === "inicio_previsto" || campo === "fim_previsto") {
      valor = novoValor ? new Date(novoValor).toISOString() : null;
      const atualIso = atual ? new Date(atual as string).toISOString() : null;
      if (valor === atualIso) return;
    } else {
      if ((valor ?? "") === ((atual as string | null) ?? "")) return;
    }

    // Optimistic local patch — UI atualiza sem esperar pelo DB
    patchOp(op.id, { [campo]: valor } as Partial<OrdemProducao>);
    const { error } = await supabase
      .from("ordens_producao")
      .update({ [campo]: valor })
      .eq("id", op.id);
    if (error) {
      toast.error("Erro ao guardar");
      return;
    }
    notifyMutation("ordens_producao");
    toast.success("Guardado");
  }

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent<HTMLTableElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    const cell = target.closest("td");
    const row = target.closest("tr");
    if (!cell || !row) return;
    const cellIdx = Array.from(row.cells).indexOf(cell as HTMLTableCellElement);
    const tbody = row.closest("tbody");
    if (!tbody) return;
    const rows = Array.from(tbody.rows);
    const rowIdx = rows.indexOf(row as HTMLTableRowElement);
    const targetRowIdx = e.key === "ArrowUp" ? rowIdx - 1 : rowIdx + 1;
    if (targetRowIdx < 0 || targetRowIdx >= rows.length) return;
    e.preventDefault();
    const targetCell = rows[targetRowIdx].cells[cellIdx];
    if (!targetCell) return;
    const input = targetCell.querySelector<HTMLElement>("input, select");
    input?.focus();
    if (input instanceof HTMLInputElement) input.select();
  }, []);

  function toDatetimeLocal(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
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
        <button
          onClick={() => setDetalhesMode((v) => !v)}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-extrabold shadow-sm",
            detalhesMode
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "bg-sky-600 text-white hover:bg-sky-700"
          )}
        >
          {detalhesMode ? "← Vista Resumo" : "OP Detalhes"}
        </button>
        <span className="ml-auto text-xs font-bold text-slate-500">{filtered.length} OPs</span>
      </div>

      {detalhesMode ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="max-h-[75vh] overflow-auto">
            <table className="w-full text-xs" onKeyDown={handleTableKeyDown}>
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-right">#</th>
                  <th className="px-2 py-2 text-left">Nº OP</th>
                  <th className="px-2 py-2 text-left">Lote</th>
                  <th className="px-2 py-2 text-left">Nº PP</th>
                  <th className="px-2 py-2 text-left">Ref</th>
                  <th className="px-2 py-2 text-left">Produto</th>
                  <th className="px-2 py-2 text-left">Cliente</th>
                  <th className="px-2 py-2 text-left">Zona</th>
                  <th className="px-2 py-2 text-left">Estado</th>
                  <th className="px-2 py-2 text-left">Prio</th>
                  <th className="px-2 py-2 text-right">Qtd Alvo</th>
                  <th className="px-2 py-2 text-left">Início prev.</th>
                  <th className="px-2 py-2 text-left">Fim prev.</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, idx) => {
                  const ped = o.pedido_id ? pedidoPorId.get(o.pedido_id) : null;
                  return (
                    <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-2 py-1 text-right font-mono font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          defaultValue={o.numero ?? ""}
                          onBlur={(e) => salvarCampo(o, "numero", e.target.value)}
                          className="w-24 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          defaultValue={o.lote ?? ""}
                          onBlur={(e) => salvarCampo(o, "lote", e.target.value)}
                          className="w-20 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1 font-mono text-slate-600">{ped?.numero ?? <span className="italic text-slate-300">—</span>}</td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          defaultValue={o.produto_codigo ?? ""}
                          onBlur={(e) => salvarCampo(o, "produto_codigo", e.target.value)}
                          className="w-24 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          defaultValue={o.produto_nome ?? ""}
                          onBlur={(e) => salvarCampo(o, "produto_nome", e.target.value)}
                          className="w-48 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          defaultValue={o.cliente ?? ""}
                          onBlur={(e) => salvarCampo(o, "cliente", e.target.value)}
                          className="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:border-sky-500 focus:outline-none"
                          placeholder={ped?.cliente ?? ""}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <select
                          defaultValue={o.zona_id}
                          onChange={(e) => salvarCampo(o, "zona_id", e.target.value)}
                          className="rounded border border-slate-200 bg-white px-1 py-1 text-xs font-bold focus:border-sky-500 focus:outline-none"
                        >
                          {ZONAS_ORDEM.map((z) => (
                            <option key={z.id} value={z.id}>{z.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <select
                          defaultValue={o.estado}
                          onChange={(e) => salvarCampo(o, "estado", e.target.value)}
                          className="rounded border border-slate-200 bg-white px-1 py-1 text-xs font-bold focus:border-sky-500 focus:outline-none"
                        >
                          {Object.entries(ESTADO_OP_LABEL).map(([id, l]) => (
                            <option key={id} value={id}>{l}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <select
                          defaultValue={o.prioridade}
                          onChange={(e) => salvarCampo(o, "prioridade", e.target.value)}
                          className="rounded border border-slate-200 bg-white px-1 py-1 text-xs font-bold focus:border-sky-500 focus:outline-none"
                        >
                          <option value="por_definir">Por definir</option>
                          <option value="baixa">Baixa</option>
                          <option value="normal">Normal</option>
                          <option value="alta">Alta</option>
                          <option value="urgente">Urgente</option>
                        </select>
                      </td>
                      <td className="px-1 py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          defaultValue={o.quantidade_alvo ?? 0}
                          onBlur={(e) => salvarCampo(o, "quantidade_alvo", e.target.value)}
                          className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs font-bold focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="datetime-local"
                          defaultValue={toDatetimeLocal(o.inicio_previsto)}
                          onBlur={(e) => salvarCampo(o, "inicio_previsto", e.target.value)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:border-sky-500 focus:outline-none"
                          suppressHydrationWarning
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="datetime-local"
                          defaultValue={toDatetimeLocal(o.fim_previsto)}
                          onBlur={(e) => salvarCampo(o, "fim_previsto", e.target.value)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:border-sky-500 focus:outline-none"
                          suppressHydrationWarning
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          onClick={() => abrirEdit(o)}
                          className="rounded bg-slate-100 px-2 py-1 text-[10px] font-extrabold text-slate-700 hover:bg-slate-200"
                          title="Abrir edição completa"
                        >
                          ⋯
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={14} className="px-3 py-8 text-center text-sm font-bold text-slate-400">Sem OPs</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            Dica: use Tab para saltar entre campos. As alterações são guardadas automaticamente ao sair do campo.
          </div>
        </div>
      ) : (
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
      )}

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
