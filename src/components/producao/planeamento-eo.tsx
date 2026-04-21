"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
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
  initialPaletes: PaleteEO[];
  initialProdutos: Produto[];
}

export function PlaneamentoEOTab({ ops, initialPaletes, initialProdutos }: Props) {
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

  // Garantir 8 paletes em estado planeamento
  useEffect(() => {
    const emPlaneamento = paletes.filter((p) => p.estado === "planeamento");
    if (emPlaneamento.length < NUM_PALETES) {
      const existentesNums = new Set(emPlaneamento.map((p) => p.numero));
      const faltam: { numero: number }[] = [];
      for (let i = 1; i <= NUM_PALETES; i++) if (!existentesNums.has(i)) faltam.push({ numero: i });
      if (faltam.length > 0) {
        supabase.from("paletes_eo").insert(faltam.map((f) => ({ numero: f.numero, estado: "planeamento" }))).then(({ error }) => {
          if (error) console.error("seed paletes", error);
          else refetchPaletes();
        });
      }
    }
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
    const novoTotal = usadas + (info?.numCaixas ?? 0);
    const cap = produtoTipoCaixa ? CAPACIDADE[produtoTipoCaixa] : 0;
    if (produtoTipoCaixa && novoTotal > cap) {
      const excesso = novoTotal - cap;
      if (!confirm(`Palete ${palete.numero} excede capacidade (${novoTotal}/${cap}). Excesso: ${excesso} caixas. Continuar?`)) return;
    }

    // Update OP
    const { error: eOp } = await supabase.from("ordens_producao").update({
      palete_eo_id: paleteId,
      num_caixas: info?.numCaixas ?? null,
    }).eq("id", opId);
    if (eOp) { toast.error("Erro a atribuir OP"); return; }

    // Definir tipo_caixa da palete se ainda não tinha
    if (!palete.tipo_caixa && produtoTipoCaixa) {
      await supabase.from("paletes_eo").update({ tipo_caixa: produtoTipoCaixa }).eq("id", paleteId);
    }
    toast.success(`OP movida para palete ${palete.numero}`);
  }, [ops, paletes, opsPorPalete, disponiveis]);

  const removerDaPalete = useCallback(async (opId: string) => {
    const { error } = await supabase.from("ordens_producao").update({ palete_eo_id: null }).eq("id", opId);
    if (error) toast.error("Erro a remover");
    else toast.success("Removido da palete");
  }, []);

  const limparPalete = useCallback(async (paleteId: string) => {
    const items = opsPorPalete.get(paleteId) ?? [];
    if (items.length === 0) return;
    if (!confirm(`Remover ${items.length} OP${items.length === 1 ? "" : "s"} da palete?`)) return;
    for (const it of items) {
      await supabase.from("ordens_producao").update({ palete_eo_id: null }).eq("id", it.op.id);
    }
    await supabase.from("paletes_eo").update({ tipo_caixa: null }).eq("id", paleteId);
    toast.success("Palete limpa");
  }, [opsPorPalete]);

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

    // 2) Marcar paletes como fechadas e ligar ao ciclo
    const idsPaletes = paletesComConteudo.map((p) => p.id);
    await supabase.from("paletes_eo").update({ estado: "em_pre_cond", ciclo_id: cicloData.id, fechada_em: new Date().toISOString() }).in("id", idsPaletes);

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
    </div>
  );
}
