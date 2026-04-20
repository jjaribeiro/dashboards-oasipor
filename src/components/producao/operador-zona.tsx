"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { useNow } from "@/hooks/use-now";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ClockDisplay } from "@/components/clock-display";
import { ViewOP } from "./view-op";
import { FormCiclo } from "./form-ciclo";
import { Numpad } from "./numpad";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PausaDialog } from "./pausa-dialog";
import { RejeitoDialog } from "./rejeito-dialog";
import { EquipaPresencaPanel } from "./equipa-presenca-panel";
import { usePessoaSession, logAction } from "@/hooks/use-pessoa-session";
import { useDelayAlert } from "@/hooks/use-delay-alert";
import { MOTIVOS_PAUSA, MOTIVOS_REJEITO } from "@/lib/constants";
// (usados abaixo na lógica de labels)
import {
  ESTADO_OP_COR,
  ESTADO_OP_LABEL,
  PRIORIDADE_OP_COR,
  ZONA_LABEL,
  ESTADO_CICLO_COR,
  ESTADO_CICLO_LABEL,
  AREA_COR,
  AREA_LABEL,
} from "@/lib/constants";
import { cn, cycleProgress, formatDuration, minutesUntil, formatShortDateTime } from "@/lib/utils";
import type { EquipamentoCiclo, Funcionario, OrdemProducao, ZonaProducao } from "@/lib/types";

interface Props {
  zona: ZonaProducao;
  zonasAgrupadas?: string[]; // para SL2 Linhas que agrega sl2_manual + sl2_termo
  initialOPs: OrdemProducao[];
  initialCiclos: EquipamentoCiclo[];
  initialFuncionarios: Funcionario[];
}

// Transferências permitidas entre zonas (operador decide)
const TRANSFERS_POSSIVEIS: Record<string, Array<{ id: string; label: string; cor: string }>> = {
  sl1_campos: [{ id: "sl2_embalamento", label: "Embalamento", cor: "bg-yellow-500" }],
  sl1_laminados: [{ id: "sl2_embalamento", label: "Embalamento", cor: "bg-yellow-500" }],
  sl1_mascaras: [{ id: "sl2_embalamento", label: "Embalamento", cor: "bg-yellow-500" }],
  sl1_toucas: [{ id: "sl2_embalamento", label: "Embalamento", cor: "bg-yellow-500" }],
  sl1_outros: [{ id: "sl2_embalamento", label: "Embalamento", cor: "bg-yellow-500" }],
  sl2_picking: [
    { id: "sl2_manual", label: "SL2 Manual", cor: "bg-amber-500" },
    { id: "sl2_termo", label: "SL2 Termo", cor: "bg-orange-500" },
  ],
  sl2_manual: [{ id: "sl2_embalamento", label: "Embalamento", cor: "bg-yellow-500" }],
  sl2_termo: [{ id: "sl2_embalamento", label: "Embalamento", cor: "bg-yellow-500" }],
  sl2_embalamento: [{ id: "pre_cond_1", label: "Pré-Cond 1 (EO)", cor: "bg-rose-500" }],
};

