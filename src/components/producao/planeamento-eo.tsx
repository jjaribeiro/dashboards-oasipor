"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useRealtimeTable, notifyMutation } from "@/hooks/use-realtime-table";
import { cn } from "@/lib/utils";
import type { EquipamentoCiclo, OrdemProducao, PaleteEO, Produto, TipoCaixa } from "@/lib/types";

const ZONA_CICLO_LABEL: Record<string, string> = {
  pre_cond_1: "Pré-Cond. 1", pre_cond_2: "Pré-Cond. 2",
  esterilizador: "Esterilizador",
  arejamento_1: "Arejamento 1", arejamento_2: "Arejamento 2",
};
const ZONA_CICLO_COR: Record<string, string> = {
  pre_cond_1: "bg-amber-100 text-amber-800 border-amber-300",
  pre_cond_2: "bg-amber-100 text-amber-800 border-amber-300",
  esterilizador: "bg-red-100 text-red-800 border-red-300",
  arejamento_1: "bg-teal-100 text-teal-800 border-teal-300",
  arejamento_2: "bg-teal-100 text-teal-800 border-teal-300",
};

const CAPACIDADE: Record<TipoCaixa, number> = { termo: 25, manual: 20 };
const DIMENSOES: Record<TipoCaixa, string> = {
  termo: "558 × 378 × 314 mm",
  manual: "575 × 390 × 420 mm",
};
const NUM_PALETES = 8;

interface Props {
  ops: OrdemProducao[];
  setOps?: React.Dispatch<React.SetStateAction<OrdemProducao[]>>;
  initialPaletes: PaleteEO[];
  initialProdutos: Produto[];
}

