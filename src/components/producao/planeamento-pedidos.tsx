"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { cn, formatShortDateTime, computePrioridadeEfetiva } from "@/lib/utils";
import { ZONA_LABEL, ESTADO_PEDIDO_LABEL, ESTADO_PEDIDO_COR, ESTADO_OP_LABEL, ESTADO_OP_COR, PRIORIDADE_OP_COR, PRIORIDADE_OP_LABEL } from "@/lib/constants";
import type { PedidoProducao, OrdemProducao, ZonaProducao, ZonaId, PrioridadeOP } from "@/lib/types";
import { ImportOpsDialog } from "./import-ops-dialog";

interface Props {
  pedidos: PedidoProducao[];
  ops: OrdemProducao[];
  zonas: ZonaProducao[];
}

export function PedidosTab({ pedidos, ops, zonas }: Props) {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("");
  const [editItem, setEditItem] = useState<PedidoProducao | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const comerciaisExistentes = useMemo(() => {
    const s = new Set<string>();
    for (const p of pedidos) if (p.comercial) s.add(p.comercial.trim());
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt"));
  }, [pedidos]);
  const [importOpen, setImportOpen] = useState(false);
  const [programarTodosOpen, setProgramarTodosOpen] = useState(false);
  const [prioridade, setPrioridade] = useState<string>("");
  const [categoria, setCategoria] = useState<string>("");
  const [stockCpFiltro, setStockCpFiltro] = useState<string>("");
  // Agendamento inline
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [bulkDate, setBulkDate] = useState<string>("");

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function seleccionarVisiveis(filtered: PedidoProducao[]) {
    setSelecionados(new Set(filtered.map((p) => p.id)));
  }
  function limparSeleccao() { setSelecionados(new Set()); }

  async function saveDiaAgendado(pedido: PedidoProducao, dia: string) {
    const novaData = dia ? new Date(dia + "T12:00:00").toISOString() : null;
    const update: Record<string, unknown> = { data_agendada: novaData };
    if (novaData && pedido.estado === "pendente") update.estado = "programado";
    else if (!novaData && pedido.estado === "programado") update.estado = "pendente";
    const { error } = await supabase.from("pedidos_producao").update(update).eq("id", pedido.id);
    if (error) toast.error("Erro a guardar: " + error.message);
  }

  async function aplicarBulk() {
    if (!bulkDate) { toast.error("Escolhe uma data"); return; }
    if (selecionados.size === 0) { toast.error("Selecciona pedidos primeiro"); return; }
    const ids = [...selecionados];
    const alvos = pedidos.filter((p) => ids.includes(p.id));
    const novaData = new Date(bulkDate + "T12:00:00").toISOString();
    let count = 0;
    for (const p of alvos) {
      const update: Record<string, unknown> = { data_agendada: novaData };
      if (p.estado === "pendente") update.estado = "programado";
      const { error } = await supabase.from("pedidos_producao").update(update).eq("id", p.id);
      if (!error) count++;
    }
    toast.success(`${count} pedido${count === 1 ? "" : "s"} agendado${count === 1 ? "" : "s"} para ${new Date(bulkDate).toLocaleDateString("pt-PT")}`);
  }
  async function limparBulk() {
    if (selecionados.size === 0) { toast.error("Selecciona pedidos primeiro"); return; }
    const ids = [...selecionados];
    const alvos = pedidos.filter((p) => ids.includes(p.id));
    let count = 0;
    for (const p of alvos) {
      const update: Record<string, unknown> = { data_agendada: null };
      if (p.estado === "programado") update.estado = "pendente";
      const { error } = await supabase.from("pedidos_producao").update(update).eq("id", p.id);
      if (!error) count++;
    }
    toast.success(`${count} pedido${count === 1 ? "" : "s"} desagendado${count === 1 ? "" : "s"}`);
  }

  // Prioridade efetiva em cascata por pedido (mesmo nº PP → prioridade desce por linha)
  const prioridadeEfetiva = useMemo(() => computePrioridadeEfetiva(pedidos), [pedidos]);

  // Agregar OPs por pedido_id para mostrar progresso real
  const opsPorPedido = useMemo(() => {
    const map = new Map<string, OrdemProducao[]>();
    for (const o of ops) {
      if (!o.pedido_id) continue;
      const arr = map.get(o.pedido_id) ?? [];
      arr.push(o);
      map.set(o.pedido_id, arr);
    }
    return map;
  }, [ops]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pedidos
      .filter((p) => {
        if (estado && p.estado !== estado) return false;
        if (prioridade) {
          const pe = prioridadeEfetiva.get(p.id) ?? p.prioridade;
          if (pe !== prioridade) return false;
        }
        if (categoria && p.categoria !== categoria) return false;
        if (stockCpFiltro) {
          if (stockCpFiltro === "sim" && p.stock_status !== "ok") return false;
          if (stockCpFiltro === "nao" && p.stock_status !== "pendente") return false;
          if (stockCpFiltro === "indefinido" && p.stock_status) return false;
        }
        if (!q) return true;
        return (
          (p.produto_codigo ?? "").toLowerCase().includes(q) ||
          (p.produto_nome ?? "").toLowerCase().includes(q) ||
          (p.cliente ?? "").toLowerCase().includes(q) ||
          (p.numero ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Ordenar por deadline ascendente (mais antiga primeiro); sem deadline vai para o fim
        const ta = a.fim_previsto ? new Date(a.fim_previsto).getTime() : Infinity;
        const tb = b.fim_previsto ? new Date(b.fim_previsto).getTime() : Infinity;
        return ta - tb;
      });
  }, [pedidos, search, estado, prioridade, categoria, stockCpFiltro, prioridadeEfetiva]);

  function abrirEdit(p: PedidoProducao) {
    setEditItem(p);
    setFormOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar por ref, produto, cliente, lote..."
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        >
          <option value="">Todos os estados</option>
          {Object.entries(ESTADO_PEDIDO_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        <select
          value={prioridade}
          onChange={(e) => setPrioridade(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
          title="Filtra pela prioridade efetiva (cascata)"
        >
          <option value="">Todas as prioridades</option>
          {Object.entries(PRIORIDADE_OP_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        <select
          value={stockCpFiltro}
          onChange={(e) => setStockCpFiltro(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
          title="Filtra por estado do stock CP/MP"
        >
          <option value="">Stock CP/MP: todos</option>
          <option value="sim">✓ Sim</option>
          <option value="nao">⚠ Não</option>
          <option value="indefinido">— Indefinido</option>
        </select>
        <button
          onClick={() => setImportOpen(true)}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700"
        >
          📥 Importar Excel
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Apagar todos os ${pedidos.length} pedidos? As OPs ligadas também ficam afectadas. Esta acção é irreversível.`)) return;
            // Fetch IDs primeiro — delete sem filtros específicos é bloqueado pelo Supabase client
            const { data: todos, error: fetchErr } = await supabase.from("pedidos_producao").select("id");
            if (fetchErr) { toast.error("Erro: " + fetchErr.message); return; }
            const ids = (todos ?? []).map((r) => r.id as string);
            if (ids.length === 0) { toast.info?.("Sem pedidos para apagar"); return; }
            // Apagar OPs ligadas primeiro (para não haver FK set null em 500 linhas de uma vez)
            await supabase.from("ordens_producao").delete().in("pedido_id", ids);
            const { error } = await supabase.from("pedidos_producao").delete().in("id", ids);
            if (error) toast.error("Erro a apagar: " + error.message);
            else toast.success(`${ids.length} pedidos apagados`);
          }}
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-extrabold text-red-700 shadow-sm hover:bg-red-100"
          title="Apagar todos os pedidos"
        >
          🗑 Apagar Tudo
        </button>
        <span className="ml-auto text-xs font-bold text-slate-500">{filtered.length} pedidos</span>
      </div>

      {/* Bulk actions — aparece quando há pedidos seleccionados */}
      {selecionados.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs">
          <span className="font-extrabold text-sky-800">{selecionados.size} seleccionados</span>
          <span className="text-slate-400">|</span>
          <div className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1">
            <label className="font-extrabold text-slate-500">Data:</label>
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setBulkDate(new Date().toISOString().slice(0, 10))}
            className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100"
          >Hoje</button>
          <button
            onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); setBulkDate(d.toISOString().slice(0, 10)); }}
            className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100"
          >Amanhã</button>
          <button
            onClick={() => { const d = new Date(); const day = d.getDay(); const diff = day === 0 ? 1 : (day === 1 ? 7 : 8 - day); d.setDate(d.getDate() + diff); setBulkDate(d.toISOString().slice(0, 10)); }}
            className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100"
          >Próxima 2ª</button>
          <button
            onClick={aplicarBulk}
            disabled={!bulkDate}
            className="rounded bg-sky-600 px-3 py-1 font-extrabold text-white hover:bg-sky-700 disabled:opacity-50"
          >Aplicar data</button>
          <button
            onClick={limparBulk}
            className="rounded border border-red-300 bg-red-50 px-2 py-1 font-bold text-red-700 hover:bg-red-100"
          >Limpar data</button>
          <span className="ml-auto">
            <button onClick={limparSeleccao} className="text-slate-500 hover:text-slate-700 font-bold">Limpar selecção ✕</button>
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((p) => selecionados.has(p.id))}
                    onChange={(e) => {
                      if (e.target.checked) seleccionarVisiveis(filtered);
                      else limparSeleccao();
                    }}
                    className="h-4 w-4 accent-sky-600"
                    title="Seleccionar todos os visíveis"
                  />
                </th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Nº PP</th>
                <th className="px-3 py-2 text-left">Fp</th>
                <th className="px-3 py-2 text-left">Ref</th>
                <th className="px-3 py-2 text-left">Produto</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Prioridade</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Reservas</th>
                <th className="px-3 py-2 text-right">Cons. 6m</th>
                <th className="px-3 py-2 text-right">Meses stock</th>
                <th className="px-3 py-2 text-left">Stocks CP/MP</th>
                <th className="px-3 py-2 text-right">Qtd_ped</th>
                <th className="px-3 py-2 text-right">Pend.</th>
                <th className="px-3 py-2 text-right">Pedido</th>
                <th className="px-3 py-2 text-left">Zona</th>
                <th className="px-3 py-2 text-left">Agendado</th>
                <th className="px-3 py-2 text-left">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const opsDoPedido = opsPorPedido.get(p.id) ?? [];
                const produzido = opsDoPedido.reduce((acc, o) => Math.max(acc, o.quantidade_atual || 0), 0);
                const pct = p.quantidade_alvo > 0 ? Math.min(100, Math.round((produzido / p.quantidade_alvo) * 100)) : 0;
                return (
                  <tr
                    key={p.id}
                    onClick={() => abrirEdit(p)}
                    className={cn("cursor-pointer border-b border-slate-100 hover:bg-sky-50", selecionados.has(p.id) && "bg-sky-50")}
                  >
                    <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selecionados.has(p.id)}
                        onChange={() => toggleSelecionado(p.id)}
                        className="h-4 w-4 accent-sky-600"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-extrabold", ESTADO_PEDIDO_COR[p.estado])}>
                        {ESTADO_PEDIDO_LABEL[p.estado] ?? p.estado}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono font-bold text-slate-900">{p.numero ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-600">{p.ficha_producao ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono font-bold text-slate-700">{p.produto_codigo ?? "—"}</td>
                    <td className="px-3 py-1.5 font-bold text-slate-800">{p.produto_nome}</td>
                    <td className="px-3 py-1.5 text-slate-600">{p.cliente ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[10px]">
                      {p.tipo_linha ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700 capitalize">
                          {p.tipo_linha === "termoformadora" ? "Termo" : p.tipo_linha}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {(() => {
                        const pe = prioridadeEfetiva.get(p.id) ?? p.prioridade;
                        const ajustada = pe !== p.prioridade;
                        return (
                          <span
                            className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold", PRIORIDADE_OP_COR[pe])}
                            title={ajustada ? `Original: ${PRIORIDADE_OP_LABEL[p.prioridade]} — ajustada em cascata (mesmo PP)` : undefined}
                          >
                            {PRIORIDADE_OP_LABEL[pe] ?? pe}
                            {ajustada && <span className="ml-1 opacity-60">↓</span>}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold text-slate-700">{p.stock_existente ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{p.reservas_existentes ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{p.consumos_6m ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-[11px]">
                      {(() => {
                        const cons = p.consumos_6m ?? 0;
                        const disp = (p.stock_existente ?? 0) - (p.reservas_existentes ?? 0);
                        if (cons <= 0) return <span className="text-slate-400">—</span>;
                        const meses = Math.max(0, (disp * 6) / cons);
                        const cls = meses < 0.5 ? "font-extrabold text-red-700"
                                  : meses < 1 ? "font-extrabold text-orange-700"
                                  : meses < 2 ? "font-bold text-amber-700"
                                  : meses < 6 ? "font-bold text-slate-700"
                                  : "font-bold text-emerald-700";
                        return <span className={cls}>{Math.round(meses)}</span>;
                      })()}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.stock_status === "ok" ? (
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700">Sim</span>
                      ) : p.stock_status === "pendente" ? (
                        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">Não</span>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{p.qtd_total_pp ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">{p.qtd_pendente_pp ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-slate-900">
                      {produzido}/{p.quantidade_alvo}
                      {p.quantidade_alvo > 0 && (
                        <div className="mt-0.5 h-1 w-16 overflow-hidden rounded-full bg-slate-200 ml-auto">
                          <div
                            className={cn("h-full", pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-sky-500" : "bg-amber-500")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-slate-500">
                      {opsDoPedido.length === 0 ? (
                        <span className="italic text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {opsDoPedido.map((o) => (
                            <span
                              key={o.id}
                              className={cn("rounded border px-1.5 py-0.5 text-[11px] font-extrabold", ESTADO_OP_COR[o.estado])}
                              title={`${ZONA_LABEL[o.zona_id] ?? o.zona_id} · ${ESTADO_OP_LABEL[o.estado]}`}
                            >
                              {ZONA_LABEL[o.zona_id] ?? o.zona_id}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] font-bold text-slate-700" title="Agendado no Planeamento Semanal" suppressHydrationWarning>
                      {p.data_agendada ? new Date(p.data_agendada).toLocaleDateString("pt-PT") : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500" suppressHydrationWarning>{p.fim_previsto ? new Date(p.fim_previsto).toLocaleDateString("pt-PT") : "—"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={20} className="px-3 py-8 text-center text-sm font-bold text-slate-400">Sem pedidos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <FormPedido
          open={formOpen}
          onClose={() => setFormOpen(false)}
          editItem={editItem}
          comerciaisExistentes={comerciaisExistentes}
        />
      )}

      {importOpen && (
        <ImportOpsDialog onClose={() => setImportOpen(false)} />
      )}

      {programarTodosOpen && (
        <ProgramarTodosDialog
          pedidos={pedidos}
          opsPorPedido={opsPorPedido}
          onClose={() => setProgramarTodosOpen(false)}
        />
      )}
    </div>
  );
}

/* ===== Dialog: Programar Tudo (bulk) ===== */
// Helpers de calendário
function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function addWorkingDay(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + 1);
  while (isWeekend(r)) r.setDate(r.getDate() + 1);
  return r;
}
function startOfToday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (isWeekend(d)) return addWorkingDay(d);
  return d;
}
// Prioridade numérica para ordenar (maior = mais prioritário)
function priorityRank(p: PrioridadeOP): number {
  const map: Record<string, number> = { urgente: 4, alta: 3, normal: 2, baixa: 1 };
  return map[p] ?? 2;
}

function ProgramarTodosDialog({ pedidos, opsPorPedido, onClose }: {
  pedidos: PedidoProducao[];
  opsPorPedido: Map<string, OrdemProducao[]>;
  onClose: () => void;
}) {
  // Pedidos elegíveis: sem OPs ainda e não concluídos/cancelados
  const elegiveis = useMemo(() =>
    pedidos.filter((p) => {
      if (p.estado === "concluido" || p.estado === "cancelado") return false;
      return (opsPorPedido.get(p.id)?.length ?? 0) === 0;
    }),
  [pedidos, opsPorPedido]);

  // Análise: motivo/avisos por pedido (sem sugerir/auto-selecionar)
  type Analise = {
    pedido: PedidoProducao;
    rota: RotaZonaId[];
    precisaProduzir: boolean;
    temComponentes: boolean;
    motivo: string;
  };
  const analises: Analise[] = useMemo(() =>
    elegiveis.map((p) => {
      const disponivel = (p.stock_existente ?? 0) - (p.reservas_existentes ?? 0);
      const precisaProduzir = disponivel < p.quantidade_alvo;
      const temComponentes = p.stock_status !== "pendente";
      let motivo = "";
      if (!precisaProduzir) motivo = `Já em stock (${disponivel} ≥ ${p.quantidade_alvo})`;
      else if (!temComponentes) motivo = "⚠ Sem stock CP/MP";
      else motivo = `Produzir ${p.quantidade_alvo - disponivel} un`;
      return { pedido: p, rota: inferRota(p), precisaProduzir, temComponentes, motivo };
    }),
  [elegiveis]);

  // Map de dia agendado por pedido (inicializado com o data_agendada actual, se já existir)
  const [diasAgendados, setDiasAgendados] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const p of elegiveis) {
      if (p.data_agendada) m.set(p.id, p.data_agendada.slice(0, 10));
    }
    return m;
  });
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [bulkDate, setBulkDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function seleccionarTodos() {
    setSelecionados(new Set(analises.map((a) => a.pedido.id)));
  }
  function limparSeleccao() {
    setSelecionados(new Set());
  }
  function setDiaIndividual(id: string, dia: string) {
    setDiasAgendados((prev) => {
      const next = new Map(prev);
      if (dia) next.set(id, dia); else next.delete(id);
      return next;
    });
  }
  function aplicarBulkAosSeleccionados() {
    if (!bulkDate) { toast.error("Escolhe uma data"); return; }
    if (selecionados.size === 0) { toast.error("Selecciona pedidos primeiro"); return; }
    setDiasAgendados((prev) => {
      const next = new Map(prev);
      for (const id of selecionados) next.set(id, bulkDate);
      return next;
    });
  }
  function limparDiaDosSeleccionados() {
    if (selecionados.size === 0) { toast.error("Selecciona pedidos primeiro"); return; }
    setDiasAgendados((prev) => {
      const next = new Map(prev);
      for (const id of selecionados) next.delete(id);
      return next;
    });
  }

  // Atalhos de data
  function atalhoHoje() {
    const d = new Date();
    setBulkDate(d.toISOString().slice(0, 10));
  }
  function atalhoAmanha() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setBulkDate(d.toISOString().slice(0, 10));
  }
  function atalhoProximaSegunda() {
    const d = new Date();
    const dia = d.getDay();
    const diasAteSegunda = dia === 0 ? 1 : (dia === 1 ? 7 : 8 - dia);
    d.setDate(d.getDate() + diasAteSegunda);
    setBulkDate(d.toISOString().slice(0, 10));
  }

  // Totais por dia (considerando todos os com data agendada)
  const totalPorDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of analises) {
      const dia = diasAgendados.get(a.pedido.id);
      if (!dia) continue;
      m.set(dia, (m.get(dia) ?? 0) + a.pedido.quantidade_alvo);
    }
    return m;
  }, [analises, diasAgendados]);

  async function handleSubmit() {
    // Grava data agendada + estado: com data → programado; sem data (se era programado) → pendente
    setSaving(true);
    const errors: string[] = [];
    let atualizados = 0;
    for (const a of analises) {
      const dia = diasAgendados.get(a.pedido.id);
      const novaData = dia ? new Date(dia + "T12:00:00").toISOString() : null;
      const dataActual = a.pedido.data_agendada ?? null;
      if (dataActual === novaData) continue;

      // Transição de estado
      const update: Record<string, unknown> = { data_agendada: novaData };
      if (novaData && a.pedido.estado === "pendente") {
        update.estado = "programado";
      } else if (!novaData && a.pedido.estado === "programado") {
        update.estado = "pendente";
      }

      const { error } = await supabase
        .from("pedidos_producao")
        .update(update)
        .eq("id", a.pedido.id);
      if (error) errors.push(`${a.pedido.numero ?? a.pedido.produto_codigo}: ${error.message}`);
      else atualizados++;
    }
    setSaving(false);
    if (errors.length > 0) {
      toast.error(`${errors.length} erro(s). Primeiro: ${errors[0]}`);
    }
    if (atualizados > 0) {
      toast.success(`${atualizados} pedido${atualizados === 1 ? "" : "s"} actualizado${atualizados === 1 ? "" : "s"}`);
    } else if (errors.length === 0) {
      toast.info?.("Sem alterações");
    }
    if (errors.length === 0) onClose();
  }

  const nSel = selecionados.size;
  const nAgendados = analises.filter((a) => diasAgendados.has(a.pedido.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-5xl max-h-[90vh] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">Programar no Gantt</h3>
            <p className="text-xs font-bold text-slate-500">
              {elegiveis.length} pedidos · {nAgendados} com dia atribuído · selecciona os pedidos e escolhe o dia
            </p>
            <p className="text-[11px] italic text-slate-400">As OPs são criadas pelos operadores nos painéis das zonas.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        {/* Bulk actions */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs">
          <button onClick={seleccionarTodos} className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100">
            Seleccionar todos
          </button>
          <button onClick={limparSeleccao} className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100">
            Limpar selecção
          </button>

          <span className="mx-2 text-slate-300">|</span>

          <div className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1">
            <label className="font-extrabold text-slate-500">Data:</label>
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none"
            />
          </div>
          <button onClick={atalhoHoje} className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100">Hoje</button>
          <button onClick={atalhoAmanha} className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100">Amanhã</button>
          <button onClick={atalhoProximaSegunda} className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100">Próxima 2ª</button>
          <button
            onClick={aplicarBulkAosSeleccionados}
            disabled={!bulkDate || nSel === 0}
            className="rounded bg-sky-600 px-2 py-1 font-extrabold text-white hover:bg-sky-700 disabled:opacity-40"
          >
            Aplicar aos {nSel} selec.
          </button>
          <button
            onClick={limparDiaDosSeleccionados}
            disabled={nSel === 0}
            className="rounded border border-red-300 bg-red-50 px-2 py-1 font-bold text-red-700 hover:bg-red-100 disabled:opacity-40"
          >
            Limpar dia
          </button>

          <span className="ml-auto font-extrabold text-slate-600">{nSel} seleccionados</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <th className="px-3 py-2 text-left">Prio</th>
                <th className="px-3 py-2 text-left">Nº PP</th>
                <th className="px-3 py-2 text-left">Ref</th>
                <th className="px-3 py-2 text-left">Produto</th>
                <th className="px-3 py-2 text-right">Qtd</th>
                <th className="px-3 py-2 text-left">Rota</th>
                <th className="px-3 py-2 text-left">Deadline</th>
                <th className="px-3 py-2 text-left">Dia agendado</th>
                <th className="px-3 py-2 text-left">Obs</th>
              </tr>
            </thead>
            <tbody>
              {analises.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-sm font-bold text-slate-400">Não há pedidos por programar</td></tr>
              )}
              {analises.map((a) => {
                const selected = selecionados.has(a.pedido.id);
                const dia = diasAgendados.get(a.pedido.id) ?? "";
                const totalDoDia = dia ? (totalPorDia.get(dia) ?? 0) : 0;
                const atraso = dia && a.pedido.fim_previsto
                  ? new Date(dia) > new Date(a.pedido.fim_previsto)
                  : false;
                return (
                  <tr
                    key={a.pedido.id}
                    className={cn("border-b border-slate-100 hover:bg-slate-50", selected && "bg-emerald-50")}
                  >
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggle(a.pedido.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-[10px]">
                      <span className={cn("rounded border px-1.5 py-0.5 font-extrabold", PRIORIDADE_OP_COR[a.pedido.prioridade])}>
                        {PRIORIDADE_OP_LABEL[a.pedido.prioridade] ?? a.pedido.prioridade}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono font-bold text-slate-900">{a.pedido.numero ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono font-bold text-slate-700">{a.pedido.produto_codigo ?? "—"}</td>
                    <td className="px-3 py-1.5 font-bold text-slate-800 truncate max-w-sm">{a.pedido.produto_nome}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-slate-900">{a.pedido.quantidade_alvo}</td>
                    <td className="px-3 py-1.5">
                      {a.rota.length === 0 ? (
                        <span className="text-[10px] italic text-red-600">sem rota</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {a.rota.map((z, i) => (
                            <span key={i} className="rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-700">{ZONA_LABEL[z] ?? z}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-slate-500" suppressHydrationWarning>
                      {a.pedido.fim_previsto ? new Date(a.pedido.fim_previsto).toLocaleDateString("pt-PT") : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={dia}
                          onChange={(e) => setDiaIndividual(a.pedido.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold", atraso ? "border-red-300 bg-red-50 text-red-800" : "border-slate-300 bg-white text-slate-800")}
                        />
                        {atraso && <span title="Depois da deadline" className="text-[10px] text-red-600">⚠</span>}
                        {dia && totalDoDia > 0 && (
                          <span className="text-[10px] font-bold text-slate-400">({totalDoDia} un)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-slate-600">{a.motivo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? "A guardar…" : `Guardar (${nAgendados} agendado${nAgendados === 1 ? "" : "s"})`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== Dialog: Programar Pedido individual (não usado na UI actual, mantido para futuro) ===== */
type RotaZonaId = ZonaId | "eo" | "";

interface RotaItem {
  id: string;
  zona_id: RotaZonaId;
  quantidade_alvo: number;
  inicio_previsto: string; // datetime-local
  fim_previsto: string;
  notas: string;
}

// Detecta se o produto é NE (não estéril) com base no código/nome
function isNE(pedido: PedidoProducao): boolean {
  return /\bNE\b/i.test(pedido.produto_codigo ?? "") || /\bNE\b/i.test(pedido.produto_nome ?? "");
}

// Infere a rota (sequência de zonas) com base em tipo + categoria + NE
function inferRota(pedido: PedidoProducao): RotaZonaId[] {
  const isCampo = pedido.categoria === "campo";
  const isPackTrouxa = pedido.categoria === "pack" || pedido.categoria === "trouxa";
  const tipo = pedido.tipo_linha;

  if (isCampo) {
    if (isNE(pedido)) return ["sl1_campos"];
    return ["sl2_termo", "sl2_embalamento", "eo"];
  }
  if (isPackTrouxa) {
    const first: ZonaId = tipo === "termoformadora" ? "sl2_termo" : "sl2_picking";
    return [first, "sl2_embalamento", "eo"];
  }
  return [];
}

function ProgramarPedidoDialog({ pedido, zonas, opsExistentes, onClose }: {
  pedido: PedidoProducao;
  zonas: ZonaProducao[];
  opsExistentes: OrdemProducao[];
  onClose: () => void;
}) {
  // Lote é definido aqui — partilhado por todas as OPs criadas para este pedido nesta sessão
  const [lote, setLote] = useState<string>("");
  const [rotas, setRotas] = useState<RotaItem[]>(() => {
    const inferida = inferRota(pedido);
    if (inferida.length === 0) {
      return [{
        id: crypto.randomUUID(),
        zona_id: "",
        quantidade_alvo: pedido.quantidade_alvo,
        inicio_previsto: pedido.inicio_previsto?.slice(0, 16) ?? "",
        fim_previsto: pedido.fim_previsto?.slice(0, 16) ?? "",
        notas: "",
      }];
    }
    return inferida.map((z, i) => ({
      id: crypto.randomUUID(),
      zona_id: z,
      quantidade_alvo: pedido.quantidade_alvo,
      inicio_previsto: i === 0 ? (pedido.inicio_previsto?.slice(0, 16) ?? "") : "",
      fim_previsto: i === inferida.length - 1 ? (pedido.fim_previsto?.slice(0, 16) ?? "") : "",
      notas: "",
    }));
  });
  const [saving, setSaving] = useState(false);

  function update(id: string, patch: Partial<RotaItem>) {
    setRotas((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }
  function add() {
    const ultima = rotas[rotas.length - 1];
    setRotas((prev) => [...prev, {
      id: crypto.randomUUID(),
      zona_id: "",
      quantidade_alvo: ultima?.quantidade_alvo ?? pedido.quantidade_alvo,
      inicio_previsto: ultima?.fim_previsto ?? "",
      fim_previsto: "",
      notas: "",
    }]);
  }
  function remove(id: string) {
    setRotas((prev) => prev.filter((r) => r.id !== id));
  }

  // Sugestões rápidas de fluxo
  function aplicarSugestao(zs: RotaZonaId[]) {
    setRotas(zs.map((z, i) => ({
      id: crypto.randomUUID(),
      zona_id: z,
      quantidade_alvo: pedido.quantidade_alvo,
      inicio_previsto: i === 0 ? (pedido.inicio_previsto?.slice(0, 16) ?? "") : "",
      fim_previsto: i === zs.length - 1 ? (pedido.fim_previsto?.slice(0, 16) ?? "") : "",
      notas: "",
    })));
  }

  async function handleSubmit() {
    const validas = rotas.filter((r) => r.zona_id && r.quantidade_alvo > 0);
    if (validas.length === 0) {
      toast.error("Adiciona pelo menos uma zona com quantidade");
      return;
    }
    setSaving(true);
    const payload = validas.map((r, idx) => ({
      pedido_id: pedido.id,
      // Nº OP é preenchido manualmente mais tarde — não herda do pedido (PP)
      numero: null,
      zona_id: r.zona_id,
      produto_id: pedido.produto_id,
      produto_codigo: pedido.produto_codigo,
      produto_nome: pedido.produto_nome,
      lote: lote || null,
      cliente: pedido.cliente,
      categoria: pedido.categoria,
      tipo_linha: pedido.tipo_linha,
      quantidade_alvo: r.quantidade_alvo,
      quantidade_atual: 0,
      estado: "planeada",
      prioridade: pedido.prioridade,
      inicio_previsto: r.inicio_previsto ? new Date(r.inicio_previsto).toISOString() : null,
      fim_previsto: r.fim_previsto ? new Date(r.fim_previsto).toISOString() : null,
      notas: r.notas || null,
      ordem_fila: opsExistentes.length + idx + 1,
    }));
    const { error } = await supabase.from("ordens_producao").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro a criar OPs: " + error.message);
      return;
    }
    toast.success(`${validas.length} OP${validas.length > 1 ? "s" : ""} criada${validas.length > 1 ? "s" : ""} para o pedido`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col"
      >
        <div className="border-b border-slate-200 px-5 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900">Programar Pedido</h3>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">✕</button>
          </div>
          <div className="mt-1 text-sm text-slate-600">
            <span className="font-bold text-slate-900">{pedido.produto_nome}</span>
            {pedido.produto_codigo && <span className="ml-2 font-mono text-xs text-slate-500">[{pedido.produto_codigo}]</span>}
            <span className="ml-2 text-xs font-bold text-slate-700">· {pedido.quantidade_alvo} un</span>
            {pedido.quantidade_por_caixa && (
              <span className="ml-2 text-xs text-slate-500">
                · {pedido.quantidade_por_caixa} un/cx
                · ~{Math.ceil(pedido.quantidade_alvo / pedido.quantidade_por_caixa)} caixas
              </span>
            )}
            {pedido.tipo_linha && <span className="ml-2 text-xs font-bold text-slate-700 capitalize">· {pedido.tipo_linha === "termoformadora" ? "Termo" : pedido.tipo_linha}</span>}
          </div>
          {opsExistentes.length > 0 && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
              ⚠ Este pedido já tem {opsExistentes.length} OP{opsExistentes.length > 1 ? "s" : ""} ({opsExistentes.map((o) => ZONA_LABEL[o.zona_id] ?? o.zona_id).join(", ")}). Vais adicionar mais.
            </div>
          )}
          {/* Lote definido aqui — partilhado por todas as OPs criadas */}
          <div className="mt-2 flex items-center gap-2">
            <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Lote</label>
            <input
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="ex: L-2026-001"
              className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold"
            />
          </div>
        </div>

        {/* Sugestões — alternativas comuns conforme tipo/categoria */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs">
          <span className="font-extrabold text-slate-500">Rota:</span>
          <button onClick={() => aplicarSugestao(["sl2_termo", "sl2_embalamento", "eo"])} className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100">
            Termo + Embalam. + EO
          </button>
          <button onClick={() => aplicarSugestao(["sl2_picking", "sl2_manual", "sl2_embalamento", "eo"])} className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100">
            Picking + Manual + Embal. + EO
          </button>
          <button onClick={() => aplicarSugestao(["sl1_campos"])} className="rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100">
            SL1 Campos (NE)
          </button>
          {isNE(pedido) && (
            <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800" title="Detectado &quot;NE&quot; no produto">
              ⚠ Produto NE
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-2">
            {rotas.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[24px_1fr_90px_1fr_1fr_24px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <span className="text-center text-xs font-black text-slate-400">{i + 1}</span>
                <select
                  value={r.zona_id}
                  onChange={(e) => update(r.id, { zona_id: e.target.value as ZonaId })}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold"
                >
                  <option value="">— escolher zona —</option>
                  {zonas.map((z) => <option key={z.id} value={z.id}>{ZONA_LABEL[z.id] ?? z.nome}</option>)}
                </select>
                <input
                  type="number"
                  min={0}
                  value={r.quantidade_alvo}
                  onChange={(e) => update(r.id, { quantidade_alvo: Number(e.target.value) })}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-right"
                  title="Quantidade alvo"
                />
                <input
                  type="datetime-local"
                  value={r.inicio_previsto}
                  onChange={(e) => update(r.id, { inicio_previsto: e.target.value })}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold"
                  title="Início previsto"
                />
                <input
                  type="datetime-local"
                  value={r.fim_previsto}
                  onChange={(e) => update(r.id, { fim_previsto: e.target.value })}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold"
                  title="Fim previsto"
                />
                <button
                  onClick={() => remove(r.id)}
                  disabled={rotas.length === 1}
                  className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-30"
                  title="Remover"
                >✕</button>
              </div>
            ))}
          </div>

          <button
            onClick={add}
            className="mt-3 w-full rounded-lg border-2 border-dashed border-slate-300 bg-white py-2 text-sm font-extrabold text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
          >
            + Adicionar zona
          </button>

          <div className="mt-3 grid grid-cols-[24px_1fr_90px_1fr_1fr_24px] gap-2 px-2 text-[9px] font-extrabold uppercase tracking-wide text-slate-400">
            <span></span>
            <span>Zona</span>
            <span className="text-right">Qtd</span>
            <span>Início previsto</span>
            <span>Fim previsto</span>
            <span></span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "A criar…" : `Criar ${rotas.filter((r) => r.zona_id && r.quantidade_alvo > 0).length} OP${rotas.filter((r) => r.zona_id && r.quantidade_alvo > 0).length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FormPedido({ open, onClose, editItem, readOnly = false, comerciaisExistentes = [] }: { open: boolean; onClose: () => void; editItem: PedidoProducao | null; readOnly?: boolean; comerciaisExistentes?: string[] }) {
  const [numero, setNumero] = useState(editItem?.numero ?? "");
  const [produtoCodigo, setProdutoCodigo] = useState(editItem?.produto_codigo ?? "");
  const [produtoNome, setProdutoNome] = useState(editItem?.produto_nome ?? "");
  const [cliente, setCliente] = useState(editItem?.cliente ?? "");
  const [comercial, setComercial] = useState(editItem?.comercial ?? "");
  const [categoria, setCategoria] = useState(editItem?.categoria ?? "");
  const [tipoLinha, setTipoLinha] = useState<"manual" | "termoformadora" | "stock" | "campos" | "">((editItem?.tipo_linha as "manual" | "termoformadora" | "stock" | "campos" | null) ?? "");
  const [fichaProducao, setFichaProducao] = useState(editItem?.ficha_producao ?? "");
  const [quantidadeAlvo, setQuantidadeAlvo] = useState(editItem?.quantidade_alvo ?? 0);
  const [quantidadePorCaixa, setQuantidadePorCaixa] = useState<number | "">(editItem?.quantidade_por_caixa ?? "");
  const [stockStatus, setStockStatus] = useState<"ok" | "pendente" | "">(editItem?.stock_status ?? "");
  // Dados do Excel — não editáveis
  const stockExistente = editItem?.stock_existente ?? "";
  const reservasExistentes = editItem?.reservas_existentes ?? "";
  const consumos6m = editItem?.consumos_6m ?? "";
  const [prioridade, setPrioridade] = useState(editItem?.prioridade ?? "por_definir");
  // Se o pedido já foi programado (data_agendada), mostra esse dia como Início previsto.
  const [inicioPrevisto, setInicioPrevisto] = useState(
    (editItem?.data_agendada ?? editItem?.inicio_previsto)?.slice(0, 16) ?? ""
  );
  // Início e fim agendados (dia inteiro) — usados para esticar o card no Planeamento Semanal
  const [inicioAgendado, setInicioAgendado] = useState(editItem?.data_agendada?.slice(0, 10) ?? "");
  const [fimAgendado, setFimAgendado] = useState(editItem?.data_fim_agendada?.slice(0, 10) ?? "");
  const [deadline, setDeadline] = useState(editItem?.fim_previsto?.slice(0, 16) ?? "");
  const [estado, setEstado] = useState(editItem?.estado ?? "pendente");
  const [notas, setNotas] = useState(editItem?.notas ?? "");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function handleSave() {
    if (!produtoNome.trim()) { toast.error("Produto é obrigatório"); return; }
    setSaving(true);
    const payload = {
      numero: numero || null,
      produto_codigo: produtoCodigo || null,
      produto_nome: produtoNome,
      cliente: cliente || null,
      comercial: comercial || null,
      categoria: categoria || null,
      tipo_linha: tipoLinha || null,
      ficha_producao: fichaProducao || null,
      quantidade_alvo: Number(quantidadeAlvo) || 0,
      quantidade_por_caixa: quantidadePorCaixa === "" ? null : Number(quantidadePorCaixa),
      stock_status: stockStatus || null,
      stock_existente: stockExistente === "" ? null : Number(stockExistente),
      reservas_existentes: reservasExistentes === "" ? null : Number(reservasExistentes),
      consumos_6m: consumos6m === "" ? null : Number(consumos6m),
      prioridade,
      inicio_previsto: inicioPrevisto ? new Date(inicioPrevisto).toISOString() : null,
      fim_previsto: deadline ? new Date(deadline).toISOString() : null,
      data_agendada: inicioAgendado ? new Date(`${inicioAgendado}T11:00:00`).toISOString() : null,
      data_fim_agendada: fimAgendado ? new Date(`${fimAgendado}T11:00:00`).toISOString() : null,
      estado,
      notas: notas || null,
    };
    if (editItem) {
      const { error } = await supabase.from("pedidos_producao").update(payload).eq("id", editItem.id);
      if (error) toast.error("Erro a guardar: " + error.message);
      else toast.success("Pedido actualizado");
    } else {
      const { error } = await supabase.from("pedidos_producao").insert(payload);
      if (error) toast.error("Erro a criar: " + error.message);
      else toast.success("Pedido criado");
    }
    setSaving(false);
    if (!editItem || (editItem)) onClose();
  }

  async function handleSaveAgendamento() {
    if (!editItem) return;
    setSaving(true);
    const update: Record<string, unknown> = {
      data_agendada: inicioAgendado ? new Date(`${inicioAgendado}T11:00:00`).toISOString() : null,
      data_fim_agendada: fimAgendado ? new Date(`${fimAgendado}T11:00:00`).toISOString() : null,
    };
    // Se ainda está pendente e o operador agendou, passa a programado
    if (inicioAgendado && editItem.estado === "pendente") update.estado = "programado";
    const { error } = await supabase.from("pedidos_producao").update(update).eq("id", editItem.id);
    setSaving(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Agendamento actualizado");
    onClose();
  }

  async function handleDelete() {
    if (!editItem) return;
    if (!confirm(`Apagar pedido "${editItem.produto_nome}"? As OPs ligadas ficarão sem pedido.`)) return;
    const { error } = await supabase.from("pedidos_producao").delete().eq("id", editItem.id);
    if (error) toast.error("Erro a apagar: " + error.message);
    else { toast.success("Pedido apagado"); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-6xl max-h-[96vh] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h3 className="text-base font-black text-slate-900">{readOnly ? "Detalhes do Pedido" : editItem ? "Editar Pedido" : "Novo Pedido"}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <fieldset disabled={readOnly} className={cn("grid grid-cols-4 gap-x-3 gap-y-2 p-3", readOnly && "[&_input]:bg-slate-50 [&_select]:bg-slate-50 [&_textarea]:bg-slate-50")}>
          <Field label="Nº Pedido (PP)">
            <input value={numero} onChange={(e) => setNumero(e.target.value)} className="input" placeholder="ex: 250619" />
          </Field>
          <Field label="Ficha de Produção">
            <input value={fichaProducao} onChange={(e) => setFichaProducao(e.target.value)} className="input" placeholder="ex: 260017" />
          </Field>
          <Field label="Ref">
            <input value={produtoCodigo} onChange={(e) => setProdutoCodigo(e.target.value)} className="input" placeholder="ex: 10625005" />
          </Field>
          <Field label="Categoria">
            <select value={categoria ?? ""} onChange={(e) => setCategoria(e.target.value as typeof categoria)} className="input">
              <option value="">—</option>
              <option value="campo">Campo Cirúrgico</option>
              <option value="trouxa">Trouxa</option>
              <option value="pack">Pack</option>
              <option value="outros">Outros</option>
            </select>
          </Field>
          <Field label="Produto *" colSpan={4}>
            <input value={produtoNome} onChange={(e) => setProdutoNome(e.target.value)} className="input" required />
          </Field>
          <Field label="Cliente" colSpan={2}>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} className="input" disabled={readOnly} />
          </Field>
          <Field label="Comercial" colSpan={2}>
            <>
              <input
                value={comercial}
                onChange={(e) => setComercial(e.target.value)}
                className="input"
                disabled={readOnly}
                placeholder="ex: nome do comercial"
                list="comerciais-datalist"
                autoComplete="off"
              />
              <datalist id="comerciais-datalist">
                {comerciaisExistentes.map((c) => <option key={c} value={c} />)}
              </datalist>
            </>
          </Field>
          <Field label="Tipo">
            <select value={tipoLinha} onChange={(e) => setTipoLinha(e.target.value as typeof tipoLinha)} className="input">
              <option value="">—</option>
              <option value="manual">Manual</option>
              <option value="termoformadora">Termoformadora</option>
              <option value="campos">Máq. Campos</option>
              <option value="laminados">Laminados</option>
              <option value="mascaras">Máscaras</option>
              <option value="toucas">Toucas</option>
              <option value="outros">Outros</option>
              <option value="stock">Stock</option>
            </select>
          </Field>
          <Field label="Quantidade alvo">
            <input type="number" min={0} value={quantidadeAlvo} onChange={(e) => setQuantidadeAlvo(Number(e.target.value))} className="input" />
          </Field>
          <Field label="Qtd / caixa">
            <input
              type="number"
              min={0}
              value={quantidadePorCaixa}
              onChange={(e) => setQuantidadePorCaixa(e.target.value === "" ? "" : Number(e.target.value))}
              className="input"
              placeholder="—"
            />
          </Field>
          <Field label="Prioridade">
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as typeof prioridade)} className="input">
              <option value="por_definir">Por definir</option>
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </Field>
          <Field label="Stock CP/MP">
            <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value as typeof stockStatus)} className="input">
              <option value="">— (não definido)</option>
              <option value="ok">✓ Stock OK</option>
              <option value="pendente">⚠ Stock Pendente</option>
            </select>
          </Field>
          <Field label="Stock existente (Excel)">
            <input
              type="number"
              value={stockExistente}
              readOnly
              disabled
              className="input bg-slate-100 text-slate-700"
              placeholder="—"
            />
          </Field>
          <Field label="Reservas (Excel)">
            <input
              type="number"
              value={reservasExistentes}
              readOnly
              disabled
              className="input bg-slate-100 text-slate-700"
              placeholder="—"
            />
          </Field>
          <Field label="Consumos 6m (Excel)">
            <input
              type="number"
              value={consumos6m}
              readOnly
              disabled
              className="input bg-slate-100 text-slate-700"
              placeholder="—"
            />
          </Field>
          <Field label="Meses de stock (calculado)">
            {(() => {
              const cons = consumos6m === "" ? 0 : Number(consumos6m);
              const stk = stockExistente === "" ? 0 : Number(stockExistente);
              const res = reservasExistentes === "" ? 0 : Number(reservasExistentes);
              const disp = stk - res;
              if (cons <= 0) {
                return <input value="—" disabled className="input bg-slate-50 text-slate-400" />;
              }
              const meses = (disp * 6) / cons;
              const cls = meses < 0.5 ? "text-red-700 font-extrabold bg-red-50 border-red-200"
                : meses < 1 ? "text-orange-700 font-extrabold bg-orange-50 border-orange-200"
                : meses < 2 ? "text-amber-700 font-bold bg-amber-50 border-amber-200"
                : meses < 6 ? "text-slate-700 font-bold bg-slate-50"
                : "text-emerald-700 font-bold bg-emerald-50 border-emerald-200";
              return (
                <input
                  value={`${Math.round(meses * 10) / 10} meses · disp. ${disp}`}
                  disabled
                  className={cn("input", cls)}
                />
              );
            })()}
          </Field>
          <Field label="Estado">
            <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className="input">
              {Object.entries(ESTADO_PEDIDO_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
          </Field>
          <Field label="Início previsto">
            <input type="datetime-local" value={inicioPrevisto} onChange={(e) => setInicioPrevisto(e.target.value)} className="input" disabled={readOnly} />
          </Field>
          <Field label="Deadline (cliente)">
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input" disabled={readOnly} />
          </Field>
          <Field label="Notas" colSpan={4}>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="input min-h-[38px]" rows={2} />
          </Field>
        </fieldset>

        {/* Secção Agendamento — sempre editável (mesmo em modo readOnly) */}
        <div className={cn("grid grid-cols-4 items-end gap-x-3 gap-y-1 border-t border-slate-200 bg-sky-50/40 px-3 py-2")}>
          <div className="col-span-4 -mb-1 text-[11px] font-extrabold uppercase tracking-wider text-sky-700">
            📅 Agendamento (Planeamento Semanal)
          </div>
          <Field label="Início agendado">
            <input
              type="date"
              value={inicioAgendado}
              onChange={(e) => {
                setInicioAgendado(e.target.value);
                if (fimAgendado && e.target.value && fimAgendado < e.target.value) setFimAgendado(e.target.value);
              }}
              className="input"
            />
          </Field>
          <Field label="Fim agendado">
            <input
              type="date"
              value={fimAgendado}
              min={inicioAgendado || undefined}
              onChange={(e) => setFimAgendado(e.target.value)}
              className="input"
            />
          </Field>
          <p className="col-span-2 text-[10px] font-bold text-slate-500">
            Fim em branco = 1 dia. Qtd dividida igualmente pelos dias.
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2">
          {editItem && !readOnly ? (
            <button onClick={handleDelete} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-100">Apagar</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50">{readOnly ? "Fechar" : "Cancelar"}</button>
            {readOnly && editItem && (
              <button
                onClick={handleSaveAgendamento}
                disabled={saving}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                title="Guarda apenas o agendamento (início e fim no planeamento)"
              >
                {saving ? "A guardar…" : "Guardar agendamento"}
              </button>
            )}
            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "A guardar…" : "Guardar"}
              </button>
            )}
          </div>
        </div>
      </div>
      <style jsx>{`
        .input { width: 100%; border-radius: 0.5rem; border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; font-size: 0.875rem; font-weight: 600; color: #0f172a; background: #fff; }
        .input:focus { outline: 2px solid #10b981; outline-offset: -1px; }
      `}</style>
    </div>
  );
}

function Field({ label, children, colSpan = 1 }: { label: string; children: React.ReactNode; colSpan?: 1 | 2 | 3 | 4 }) {
  const span = colSpan === 4 ? "col-span-4" : colSpan === 3 ? "col-span-3" : colSpan === 2 ? "col-span-2" : "";
  return (
    <div className={span}>
      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