const TIPO_BADGE: Record<string, { label: string; cor: string }> = {
  manual: { label: "Manual", cor: "bg-amber-100 text-amber-700 border-amber-300" },
  termoformadora: { label: "Termo", cor: "bg-violet-100 text-violet-700 border-violet-300" },
  stock: { label: "Stock", cor: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  assembling: { label: "Manual", cor: "bg-amber-100 text-amber-700 border-amber-300" },
};

// Badge para identificar a sub-zona quando zonas agrupadas
function subZonaBadge(zona_id: string) {
  if (zona_id === "sl2_manual") return { label: "Manual", cor: "bg-amber-500" };
  if (zona_id === "sl2_termo") return { label: "Termo", cor: "bg-violet-500" };
  return null;
}

export function OperadorZona({ zona, zonasAgrupadas, initialOPs, initialCiclos, initialFuncionarios }: Props) {
  useNow(20_000);
  const isCiclo = zona.tipo === "camara" || zona.tipo === "esterilizador";
  const { session } = usePessoaSession();

  // Para zonas agrupadas, não usar filter (já filtrado server-side) + não ter realtime filtrado por zona
  const { items: ops, setItems: setOps } = useRealtimeTable<OrdemProducao>(
    "ordens_producao",
    initialOPs,
    zonasAgrupadas
      ? { orderBy: "updated_at", ascending: false }
      : { orderBy: "updated_at", ascending: false, filter: { column: "zona_id", value: zona.id } }
  );

  // Helper: aplicar mudanças localmente de imediato (optimistic UI)
  function patchOp(id: string, patch: Partial<OrdemProducao>) {
    setOps((prev) => prev.map((o) => o.id === id ? { ...o, ...patch } : o));
  }
  function removeOpLocal(id: string) {
    setOps((prev) => prev.filter((o) => o.id !== id));
  }
  const { items: ciclos } = useRealtimeTable<EquipamentoCiclo>("equipamento_ciclo", initialCiclos, {
    orderBy: "updated_at",
    ascending: false,
    filter: { column: "zona_id", value: zona.id },
  });
  const { items: funcionarios } = useRealtimeTable<Funcionario>("funcionarios", initialFuncionarios, { orderBy: "nome" });

  // Se zonas agrupadas, filtrar ops para apenas essas zonas
  const opsFiltradas = zonasAgrupadas
    ? ops.filter((o) => zonasAgrupadas.includes(o.zona_id))
    : ops;

  const [viewOP, setViewOP] = useState<{ open: boolean; item: OrdemProducao | null }>({ open: false, item: null });
  const [cicloForm, setCicloForm] = useState<{ open: boolean; item: EquipamentoCiclo | null }>({ open: false, item: null });
  const [transferOP, setTransferOP] = useState<OrdemProducao | null>(null);
  const [confirmConcluir, setConfirmConcluir] = useState<OrdemProducao | null>(null);
  const [pausaDialog, setPausaDialog] = useState<OrdemProducao | null>(null);
  const [rejeitoDialog, setRejeitoDialog] = useState<OrdemProducao | null>(null);

  // Todas as OPs ativas (em_curso + pausada) ficam no painel principal — suporta múltiplas em simultâneo
  const emCursoOuPausada = opsFiltradas
    .filter((o) => o.estado === "em_curso" || o.estado === "pausada")
    .sort((a, b) => {
      // em_curso primeiro, depois por inicio (mais antigo primeiro)
      if (a.estado !== b.estado) return a.estado === "em_curso" ? -1 : 1;
      const da = a.inicio ?? a.inicio_previsto ?? a.created_at;
      const db = b.inicio ?? b.inicio_previsto ?? b.created_at;
      return new Date(da).getTime() - new Date(db).getTime();
    });

  // Fila = planeada + concluida (aguardam ação)
  const fila = opsFiltradas
    .filter((o) => o.estado === "planeada" || o.estado === "concluida")
    .sort((a, b) => {
      const da = a.inicio_previsto ?? a.created_at;
      const db = b.inicio_previsto ?? b.created_at;
      return new Date(da).getTime() - new Date(db).getTime();
    });

  // Equipa: vem da escala de hoje (com fallback para zona_atual)
  const zonasParaEquipa = zonasAgrupadas ?? [zona.id];
  const [escalaHoje, setEscalaHoje] = useState<Set<string>>(new Set());
  useEffect(() => {
    const hojeStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
    const fetch = async () => {
      const { data } = await supabase
        .from("escala_funcionario")
        .select("funcionario_id")
        .in("zona_id", zonasParaEquipa)
        .eq("data", hojeStr);
      setEscalaHoje(new Set((data ?? []).map((r) => (r as { funcionario_id: string }).funcionario_id)));
    };
    fetch();
    const ch = supabase
      .channel("escala_op_" + zona.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "escala_funcionario" }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zona.id, zonasParaEquipa.join(",")]);

  const equipa = funcionarios.filter((f) => {
    if (!f.ativo) return false;
    if (escalaHoje.has(f.id)) return true;
    // fallback: se não há escala de hoje para esta zona, usa zona_atual
    if (escalaHoje.size === 0 && f.zona_atual && zonasParaEquipa.includes(f.zona_atual)) return true;
    return false;
  });

  const ciclo = ciclos[0];

  const actor = {
    pessoaId: session?.pessoaId ?? null,
    pessoaNome: session?.pessoaNome ?? null,
  };

  function setQtyFor(op: OrdemProducao, novaQtd: number) {
    const nova = Math.max(0, Math.min(999999, Math.round(novaQtd)));
    const antiga = op.quantidade_atual;
    patchOp(op.id, { quantidade_atual: nova });
    supabase.from("ordens_producao").update({ quantidade_atual: nova }).eq("id", op.id)
      .then(({ error }) => { if (error) toast.error("Erro a atualizar quantidade"); });
    logAction({ ...actor, acao: "qty_update", alvoTabela: "ordens_producao", alvoId: op.id, zonaId: zona.id, detalhes: { de: antiga, para: nova, produto: op.produto_codigo } });
  }

  async function iniciar(op: OrdemProducao) {
    if (op.bloqueada) { toast.error("OP bloqueada — a zona anterior ainda não concluiu"); return; }

    // Verificar se há pelo menos 1 pessoa presente na zona (hoje)
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const { data: presencasHoje } = await supabase
      .from("funcionario_presencas")
      .select("funcionario_id, tipo, criado_em")
      .eq("zona_id", zona.id)
      .gte("criado_em", hoje.toISOString())
      .order("criado_em", { ascending: false });
    const ultimoPorPessoa = new Map<string, string>();
    for (const r of (presencasHoje ?? []) as Array<{ funcionario_id: string; tipo: string }>) {
      if (!ultimoPorPessoa.has(r.funcionario_id)) ultimoPorPessoa.set(r.funcionario_id, r.tipo);
    }
    const presentes = Array.from(ultimoPorPessoa.values()).filter((t) => t === "entrada" || t === "pausa_fim").length;
    if (presentes === 0) {
      toast.error("Sem pessoas registadas nesta zona. Alguém tem de dar entrada com PIN primeiro.");
      return;
    }

    const agora = new Date().toISOString();
    const antes = { estado: op.estado, inicio: op.inicio, fim_real: op.fim_real };
    const depois = { estado: "em_curso" as const, inicio: agora, fim_real: null };
    patchOp(op.id, depois);
    toast.success("OP iniciada", { duration: 8000, action: { label: "Desfazer", onClick: () => revertOp(op.id, antes, op.produto_nome) } });
    supabase.from("ordens_producao").update(depois).eq("id", op.id)
      .then(({ error }) => { if (error) toast.error("Erro"); });
    logAction({ ...actor, acao: "op_iniciar", alvoTabela: "ordens_producao", alvoId: op.id, zonaId: zona.id, detalhes: { produto: op.produto_codigo, antes } });
  }

  function pausarComMotivo(op: OrdemProducao, motivoId: string, notas: string | undefined, pessoas: Array<{ id: string; nome: string }>) {
    const motivoLabel = MOTIVOS_PAUSA.find((m) => m.id === motivoId)?.label ?? motivoId;
    const now = new Date().toISOString();
    setPausaDialog(null);
    const antes = { estado: op.estado, motivo_pausa: op.motivo_pausa, pausada_em: op.pausada_em };
    patchOp(op.id, { estado: "pausada", motivo_pausa: motivoLabel, pausada_em: now });
    const quemLabel = pessoas.length === 0 ? "" : pessoas.length === 1 ? ` · ${pessoas[0].nome}` : ` · ${pessoas.length} pessoas`;
    toast.success(`OP pausada: ${motivoLabel}${quemLabel}`, { duration: 8000, action: { label: "Desfazer", onClick: () => revertOp(op.id, antes, op.produto_nome) } });

    // Fire-and-forget em paralelo
    supabase.from("ordens_producao")
      .update({ estado: "pausada", motivo_pausa: motivoLabel, pausada_em: now })
      .eq("id", op.id)
      .then(({ error }) => { if (error) toast.error("Erro a pausar"); });

    // Uma linha por pessoa em pausa (ou 1 linha com o actor se nenhuma equipa)
    const linhas = pessoas.length > 0
      ? pessoas.map((p) => ({ pessoa_id: p.id, pessoa_nome: p.nome }))
      : [{ pessoa_id: actor.pessoaId, pessoa_nome: actor.pessoaNome }];
    for (const p of linhas) {
      supabase.from("producao_pausas").insert({
        op_id: op.id,
        zona_id: zona.id,
        pessoa_id: p.pessoa_id,
        pessoa_nome: p.pessoa_nome,
        motivo: motivoLabel,
        inicio: now,
        notas: notas ?? null,
      }).then(() => {});
    }

    logAction({ ...actor, acao: "op_pausar", alvoTabela: "ordens_producao", alvoId: op.id, zonaId: zona.id, detalhes: { produto: op.produto_codigo, motivo: motivoLabel, notas, pessoas: pessoas.map((p) => p.nome), antes } });
  }

  function retomar(op: OrdemProducao) {
    patchOp(op.id, { estado: "em_curso", motivo_pausa: null, pausada_em: null });
    toast.success("OP retomada");
    supabase.from("producao_pausas")
      .update({ fim: new Date().toISOString() })
      .eq("op_id", op.id)
      .is("fim", null)
      .then(() => {});
    supabase.from("ordens_producao")
      .update({ estado: "em_curso", motivo_pausa: null, pausada_em: null })
      .eq("id", op.id)
      .then(({ error }) => { if (error) toast.error("Erro"); });
    logAction({ ...actor, acao: "op_retomar", alvoTabela: "ordens_producao", alvoId: op.id, zonaId: zona.id, detalhes: { produto: op.produto_codigo } });
  }

  function concluirConfirmado(op: OrdemProducao) {
    setConfirmConcluir(null);
    const agora = new Date().toISOString();
    const antes = { estado: op.estado, fim_real: op.fim_real };
    patchOp(op.id, { estado: "concluida", fim_real: agora });
    toast.success("OP concluída", { duration: 8000, action: { label: "Desfazer", onClick: () => revertOp(op.id, antes, op.produto_nome) } });
    supabase.from("ordens_producao")
      .update({ estado: "concluida", fim_real: agora })
      .eq("id", op.id)
      .then(({ error }) => { if (error) toast.error("Erro"); });
    logAction({ ...actor, acao: "op_concluir", alvoTabela: "ordens_producao", alvoId: op.id, zonaId: zona.id, detalhes: { produto: op.produto_codigo, qtd: op.quantidade_atual, rejeitados: op.quantidade_rejeitada, antes } });
  }

  function revertOp(opId: string, antes: Record<string, unknown>, nome: string) {
    patchOp(opId, antes);
    supabase.from("ordens_producao").update(antes).eq("id", opId)
      .then(({ error }) => { if (error) toast.error(`Erro a reverter: ${error.message}`); });
    logAction({ ...actor, acao: "op_reverter", alvoTabela: "ordens_producao", alvoId: opId, zonaId: zona.id, detalhes: { produto: nome, reposto: antes } });
    toast.success(`${nome}: revertido`);
  }

  async function reverterUltimaNaZona() {
    const { data } = await supabase
      .from("audit_log")
      .select("id, acao, alvo_id, detalhes")
      .eq("alvo_tabela", "ordens_producao")
      .eq("zona_id", zona.id)
      .in("acao", ["op_iniciar", "op_pausar", "op_concluir"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) { toast.info?.("Nada para reverter nesta zona"); return; }
    const log = data[0];
    const d = log.detalhes as { antes?: Record<string, unknown>; produto?: string } | null;
    if (!d?.antes || !log.alvo_id) { toast.error("Registo sem estado anterior"); return; }
    revertOp(log.alvo_id, d.antes, d.produto ?? "OP");
  }

  function registarRejeito(op: OrdemProducao, quantidade: number, motivoId: string, notas?: string) {
    const motivoLabel = MOTIVOS_REJEITO.find((m) => m.id === motivoId)?.label ?? motivoId;
    const novaRej = (op.quantidade_rejeitada || 0) + quantidade;
    setRejeitoDialog(null);
    patchOp(op.id, { quantidade_rejeitada: novaRej });
    toast.success(`${quantidade} rejeitados registados`);

    supabase.from("ordens_producao")
      .update({ quantidade_rejeitada: novaRej })
      .eq("id", op.id)
      .then(({ error }) => { if (error) toast.error("Erro"); });

    supabase.from("producao_rejeitos").insert({
      op_id: op.id,
      zona_id: zona.id,
      pessoa_id: actor.pessoaId,
      pessoa_nome: actor.pessoaNome,
      quantidade,
      motivo: motivoLabel,
      notas: notas ?? null,
    }).then(() => {});

    logAction({ ...actor, acao: "op_rejeito", alvoTabela: "ordens_producao", alvoId: op.id, zonaId: zona.id, detalhes: { produto: op.produto_codigo, quantidade, motivo: motivoLabel, notas } });
  }

  async function solicitarCq(op: OrdemProducao) {
    // Verifica se já existe pedido CQ pendente para esta OP
    const { data: existente } = await supabase
      .from("cq_inspecoes")
      .select("id")
      .eq("op_id", op.id)
      .eq("resultado", "pendente")
      .limit(1);
    if (existente && existente.length > 0) {
      toast.info?.("Já existe um pedido CQ pendente para esta OP");
      return;
    }
    const { error } = await supabase.from("cq_inspecoes").insert({
      op_id: op.id,
      pedido_id: op.pedido_id,
      produto_codigo: op.produto_codigo,
      tamanho_amostra: 0,
      checklist: [] as unknown as Record<string, unknown>[],
      resultado: "pendente",
      pessoa_id: actor.pessoaId,
      pessoa_nome: actor.pessoaNome,
      notas: null,
    });
    if (error) { toast.error("Erro a solicitar CQ: " + error.message); return; }
    toast.success("CQ solicitado — equipa de Qualidade notificada");
    logAction({ ...actor, acao: "cq_solicitar", alvoTabela: "cq_inspecoes", alvoId: op.id, zonaId: zona.id, detalhes: { produto: op.produto_codigo } });
  }

  function transferir(op: OrdemProducao, destinoId: string, destinoLabel: string) {
    setTransferOP(null);
    // Remove da lista local (já não pertence a esta zona)
    removeOpLocal(op.id);
    toast.success(`Transferido para ${destinoLabel}`);
    supabase.from("ordens_producao")
      .update({
        zona_id: destinoId,
        estado: "planeada",
        inicio: null,
        fim_real: null,
        quantidade_atual: 0,
      })
      .eq("id", op.id)
      .then(({ error }) => { if (error) { console.error("transfer error", error); toast.error(`Erro a transferir: ${error.message}`); } });
    logAction({ ...actor, acao: "op_transferir", alvoTabela: "ordens_producao", alvoId: op.id, zonaId: zona.id, detalhes: { produto: op.produto_codigo, de: zona.id, para: destinoId, qtd_transferida: op.quantidade_atual } });
  }

  // Para zonas agrupadas (sl2_linhas), a zona de origem para transferir é a zona real de cada OP
  function getTransfersFor(op: OrdemProducao) {
    const opcoes = TRANSFERS_POSSIVEIS[op.zona_id] ?? [];
    // Se a OP tem tipo_linha definido e está em picking, filtrar para só a linha correspondente
    if (op.zona_id === "sl2_picking" && op.tipo_linha) {
      const tipo = op.tipo_linha as string;
      const alvoId = tipo === "termoformadora" ? "sl2_termo"
                   : (tipo === "manual" || tipo === "assembling") ? "sl2_manual"
                   : null;
      if (alvoId) {
        const filtrado = opcoes.filter((d) => d.id === alvoId);
        if (filtrado.length > 0) return filtrado;
      }
    }
    return opcoes;
  }

  const areaColor = AREA_COR[zona.area] ?? "bg-slate-100 text-slate-700 border-slate-200";

  // Alerta sonoro quando OPs entram em atraso
  const numAtrasadas = opsFiltradas.filter((o) =>
    (o.estado === "em_curso" || o.estado === "planeada") &&
    o.fim_previsto && new Date(o.fim_previsto) < new Date()
  ).length;
  useDelayAlert(numAtrasadas, !!session);

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/producao/operador" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200" title="Voltar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", areaColor)}>
                {AREA_LABEL[zona.area]}
              </span>
              {zonasAgrupadas && (
                <div className="flex gap-1">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-700">Manual</span>
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-extrabold text-violet-700">Termo</span>
                </div>
              )}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">{ZONA_LABEL[zona.id] ?? zona.nome}</h1>
          </div>
          {zona.responsavel && (
            <div className="ml-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-blue-500">Responsável</div>
              <div className="text-sm font-extrabold text-blue-700">{zona.responsavel}</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <EquipaPresencaPanel zonaId={zona.id} equipa={equipa} />
          <button
            onClick={reverterUltimaNaZona}
            title="Reverter a última acção (iniciar/pausar/concluir) feita nesta zona"
            className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-extrabold text-amber-700 hover:bg-amber-100"
          >↶ Reverter última</button>
          <ClockDisplay />
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Barra KPI do dia/turno */}
        {!isCiclo && <TopKPIBar ops={opsFiltradas} />}

        {isCiclo ? (
          <CicloPanel ciclo={ciclo} onOpen={(c) => setCicloForm({ open: true, item: c })} />
        ) : (
          <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            {/* OPs ATIVAS (em curso/pausada) */}
            <div className="flex flex-col gap-3 overflow-y-auto">
              {emCursoOuPausada.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white p-16 text-center shadow-sm">
                  <div className="mb-4 text-7xl">⏸</div>
                  <p className="text-3xl font-black text-slate-700">Sem OP em curso</p>
                  <p className="mt-2 max-w-md text-base font-bold text-slate-500">
                    {fila.length > 0
                      ? `${fila.length} OP${fila.length > 1 ? "s" : ""} na fila — inicia uma ao lado`
                      : "A gestão ainda não criou OPs para esta zona"}
                  </p>
                </div>
              ) : (
                <div className={cn(
                  "grid gap-3",
                  emCursoOuPausada.length === 1 ? "grid-cols-1" : "grid-cols-1 2xl:grid-cols-2"
                )}>
                  {emCursoOuPausada.map((op) => (
                    <OPAtual
                      key={op.id}
                      op={op}
                      compact={emCursoOuPausada.length > 1}
                      showSubBadge={!!zonasAgrupadas}
                      onSetQty={(n) => setQtyFor(op, n)}
                      onPause={() => setPausaDialog(op)}
                      onResume={() => retomar(op)}
                      onEnd={() => setConfirmConcluir(op)}
                      onView={() => setViewOP({ open: true, item: op })}
                      onRejeito={() => setRejeitoDialog(op)}
                      onSolicitarCq={() => solicitarCq(op)}
                      hasTransfers={getTransfersFor(op).length > 0}
                      onTransfer={() => {
                        const destinos = getTransfersFor(op);
                        if (destinos.length === 1) {
                          transferir(op, destinos[0].id, destinos[0].label);
                        } else {
                          setTransferOP(op);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* FILA */}
            <aside className="flex flex-col gap-3 overflow-hidden">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-black text-slate-700">Fila de OPs</h2>
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-extrabold text-white">{fila.length}</span>
              </div>

              {fila.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 text-center">
                  <p className="text-sm font-bold text-slate-400">Fila vazia</p>
                </div>
              )}

              <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                {fila.map((op) => (
                  <FilaRow
                    key={op.id}
                    op={op}
                    showSubBadge={!!zonasAgrupadas}
                    onStart={() => iniciar(op)}
                    onView={() => setViewOP({ open: true, item: op })}
                    hasTransfers={getTransfersFor(op).length > 0}
                    onTransfer={() => {
                      const destinos = getTransfersFor(op);
                      if (destinos.length === 1) {
                        transferir(op, destinos[0].id, destinos[0].label);
                      } else {
                        setTransferOP(op);
                      }
                    }}
                  />
                ))}
              </div>
            </aside>
          </div>
        )}
      </div>

      {viewOP.open && (
        <ViewOP
          open={viewOP.open}
          onOpenChange={(o) => setViewOP((s) => ({ ...s, open: o }))}
          op={viewOP.item}
        />
      )}
      {transferOP && (
        <TransferDialog
          op={transferOP}
          destinos={getTransfersFor(transferOP)}
          onCancel={() => setTransferOP(null)}
          onConfirm={(destinoId, destinoLabel) => transferir(transferOP, destinoId, destinoLabel)}
        />
      )}
      {confirmConcluir && (
        <ConfirmDialog
          title="Concluir OP?"
          message="Esta ação marca a OP como concluída e não pode ser desfeita pelo operador."
          variant="warning"
          confirmLabel="✓ Concluir"
          detail={
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xs font-bold text-slate-500">{confirmConcluir.produto_nome}</p>
              <p className="mt-1 text-3xl font-black text-slate-900">
                {confirmConcluir.quantidade_atual} / {confirmConcluir.quantidade_alvo}
              </p>
              {confirmConcluir.quantidade_rejeitada > 0 && (
                <p className="mt-1 text-sm font-extrabold text-red-600">{confirmConcluir.quantidade_rejeitada} rejeitados</p>
              )}
              {confirmConcluir.quantidade_atual < confirmConcluir.quantidade_alvo && (
                <p className="mt-2 text-xs font-extrabold text-yellow-700">⚠ Quantidade feita inferior à alvo</p>
              )}
            </div>
          }
          onCancel={() => setConfirmConcluir(null)}
          onConfirm={() => concluirConfirmado(confirmConcluir)}
        />
      )}
      {pausaDialog && (
        <PausaDialog
          equipa={equipa}
          onCancel={() => setPausaDialog(null)}
          onConfirm={(motivo, notas, pessoas) => pausarComMotivo(pausaDialog, motivo, notas, pessoas)}
        />
      )}
      {rejeitoDialog && (
        <RejeitoDialog
          maxQtd={Math.max(1, rejeitoDialog.quantidade_atual)}
          onCancel={() => setRejeitoDialog(null)}
          onConfirm={(qtd, motivo, notas) => registarRejeito(rejeitoDialog, qtd, motivo, notas)}
        />
      )}
      {cicloForm.open && (
        <FormCiclo
          open={cicloForm.open}
          onOpenChange={(o) => setCicloForm((s) => ({ ...s, open: o }))}
          editItem={cicloForm.item}
          zonaId={zona.id}
        />
      )}
    </div>
  );
}

/* ==========================================================
   OP ATUAL
   ========================================================== */
function OPAtual({
  op, compact = false, showSubBadge, onSetQty, onPause, onResume, onEnd, onView, onRejeito, onSolicitarCq, hasTransfers, onTransfer,
}: {
  op: OrdemProducao; compact?: boolean; showSubBadge: boolean;
  onSetQty: (n: number) => void;
  onPause: () => void; onResume: () => void; onEnd: () => void; onView: () => void;
  onRejeito: () => void;
  onSolicitarCq: () => void;
  hasTransfers: boolean; onTransfer: () => void;
}) {
  const pct = op.quantidade_alvo > 0 ? Math.min(100, (op.quantidade_atual / op.quantidade_alvo) * 100) : 0;
  const restante = minutesUntil(op.fim_previsto);
  const concluida = op.estado === "concluida";
  const atraso = !concluida && restante !== null && restante < 0;
  const pausada = op.estado === "pausada";
  const tipoBadge = op.tipo_linha ? TIPO_BADGE[op.tipo_linha] : undefined;
  const subBadge = showSubBadge ? subZonaBadge(op.zona_id) : null;

  // Tempo decorrido desde o início real
  const decorridoMin = op.inicio ? Math.max(0, Math.floor((Date.now() - new Date(op.inicio).getTime()) / 60000)) : null;

  const [numpadOpen, setNumpadOpen] = useState(false);

  return (
    <div className={cn(
      "flex flex-col rounded-2xl border-2 bg-white shadow-xl",
      compact ? "p-4" : "p-6",
      atraso ? "border-red-400 ring-2 ring-red-200" :
      pausada ? "border-yellow-300" : "border-emerald-300"
    )}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {op.produto_codigo && (
              <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-base font-extrabold text-white">
                {op.produto_codigo}
              </span>
            )}
            {subBadge && (
              <span className={cn("rounded-lg px-2.5 py-1 text-sm font-extrabold text-white shadow-sm", subBadge.cor)}>
                {subBadge.label}
              </span>
            )}
            {tipoBadge && !subBadge && (
              <span className={cn("rounded-lg border px-2 py-0.5 text-sm font-extrabold", tipoBadge.cor)}>
                {tipoBadge.label}
              </span>
            )}
            <span className={cn("rounded-lg border px-2 py-0.5 text-sm font-extrabold", ESTADO_OP_COR[op.estado])}>
              {ESTADO_OP_LABEL[op.estado]}
            </span>
            {op.prioridade !== "normal" && (
              <span className={cn("rounded-lg border px-2 py-0.5 text-sm font-extrabold capitalize", PRIORIDADE_OP_COR[op.prioridade])}>
                {op.prioridade}
              </span>
            )}
            {atraso && (
              <span className="rounded-lg bg-red-500 px-2.5 py-1 text-sm font-extrabold uppercase tracking-wide text-white shadow-md animate-pulse">
                ⚠ Em Atraso
              </span>
            )}
            {op.numero && <span className="text-sm font-bold text-slate-500">OP {op.numero}</span>}
          </div>
          <h2 className="mt-3 text-3xl font-black leading-tight text-slate-900">
            {op.produto_nome}
            {op.lote && (
              <span className="ml-2 rounded-md bg-sky-100 px-2 py-0.5 text-lg font-extrabold text-sky-700">
                Lote {op.lote}
              </span>
            )}
          </h2>
          {op.cliente && (
            <p className="mt-1 text-base font-bold text-slate-500">{op.cliente}</p>
          )}
          {(op.inicio_previsto || op.fim_previsto) && (
            <p className="mt-1 text-sm font-bold text-slate-400">
              {op.inicio_previsto && <span suppressHydrationWarning>▸ {formatShortDateTime(op.inicio_previsto)}</span>}
              {op.inicio_previsto && op.fim_previsto && <span className="mx-1">→</span>}
              {op.fim_previsto && <span suppressHydrationWarning>■ {formatShortDateTime(op.fim_previsto)}</span>}
            </p>
          )}
        </div>
        <button
          onClick={onView}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
        >
          Detalhes
        </button>
      </div>

      {/* Timer + KPIs */}
      {op.inicio && (
        <div className="mt-5 grid grid-cols-4 gap-3">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">Iniciada</p>
            <p className="mt-1 text-xl font-black text-emerald-700" suppressHydrationWarning>
              {formatShortDateTime(op.inicio)}
            </p>
          </div>
          <div className="rounded-2xl bg-indigo-50 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-600">A trabalhar há</p>
            <p className="mt-1 text-xl font-black text-indigo-700" suppressHydrationWarning>
              {decorridoMin !== null ? formatDuration(decorridoMin) : "—"}
            </p>
          </div>
          <KpiRitmo op={op} decorridoMin={decorridoMin} />
          <KpiMeta op={op} />
        </div>
      )}

      {/* Contador + Tempo */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setNumpadOpen(true)}
          className="group rounded-2xl bg-slate-50 p-5 text-left transition-all hover:bg-slate-100 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Quantidade Feita</p>
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-600 opacity-0 transition-opacity group-hover:opacity-100">
              Tocar p/ editar
            </span>
          </div>
          <p className="mt-2 font-black leading-none text-slate-900">
            <span className={cn(compact ? "text-5xl" : "text-7xl")}>{op.quantidade_atual}</span>
            <span className={cn("ml-2 text-slate-400", compact ? "text-xl" : "text-2xl")}>/ {op.quantidade_alvo}</span>
          </p>
          {op.quantidade_alvo > 0 && (
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className={cn("h-full rounded-full transition-all", pausada ? "bg-yellow-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
            </div>
          )}
        </button>

        <Numpad
          open={numpadOpen}
          onOpenChange={setNumpadOpen}
          label="Quantidade Feita"
          currentValue={op.quantidade_atual}
          target={op.quantidade_alvo}
          onConfirm={onSetQty}
        />
        <div className={cn("rounded-2xl p-5", atraso ? "bg-red-50" : concluida ? "bg-blue-50" : "bg-slate-50")}>
          <p className={cn("text-xs font-extrabold uppercase tracking-wide", atraso ? "text-red-600" : concluida ? "text-blue-600" : "text-slate-500")}>
            {concluida ? "Concluída" : atraso ? "Tempo atraso" : "Tempo restante"}
          </p>
          <p className={cn("mt-2 font-black leading-none", compact ? "text-3xl" : "text-5xl", atraso ? "text-red-600" : concluida ? "text-blue-700" : "text-slate-900")}>
            {concluida ? "✓" : restante !== null ? (atraso ? `+${formatDuration(-restante)}` : formatDuration(restante)) : "—"}
          </p>
          <p className="mt-3 text-xs font-bold text-slate-500">
            {concluida ? "OP concluída" : atraso ? "Prazo ultrapassado" : restante === null ? "Sem prazo definido" : "Até ao fim previsto"}
          </p>
        </div>
      </div>

      {/* Motivo da pausa */}
      {pausada && op.motivo_pausa && (
        <div className="mt-4 rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-yellow-700">Pausada: {op.motivo_pausa}</p>
        </div>
      )}

      {/* Rejeitados se houver */}
      {op.quantidade_rejeitada > 0 && (
        <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-red-700">Rejeitados</p>
          <p className="text-2xl font-black text-red-700">{op.quantidade_rejeitada} un</p>
        </div>
      )}

      {/* Ações — no picking só pausa + transferir (sem concluir/rejeitar) */}
      {(() => {
        const ePicking = op.zona_id === "sl2_picking";
        return (
          <>
            <div className={cn("mt-5 grid gap-2", ePicking ? "grid-cols-1" : "grid-cols-3")}>
              {pausada ? (
                <button onClick={onResume} className="rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95">
                  ▶ Retomar
                </button>
              ) : (
                <button onClick={onPause} className="rounded-2xl bg-yellow-500 py-4 text-lg font-extrabold text-white shadow-md transition-all hover:bg-yellow-600 active:scale-95">
                  ⏸ Pausar
                </button>
              )}
              {!ePicking && (
                <button onClick={onEnd} className="col-span-2 rounded-2xl bg-blue-600 py-4 text-lg font-extrabold text-white shadow-md transition-all hover:bg-blue-700 active:scale-95">
                  ✓ Concluir OP
                </button>
              )}
            </div>
            {!ePicking && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={onRejeito}
                  className="rounded-2xl border-2 border-red-200 bg-red-50 py-3 text-sm font-extrabold text-red-700 transition-all hover:bg-red-100 active:scale-95"
                >
                  ❌ Registar Rejeitados
                </button>
                <button
                  onClick={onSolicitarCq}
                  className="rounded-2xl border-2 border-sky-300 bg-sky-50 py-3 text-sm font-extrabold text-sky-700 transition-all hover:bg-sky-100 active:scale-95"
                  title="Chamar a equipa de Qualidade para inspeção da OP"
                >
                  🔍 Solicitar CQ
                </button>
              </div>
            )}
          </>
        );
      })()}

      {/* Transferir (se há destinos disponíveis) */}
      {hasTransfers && (
        <button
          onClick={onTransfer}
          className="mt-2 rounded-2xl border-2 border-purple-300 bg-purple-50 py-3 text-base font-extrabold text-purple-700 shadow-sm transition-all hover:bg-purple-100 active:scale-95"
        >
          → Transferir para próxima zona
        </button>
      )}
    </div>
  );
}

/* ==========================================================
   Top KPI Bar — sempre visível, objetivos do dia
   ========================================================== */
function TopKPIBar({ ops }: { ops: OrdemProducao[] }) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  // Início da semana (segunda) e fim (segunda+7)
  const inicioSemana = new Date(hoje);
  const diaSemana = inicioSemana.getDay() || 7; // Dom=0 → 7
  inicioSemana.setDate(inicioSemana.getDate() - (diaSemana - 1));
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(fimSemana.getDate() + 7);

  // Workload conta se o período da OP (inicio_previsto → fim_previsto) OVERLAPA com o período
  // Ou seja: OP começa antes do fim do período E acaba depois do início do período
  function overlapa(op: OrdemProducao, de: Date, ate: Date) {
    if (op.estado !== "em_curso" && op.estado !== "planeada" && op.estado !== "pausada") return false;
    const opInicio = op.inicio_previsto ? new Date(op.inicio_previsto) : null;
    const opFim = op.fim_previsto ? new Date(op.fim_previsto) : opInicio;
    if (!opInicio || !opFim) return false;
    return opInicio < ate && opFim >= de;
  }

  const workloadHoje = ops.filter((o) => overlapa(o, hoje, amanha));
  const alvoHoje = workloadHoje.reduce((acc, o) => acc + (o.quantidade_alvo || 0), 0);
  const feitoHoje = workloadHoje.reduce((acc, o) => acc + (o.quantidade_atual || 0), 0);
  const pctHoje = alvoHoje > 0 ? Math.round((feitoHoje / alvoHoje) * 100) : 0;

  const workloadSemana = ops.filter((o) => overlapa(o, inicioSemana, fimSemana));
  const alvoSemana = workloadSemana.reduce((acc, o) => acc + (o.quantidade_alvo || 0), 0);
  const feitoSemana = workloadSemana.reduce((acc, o) => acc + (o.quantidade_atual || 0), 0);
  const pctSemana = alvoSemana > 0 ? Math.round((feitoSemana / alvoSemana) * 100) : 0;

  const opsEmCurso = ops.filter((o) => o.estado === "em_curso").length;

  // Concluídas hoje (fim_real hoje)
  const opsConcluidasHoje = ops.filter((o) => {
    if (o.estado !== "concluida" || !o.fim_real) return false;
    const d = new Date(o.fim_real);
    return d >= hoje && d < amanha;
  }).length;

  // Atrasadas
  const atrasadas = ops.filter((o) =>
    (o.estado === "em_curso" || o.estado === "planeada") &&
    o.fim_previsto &&
    new Date(o.fim_previsto) < new Date()
  ).length;

  return (
    <div className="grid grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <KpiTile
        label="Workload Hoje"
        value={`${feitoHoje}/${alvoHoje}`}
        sub={`${pctHoje}% · ${workloadHoje.length} OP${workloadHoje.length === 1 ? "" : "s"}`}
        tone={pctHoje >= 80 ? "good" : pctHoje >= 50 ? "warn" : "bad"}
        progressBar={pctHoje}
      />
      <KpiTile
        label="Em curso"
        value={opsEmCurso.toString()}
        sub={opsEmCurso === 1 ? "OP ativa" : "OPs ativas"}
        tone={opsEmCurso > 0 ? "good" : "neutral"}
      />
      <KpiTile
        label="Concluídas hoje"
        value={opsConcluidasHoje.toString()}
        sub={opsConcluidasHoje === 1 ? "OP" : "OPs"}
        tone={opsConcluidasHoje > 0 ? "good" : "neutral"}
      />
      <KpiTile
        label="Atrasadas"
        value={atrasadas.toString()}
        sub={atrasadas === 0 ? "Tudo no prazo" : "Em atraso"}
        tone={atrasadas === 0 ? "good" : "bad"}
        flash={atrasadas > 0}
      />
    </div>
  );
}

function KpiTile({ label, value, sub, tone, flash, progressBar }: {
  label: string; value: string; sub?: string;
  tone: "good" | "warn" | "bad" | "neutral";
  flash?: boolean;
  progressBar?: number;
}) {
  const toneClass = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-yellow-50 text-yellow-800 border-yellow-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-slate-50 text-slate-700 border-slate-200",
  }[tone];

  return (
    <div className={cn(
      "rounded-xl border p-3",
      toneClass,
      flash && "animate-pulse"
    )}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-2xl font-black leading-none">{value}</p>
      {sub && <p className="mt-1 text-[10px] font-bold opacity-80">{sub}</p>}
      {progressBar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/50">
          <div className="h-full rounded-full bg-current transition-all" style={{ width: `${Math.min(100, progressBar)}%` }} />
        </div>
      )}
    </div>
  );
}

/* ==========================================================
   KPIs — pressão visível para o operador
   ========================================================== */

// Inline KPIs: ritmo + progresso numa linha só
function KpiInline({ op, decorridoMin }: { op: OrdemProducao; decorridoMin: number | null }) {
  const pct = op.quantidade_alvo > 0 ? Math.round((op.quantidade_atual / op.quantidade_alvo) * 100) : 0;
  let ritmoText = "—";
  let ritmoCor = "text-slate-500";
  if (decorridoMin && decorridoMin >= 1 && op.inicio_previsto && op.fim_previsto) {
    const ritmoAtual = op.quantidade_atual / (decorridoMin / 60);
    const durPrev = (new Date(op.fim_previsto).getTime() - new Date(op.inicio_previsto).getTime()) / 60000;
    const ritmoEsp = op.quantidade_alvo / (durPrev / 60);
    const pctR = ritmoEsp > 0 ? (ritmoAtual / ritmoEsp) * 100 : 100;
    ritmoText = `${Math.round(ritmoAtual)} un/h`;
    ritmoCor = pctR >= 95 ? "text-emerald-600" : pctR >= 80 ? "text-yellow-700" : "text-red-600";
  }
  return (
    <>
      <span>
        <span className="opacity-70">Ritmo:</span>{" "}
        <span className={cn("font-black", ritmoCor)}>{ritmoText}</span>
      </span>
      <span>
        <span className="opacity-70">Progresso:</span>{" "}
        <span className="font-black text-slate-900">{pct}%</span>
      </span>
    </>
  );
}

// Ritmo = unidades/hora atual vs esperado
function KpiRitmo({ op, decorridoMin }: { op: OrdemProducao; decorridoMin: number | null }) {
  if (!decorridoMin || decorridoMin < 1 || !op.inicio_previsto || !op.fim_previsto) {
    return (
      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Ritmo</p>
        <p className="mt-1 text-xl font-black text-slate-400">—</p>
      </div>
    );
  }

  const ritmoAtualPorHora = op.quantidade_atual / (decorridoMin / 60);
  const duracaoPrevMin = (new Date(op.fim_previsto).getTime() - new Date(op.inicio_previsto).getTime()) / 60000;
  const ritmoEsperadoPorHora = op.quantidade_alvo / (duracaoPrevMin / 60);
  const diff = ritmoAtualPorHora - ritmoEsperadoPorHora;
  const pctVsEsperado = ritmoEsperadoPorHora > 0 ? (ritmoAtualPorHora / ritmoEsperadoPorHora) * 100 : 100;

  const bom = pctVsEsperado >= 95;
  const avisar = pctVsEsperado >= 80 && pctVsEsperado < 95;

  return (
    <div className={cn(
      "rounded-2xl p-4",
      bom ? "bg-emerald-50" : avisar ? "bg-yellow-50" : "bg-red-50"
    )}>
      <p className={cn(
        "text-[10px] font-extrabold uppercase tracking-wide",
        bom ? "text-emerald-600" : avisar ? "text-yellow-700" : "text-red-600"
      )}>Ritmo/h</p>
      <p className={cn(
        "mt-1 text-xl font-black",
        bom ? "text-emerald-700" : avisar ? "text-yellow-800" : "text-red-700"
      )}>
        {Math.round(ritmoAtualPorHora)}
      </p>
      <p className={cn(
        "text-[10px] font-bold",
        bom ? "text-emerald-600" : avisar ? "text-yellow-700" : "text-red-600"
      )}>
        {diff >= 0 ? "+" : ""}{Math.round(diff)} vs meta
      </p>
    </div>
  );
}

// Meta diária prevista
function KpiMeta({ op }: { op: OrdemProducao }) {
  const pct = op.quantidade_alvo > 0 ? Math.round((op.quantidade_atual / op.quantidade_alvo) * 100) : 0;
  const bom = pct >= 80;
  const avisar = pct >= 50 && pct < 80;

  return (
    <div className={cn(
      "rounded-2xl p-4",
      bom ? "bg-emerald-50" : avisar ? "bg-yellow-50" : "bg-slate-50"
    )}>
      <p className={cn(
        "text-[10px] font-extrabold uppercase tracking-wide",
        bom ? "text-emerald-600" : avisar ? "text-yellow-700" : "text-slate-500"
      )}>Progresso</p>
      <p className={cn(
        "mt-1 text-xl font-black",
        bom ? "text-emerald-700" : avisar ? "text-yellow-800" : "text-slate-700"
      )}>
        {pct}%
      </p>
      <p className={cn(
        "text-[10px] font-bold",
        bom ? "text-emerald-600" : avisar ? "text-yellow-700" : "text-slate-500"
      )}>
        {op.quantidade_alvo - op.quantidade_atual} por fazer
      </p>
    </div>
  );
}

/* ==========================================================
   FILA ROW
   ========================================================== */
function FilaRow({ op, showSubBadge, onStart, onView, hasTransfers, onTransfer }: { op: OrdemProducao; showSubBadge: boolean; onStart: () => void; onView: () => void; hasTransfers: boolean; onTransfer: () => void }) {
  const tipoBadge = op.tipo_linha ? TIPO_BADGE[op.tipo_linha] : undefined;
  const subBadge = showSubBadge ? subZonaBadge(op.zona_id) : null;
  const podeIniciar = op.estado === "planeada" || op.estado === "pausada";
  const concluida = op.estado === "concluida";
  const restante = minutesUntil(op.fim_previsto);
  const atraso = !concluida && restante !== null && restante < 0;

  return (
    <div className={cn(
      "flex flex-col gap-1.5 rounded-2xl border-2 border-l-[6px] bg-white p-3 shadow-sm transition-all",
      concluida ? "border-blue-200 border-l-blue-400 bg-blue-50" :
      atraso ? "border-red-300 border-l-red-500 bg-red-50/40 ring-1 ring-red-200" :
      "border-slate-200 border-l-slate-300 hover:border-slate-300 hover:shadow-md"
    )}>
      <div className="flex flex-wrap items-center gap-1">
        {op.produto_codigo && (
          <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-extrabold text-white">
            {op.produto_codigo}
          </span>
        )}
        {subBadge && (
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white", subBadge.cor)}>
            {subBadge.label}
          </span>
        )}
        {tipoBadge && !subBadge && (
          <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-extrabold", tipoBadge.cor)}>
            {tipoBadge.label}
          </span>
        )}
        <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold", ESTADO_OP_COR[op.estado])}>
          {ESTADO_OP_LABEL[op.estado]}
        </span>
        {op.prioridade !== "normal" && (
          <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold capitalize", PRIORIDADE_OP_COR[op.prioridade])}>
            {op.prioridade}
          </span>
        )}
        {atraso && (
          <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm animate-pulse">
            ⚠ Atraso
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-extrabold leading-snug text-slate-900">
        {op.produto_nome}
        {op.lote && (
          <span className="ml-1.5 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-extrabold text-sky-700">
            Lote {op.lote}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-slate-400">
        {op.cliente && <span>{op.cliente}</span>}
        {op.inicio_previsto && <span suppressHydrationWarning>▸{formatShortDateTime(op.inicio_previsto)}</span>}
      </div>
      {/* Quantidade */}
      <div className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Quantidade</span>
        <span className="text-sm font-black text-slate-900">
          {op.quantidade_atual}
          <span className="text-slate-400"> / {op.quantidade_alvo}</span>
          <span className="ml-1 text-[10px] font-bold text-slate-500">un</span>
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {podeIniciar && (
          <button
            onClick={onStart}
            className="flex-1 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
          >
            ▶ Iniciar
          </button>
        )}
        {hasTransfers && concluida && (
          <button
            onClick={onTransfer}
            className="flex-1 rounded-lg bg-purple-600 px-2 py-2 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-purple-700 active:scale-95"
          >
            → Transferir
          </button>
        )}
        <button
          onClick={onView}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          Detalhes
        </button>
      </div>
    </div>
  );
}

/* ==========================================================
   TRANSFER DIALOG
   ========================================================== */
function TransferDialog({ op, destinos, onCancel, onConfirm }: {
  op: OrdemProducao;
  destinos: Array<{ id: string; label: string; cor: string }>;
  onCancel: () => void;
  onConfirm: (destinoId: string, destinoLabel: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-900">Transferir OP</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">Escolhe a zona de destino</p>
        </div>

        {/* Info da OP */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            {op.produto_codigo && (
              <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm font-extrabold text-white">
                {op.produto_codigo}
              </span>
            )}
            {op.numero && <span className="text-xs font-bold text-slate-500">OP {op.numero}</span>}
          </div>
          <p className="mt-2 text-base font-extrabold text-slate-900">{op.produto_nome}</p>
          {op.quantidade_atual > 0 && (
            <p className="mt-1 text-sm font-bold text-slate-500">
              Quantidade feita: <span className="text-slate-900">{op.quantidade_atual}</span> un
            </p>
          )}
        </div>

        {/* Destinos */}
        <div className="mt-4 flex flex-col gap-2">
          {destinos.map((d) => (
            <button
              key={d.id}
              onClick={() => onConfirm(d.id, d.label)}
              className={cn(
                "flex items-center justify-between rounded-2xl px-4 py-4 text-lg font-extrabold text-white shadow-md transition-all active:scale-[0.98] hover:brightness-110",
                d.cor
              )}
            >
              <span>→ {d.label}</span>
              <span className="text-2xl">›</span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-xs font-bold text-slate-400">
          Ao transferir, a quantidade feita reinicia na próxima zona
        </p>

        <button
          onClick={onCancel}
          className="mt-3 w-full rounded-2xl bg-slate-200 py-3 text-base font-extrabold text-slate-700 transition-all hover:bg-slate-300 active:scale-95"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ==========================================================
   PAINEL DE CICLO
   ========================================================== */
function CicloPanel({ ciclo, onOpen }: { ciclo: EquipamentoCiclo | undefined; onOpen: (c: EquipamentoCiclo | null) => void }) {
  const estado = ciclo?.estado ?? "vazio";
  const progress = ciclo ? cycleProgress(ciclo.inicio, ciclo.fim_previsto) : 0;
  const restante = ciclo ? minutesUntil(ciclo.fim_previsto) : null;
  const atraso = restante !== null && restante < 0;

  return (
    <div className={cn(
      "flex-1 rounded-3xl border-2 bg-white p-8 shadow-xl",
      estado === "alarme" && "border-red-400 ring-4 ring-red-200",
      estado === "em_ciclo" && "border-emerald-300",
      estado === "concluido" && "border-blue-300",
      estado === "vazio" && "border-slate-200"
    )}>
      <div className="flex items-center justify-between">
        <span className={cn("rounded-lg border px-3 py-1 text-base font-extrabold", ESTADO_CICLO_COR[estado])}>
          {ESTADO_CICLO_LABEL[estado]}
        </span>
        <button
          onClick={() => onOpen(ciclo ?? null)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          {ciclo ? "Ver detalhes" : "Carregar"}
        </button>
      </div>

      {ciclo && ciclo.paletes && ciclo.paletes > 0 && (
        <div className="mt-6">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Paletes — {ciclo.paletes}</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {Array.from({ length: ciclo.paletes }, (_, i) => (
              <div
                key={i}
                className="flex h-14 items-center justify-center rounded-xl bg-emerald-500 text-lg font-extrabold text-white shadow-sm"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      )}

      {estado === "em_ciclo" && (
        <div className="mt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Tempo restante</p>
              <p className={cn("mt-1 text-5xl font-black leading-none", atraso ? "text-red-600" : "text-slate-900")}>
                {restante !== null ? (atraso ? `+${formatDuration(-restante)}` : formatDuration(restante)) : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Progresso</p>
              <p className="mt-1 text-5xl font-black leading-none text-slate-900">{Math.round(progress * 100)}%</p>
            </div>
          </div>
          <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-200">
            <div
              className={cn("h-full rounded-full transition-all", atraso ? "bg-red-500" : "bg-emerald-500")}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {estado === "vazio" && (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center">
          <div className="mb-2 text-5xl">🔒</div>
          <p className="text-2xl font-black text-slate-400">Equipamento vazio</p>
          <p className="mt-1 text-sm font-bold text-slate-500">A gestão irá carregar o próximo ciclo</p>
        </div>
      )}

      {estado === "concluido" && (
        <div className="mt-8 rounded-2xl bg-blue-50 p-10 text-center">
          <div className="mb-2 text-5xl">✅</div>
          <p className="text-3xl font-black text-blue-700">Ciclo Concluído</p>
          <p className="mt-1 text-lg font-bold text-blue-600">Pronto a descarregar</p>
        </div>
      )}
    </div>
  );
}