export function PlaneamentoEOTab({ ops, setOps, initialPaletes, initialProdutos }: Props) {
  const patchOp = useCallback((id: string, patch: Partial<OrdemProducao>) => {
    setOps?.((prev) => prev.map((o) => o.id === id ? { ...o, ...patch } : o));
  }, [setOps]);
  const { items: paletes, refetch: refetchPaletes } = useRealtimeTable<PaleteEO>("paletes_eo", initialPaletes, { orderBy: "numero", ascending: true });
  const { items: produtos } = useRealtimeTable<Produto>("produtos", initialProdutos, { orderBy: "referencia", ascending: true });

  const produtoPorId = useMemo(() => {
    const m = new Map<string, Produto>();
    for (const p of produtos) m.set(p.id, p);
    return m;
  }, [produtos]);

  const produtoPorCodigo = useMemo(() => {
    const m = new Map<string, Produto>();
    for (const p of produtos) if (p.referencia) m.set(p.referencia, p);
    return m;
  }, [produtos]);

  // OPs disponíveis = concluídas no embalamento e sem palete atribuída
  // Inclui qualquer tipo_linha — tipo_caixa inferido do produto ou do tipo_linha
  const disponiveis = useMemo(() => {
    return ops
      .filter((o) => o.estado === "concluida" && o.zona_id === "sl2_embalamento" && !o.palete_eo_id)
      .map((o) => {
        const prod = (o.produto_id && produtoPorId.get(o.produto_id)) || (o.produto_codigo && produtoPorCodigo.get(o.produto_codigo)) || null;
        const tipoCaixa: TipoCaixa | null = prod?.tipo_caixa ?? (
          o.tipo_linha === "termoformadora" ? "termo"
          : o.tipo_linha === "manual" ? "manual"
          : null
        );
        const qtdCaixa = prod?.qtd_por_caixa ?? 0;
        const numCaixas = o.num_caixas ?? (qtdCaixa > 0 ? Math.ceil((o.quantidade_atual || 0) / qtdCaixa) : 0);
        return {
          op: o,
          produto: prod,
          tipoCaixa,
          qtdCaixa,
          numCaixas,
        };
      });
  }, [ops, produtoPorId, produtoPorCodigo]);

  // Mapa de OPs por palete
  const opsPorPalete = useMemo(() => {
    const m = new Map<string, { op: OrdemProducao; produto: Produto | null; numCaixas: number }[]>();
    for (const o of ops) {
      if (!o.palete_eo_id) continue;
      const prod = (o.produto_id && produtoPorId.get(o.produto_id)) || (o.produto_codigo && produtoPorCodigo.get(o.produto_codigo)) || null;
      const qtdCaixa = prod?.qtd_por_caixa ?? 0;
      const numCaixas = o.num_caixas ?? (qtdCaixa > 0 ? Math.ceil((o.quantidade_atual || 0) / qtdCaixa) : 0);
      const arr = m.get(o.palete_eo_id) ?? [];
      arr.push({ op: o, produto: prod, numCaixas });
      m.set(o.palete_eo_id, arr);
    }
    return m;
  }, [ops, produtoPorId, produtoPorCodigo]);

  // Garantir 8 paletes em estado planeamento — guard contra race condition
  const seedingRef = useRef(false);
  useEffect(() => {
    if (seedingRef.current) return;
    const emPlaneamento = paletes.filter((p) => p.estado === "planeamento");
    if (emPlaneamento.length >= NUM_PALETES) return;
    const existentesNums = new Set(emPlaneamento.map((p) => p.numero));
    const faltam: { numero: number }[] = [];
    for (let i = 1; i <= NUM_PALETES; i++) if (!existentesNums.has(i)) faltam.push({ numero: i });
    if (faltam.length === 0) return;
    seedingRef.current = true;
    supabase.from("paletes_eo").insert(faltam.map((f) => ({ numero: f.numero, estado: "planeamento" }))).then(({ error }) => {
      if (error) console.error("seed paletes", error);
      else { notifyMutation("paletes_eo"); refetchPaletes(); }
      // Liberta o guard depois de um pequeno delay para que o realtime chegue primeiro
      setTimeout(() => { seedingRef.current = false; }, 2000);
    });
  }, [paletes, refetchPaletes]);

  const paletesPlaneamento = useMemo(() => {
    const arr = paletes.filter((p) => p.estado === "planeamento").sort((a, b) => a.numero - b.numero);
    return arr.slice(0, NUM_PALETES);
  }, [paletes]);

  // Ciclos em progresso (pré-cond, esterilizador, arejamento)
  const [ciclosAtivos, setCiclosAtivos] = useState<EquipamentoCiclo[]>([]);
  useEffect(() => {
    supabase
      .from("equipamento_ciclo")
      .select("*")
      .in("estado", ["em_ciclo"])
      .order("inicio", { ascending: false })
      .then(({ data }) => { if (data) setCiclosAtivos(data as EquipamentoCiclo[]); });
    const ch = supabase.channel("ciclos-eo")
      .on("postgres_changes", { event: "*", schema: "public", table: "equipamento_ciclo" }, () => {
        supabase.from("equipamento_ciclo").select("*").in("estado", ["em_ciclo"]).order("inicio", { ascending: false })
          .then(({ data }) => { if (data) setCiclosAtivos(data as EquipamentoCiclo[]); });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const [dragOp, setDragOp] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [selectedPreCond, setSelectedPreCond] = useState<"pre_cond_1" | "pre_cond_2">("pre_cond_1");

  const [pendingAssign, setPendingAssign] = useState<{
    opId: string; paleteId: string; paleteNum: number;
    opCaixas: number; espacoLivre: number; cap: number; usadas: number;
    tipoCaixa: TipoCaixa | null;
  } | null>(null);

  const confirmAssign = useCallback(async (opId: string, paleteId: string, numCaixas: number) => {
    const palete = paletes.find((p) => p.id === paleteId);
    const opRow = ops.find((o) => o.id === opId);
    if (!palete || !opRow) return;
    const info = disponiveis.find((d) => d.op.id === opId);
    const produtoTipoCaixa = info?.tipoCaixa ?? null;

    // Guardar estado anterior para rollback em caso de erro
    const prevPaleteId = opRow.palete_eo_id;
    const prevNumCaixas = opRow.num_caixas;

    // Optimistic: update local state immediately
    patchOp(opId, { palete_eo_id: paleteId, num_caixas: numCaixas });
    toast.success(`OP movida para palete ${palete.numero} (${numCaixas}cx)`);

    const { error: eOp } = await supabase.from("ordens_producao").update({
      palete_eo_id: paleteId,
      num_caixas: numCaixas,
    }).eq("id", opId);
    if (eOp) {
      // Rollback
      patchOp(opId, { palete_eo_id: prevPaleteId, num_caixas: prevNumCaixas });
      toast.error("Erro a atribuir OP — revertido");
      return;
    }
    notifyMutation("ordens_producao");

    if (!palete.tipo_caixa && produtoTipoCaixa) {
      await supabase.from("paletes_eo").update({ tipo_caixa: produtoTipoCaixa }).eq("id", paleteId);
      notifyMutation("paletes_eo");
    }
  }, [ops, paletes, disponiveis, patchOp]);

  const assignOpToPalete = useCallback(async (opId: string, paleteId: string) => {
    const opRow = ops.find((o) => o.id === opId);
    const palete = paletes.find((p) => p.id === paleteId);
    if (!opRow || !palete) return;
    const info = disponiveis.find((d) => d.op.id === opId);
    const produtoTipoCaixa = info?.tipoCaixa ?? null;

    // Regras: 1 palete = 1 tipo
    if (palete.tipo_caixa && produtoTipoCaixa && palete.tipo_caixa !== produtoTipoCaixa) {
      toast.error(`Palete ${palete.numero} é de tipo ${palete.tipo_caixa}. Não pode misturar tipos.`);
      return;
    }

    // Calcular caixas usadas na palete
    const current = opsPorPalete.get(paleteId) ?? [];
    const usadas = current.reduce((a, c) => a + (c.numCaixas || 0), 0);
    const opCaixas = info?.numCaixas ?? 0;
    const novoTotal = usadas + opCaixas;
    const cap = produtoTipoCaixa ? CAPACIDADE[produtoTipoCaixa] : 0;

    // Se excede capacidade → abrir dialogo para o utilizador decidir
    if (produtoTipoCaixa && novoTotal > cap) {
      const espacoLivre = Math.max(0, cap - usadas);
      setPendingAssign({
        opId, paleteId,
        paleteNum: palete.numero,
        opCaixas,
        espacoLivre,
        cap,
        usadas,
        tipoCaixa: produtoTipoCaixa,
      });
      return;
    }

    // Cabe tudo: atribuição direta
    await confirmAssign(opId, paleteId, opCaixas);
  }, [ops, paletes, opsPorPalete, disponiveis, confirmAssign]);

  const removerDaPalete = useCallback(async (opId: string) => {
    const opRow = ops.find((o) => o.id === opId);
    const prevPaleteId = opRow?.palete_eo_id ?? null;
    patchOp(opId, { palete_eo_id: null });
    toast.success("Removido da palete");
    const { error } = await supabase.from("ordens_producao").update({ palete_eo_id: null }).eq("id", opId);
    if (error) {
      patchOp(opId, { palete_eo_id: prevPaleteId });
      toast.error("Erro a remover — revertido");
    } else notifyMutation("ordens_producao");
  }, [ops, patchOp]);

  const limparPalete = useCallback(async (paleteId: string) => {
    const items = opsPorPalete.get(paleteId) ?? [];
    if (items.length === 0) return;
    if (!confirm(`Remover ${items.length} OP${items.length === 1 ? "" : "s"} da palete?`)) return;
    // Guardar estado prévio para rollback
    const prev = items.map((it) => ({ id: it.op.id, palete_eo_id: it.op.palete_eo_id }));
    // Optimistic: atualizar local imediatamente
    const ids = items.map((it) => it.op.id);
    for (const id of ids) patchOp(id, { palete_eo_id: null });
    toast.success("Palete limpa");
    // Escrita em paralelo num único query
    const [{ error: eOps }, { error: eP }] = await Promise.all([
      supabase.from("ordens_producao").update({ palete_eo_id: null }).in("id", ids),
      supabase.from("paletes_eo").update({ tipo_caixa: null }).eq("id", paleteId),
    ]);
    if (eOps || eP) {
      // Rollback optimistic
      for (const p of prev) patchOp(p.id, { palete_eo_id: p.palete_eo_id });
      toast.error("Erro a limpar — revertido");
      return;
    }
    notifyMutation("ordens_producao");
    notifyMutation("paletes_eo");
  }, [opsPorPalete, patchOp]);

  const fecharCiclo = useCallback(async (preCond: "pre_cond_1" | "pre_cond_2") => {
    const paletesComConteudo = paletesPlaneamento.filter((p) => (opsPorPalete.get(p.id) ?? []).length > 0);
    if (paletesComConteudo.length === 0) { toast.error("Sem paletes preenchidas"); return; }
    if (!confirm(`Fechar ciclo com ${paletesComConteudo.length} palete${paletesComConteudo.length === 1 ? "" : "s"}? As OPs ficarão em aguarda EO.`)) return;

    // 1) Criar equipamento_ciclo no esterilizador
    const conteudoTxt = paletesComConteudo.map((p) => {
      const its = opsPorPalete.get(p.id) ?? [];
      const labels = its.map((i) => `${i.op.produto_codigo ?? ""} ${i.op.produto_nome} ×${i.numCaixas}cx`).join(", ");
      return `P${p.numero}[${p.tipo_caixa ?? "?"}]: ${labels}`;
    }).join(" | ");

    const { data: cicloData, error: eCiclo } = await supabase
      .from("equipamento_ciclo")
      .insert({
        zona_id: preCond,
        estado: "em_ciclo",
        conteudo: conteudoTxt,
        paletes: paletesComConteudo.length,
        paletes_detalhe: paletesComConteudo.map((p) => ({
          numero: p.numero,
          tipo_caixa: p.tipo_caixa,
          ops: (opsPorPalete.get(p.id) ?? []).map((i) => ({ op_id: i.op.id, produto: i.op.produto_nome, ref: i.op.produto_codigo, caixas: i.numCaixas })),
        })),
        inicio: new Date().toISOString(),
      })
      .select()
      .single();
    if (eCiclo || !cicloData) { toast.error("Erro a criar ciclo"); return; }
    notifyMutation("equipamento_ciclo");

    // 2) Marcar paletes como fechadas e ligar ao ciclo
    const idsPaletes = paletesComConteudo.map((p) => p.id);
    await supabase.from("paletes_eo").update({ estado: "em_pre_cond", ciclo_id: cicloData.id, fechada_em: new Date().toISOString() }).in("id", idsPaletes);
    notifyMutation("paletes_eo");

    // 3) O seed effect cria novas paletes de planeamento automaticamente quando este ciclo é fechado
    toast.success(`Ciclo fechado → ${ZONA_CICLO_LABEL[preCond]}`);
  }, [paletesPlaneamento, opsPorPalete]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <div>
          <h2 className="text-sm font-black text-slate-900">Planeamento EO — Ciclo atual</h2>
          <p className="text-[11px] font-bold text-slate-500">Arraste produtos para as paletes · Termo {CAPACIDADE.termo}cx · Manual {CAPACIDADE.manual}cx por palete</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <span className="rounded bg-sky-50 px-2 py-1 font-extrabold text-sky-700">Termo: {DIMENSOES.termo}</span>
          <span className="rounded bg-violet-50 px-2 py-1 font-extrabold text-violet-700">Manual: {DIMENSOES.manual}</span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
            <span className="font-extrabold text-slate-600">Pré-cond:</span>
            {(["pre_cond_1", "pre_cond_2"] as const).map((pc) => (
              <button key={pc} onClick={() => setSelectedPreCond(pc)}
                className={cn("rounded px-2 py-0.5 font-extrabold transition", selectedPreCond === pc ? "bg-amber-500 text-white" : "text-slate-500 hover:bg-slate-200")}
              >{pc === "pre_cond_1" ? "1" : "2"}</button>
            ))}
          </div>
          <button
            onClick={() => fecharCiclo(selectedPreCond)}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700"
          >🔒 Fechar → {ZONA_CICLO_LABEL[selectedPreCond]}</button>
        </div>
      </div>

      {/* Ciclos em curso */}
      {ciclosAtivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ciclosAtivos.map((c) => (
            <div key={c.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5", ZONA_CICLO_COR[c.zona_id] ?? "bg-slate-100 text-slate-700 border-slate-300")}>
              <span className="text-[10px] font-extrabold uppercase tracking-wide">{ZONA_CICLO_LABEL[c.zona_id] ?? c.zona_id}</span>
              {c.paletes !== null && <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-black">{c.paletes} paletes</span>}
              {c.inicio && (
                <span className="text-[10px] font-bold opacity-70" suppressHydrationWarning>
                  desde {new Date(c.inicio).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
        {/* Produtos disponíveis */}
        <div className="col-span-4 flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Disponíveis para EO ({disponiveis.length})</h3>
            <p className="text-[10px] font-bold text-slate-500">OPs concluídas em Embalamento (SL2 Termo/Manual)</p>
          </div>
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {disponiveis.length === 0 && (
              <li className="px-3 py-6 text-center text-xs font-bold text-slate-400">Nenhuma OP disponível</li>
            )}
            {disponiveis.map((d) => (
              <li
                key={d.op.id}
                draggable
                onDragStart={() => setDragOp(d.op.id)}
                onDragEnd={() => { setDragOp(null); setDragOver(null); }}
                className={cn(
                  "cursor-grab rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm transition hover:border-emerald-300 hover:shadow",
                  dragOp === d.op.id && "opacity-40"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[10px] font-black text-slate-600">{d.op.produto_codigo ?? "—"}</span>
                  {d.tipoCaixa && (
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold",
                      d.tipoCaixa === "termo" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"
                    )}>{d.tipoCaixa}</span>
                  )}
                </div>
                <p className="truncate text-[11px] font-extrabold text-slate-900">{d.op.produto_nome}</p>
                <div className="mt-0.5 flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span>{d.qtdCaixa > 0 ? `${d.qtdCaixa} un/cx` : <span className="text-red-500">⚠ sem cfg caixa</span>}</span>
                  <span className="font-black text-slate-800">{d.numCaixas} cx · {d.op.quantidade_atual} un</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 8 paletes */}
        <div className="col-span-8 grid min-h-0 grid-cols-4 grid-rows-2 gap-2">
          {paletesPlaneamento.map((p) => {
            const items = opsPorPalete.get(p.id) ?? [];
            const usadas = items.reduce((a, c) => a + (c.numCaixas || 0), 0);
            const cap = p.tipo_caixa ? CAPACIDADE[p.tipo_caixa] : 25;
            const pct = Math.min(100, (usadas / cap) * 100);
            const overflow = usadas > cap;
            return (
              <div
                key={p.id}
                onDragOver={(e) => { e.preventDefault(); setDragOver(p.id); }}
                onDragLeave={() => setDragOver((prev) => prev === p.id ? null : prev)}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); if (dragOp) assignOpToPalete(dragOp, p.id); }}
                className={cn(
                  "flex min-h-0 flex-col rounded-xl border-2 bg-white shadow-sm transition",
                  dragOver === p.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200",
                  overflow && "border-red-400"
                )}
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-[11px] font-black text-white">{p.numero}</span>
                    {p.tipo_caixa ? (
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase",
                        p.tipo_caixa === "termo" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"
                      )}>{p.tipo_caixa}</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-500">vazia</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn("text-[10px] font-black tabular-nums", overflow ? "text-red-600" : "text-slate-700")}>
                      {usadas}/{cap} cx
                    </span>
                    {items.length > 0 && (
                      <button onClick={() => limparPalete(p.id)} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Limpar palete">✕</button>
                    )}
                  </div>
                </div>
                <div className="h-1 w-full bg-slate-100">
                  <div className={cn("h-full transition-all", overflow ? "bg-red-500" : pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-slate-400")} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                  {items.length === 0 && (
                    <li className="flex h-full min-h-[60px] items-center justify-center text-[10px] font-bold text-slate-300">Arrastar para aqui</li>
                  )}
                  {items.map((it) => (
                    <li key={it.op.id} className="group flex items-center justify-between gap-1 rounded bg-slate-50 px-1.5 py-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-mono font-bold text-slate-500">{it.op.produto_codigo}</p>
                        <p className="truncate text-[10px] font-extrabold text-slate-800">{it.op.produto_nome}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-black text-slate-700">{it.numCaixas}cx</span>
                      <button onClick={() => removerDaPalete(it.op.id)} className="opacity-0 transition-opacity group-hover:opacity-100 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remover">×</button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {pendingAssign && (
        <AllocateCaixasDialog
          state={pendingAssign}
          onCancel={() => setPendingAssign(null)}
          onConfirm={async (numCaixas) => {
            const s = pendingAssign;
            setPendingAssign(null);
            await confirmAssign(s.opId, s.paleteId, numCaixas);
          }}
        />
      )}
    </div>
  );
}

function AllocateCaixasDialog({ state, onCancel, onConfirm }: {
  state: { opId: string; paleteId: string; paleteNum: number; opCaixas: number; espacoLivre: number; cap: number; usadas: number; tipoCaixa: TipoCaixa | null };
  onCancel: () => void;
  onConfirm: (n: number) => void;
}) {
  const [value, setValue] = useState(state.espacoLivre > 0 ? state.espacoLivre : state.opCaixas);
  const restante = state.opCaixas - value;
  const novoTotalPalete = state.usadas + value;
  const excedePalete = novoTotalPalete > state.cap;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-black text-slate-900">Palete {state.paleteNum} — espaço insuficiente</h3>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Capacidade {state.cap}cx · Usadas {state.usadas}cx · Livre <span className="text-slate-900">{state.espacoLivre}cx</span>
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          OP tem <span className="text-slate-900">{state.opCaixas}cx</span> para alocar
        </p>

        <label className="mt-4 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
          Quantas caixas alocar aqui?
        </label>
        <input
          type="number"
          min={1}
          max={state.opCaixas}
          value={value}
          onChange={(e) => setValue(Math.max(1, Math.min(state.opCaixas, Number(e.target.value) || 1)))}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-2xl font-black text-slate-900 focus:border-blue-400 focus:outline-none"
          autoFocus
        />

        <div className="mt-3 space-y-1 text-xs font-bold">
          <p className={cn("flex justify-between", excedePalete ? "text-amber-700" : "text-slate-600")}>
            <span>Nova ocupação palete:</span>
            <span>{novoTotalPalete}/{state.cap}cx {excedePalete && "⚠ excede"}</span>
          </p>
          {restante > 0 && (
            <p className="flex justify-between text-slate-600">
              <span>Restam na OP (cria outra palete):</span>
              <span className="text-slate-900">{restante}cx</span>
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button
            onClick={() => setValue(state.espacoLivre)}
            disabled={state.espacoLivre === 0}
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
            title="Usar o espaço livre"
          >Livre ({state.espacoLivre})</button>
          <button
            onClick={() => onConfirm(value)}
            disabled={value < 1}
            className="flex-1 rounded-lg bg-slate-800 py-2 text-xs font-extrabold text-white hover:bg-slate-700 disabled:opacity-40"
          >Alocar {value}cx</button>
        </div>
      </div>
    </div>
  );
}
