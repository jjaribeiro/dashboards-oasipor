import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { notifyMutation } from "@/hooks/use-realtime-table";
import type { OrdemProducao } from "@/lib/types";

interface Actor {
  pessoaId?: string | null;
  pessoaNome?: string | null;
  zonaId?: string | null;
}

type Snapshot = Partial<Pick<OrdemProducao,
  "estado" | "inicio" | "fim_real" | "quantidade_atual" | "pausada_em" | "motivo_pausa" | "zona_id" | "bloqueada"
>>;

interface OpActionLog {
  acao: string;
  op_id: string;
  produto_nome: string;
  antes: Snapshot;
  depois: Snapshot;
  actor: Actor;
  created_at: number;
}

async function gravarAudit(log: OpActionLog) {
  await supabase.from("audit_log").insert({
    pessoa_id: log.actor.pessoaId ?? null,
    pessoa_nome: log.actor.pessoaNome ?? null,
    acao: log.acao,
    alvo_tabela: "ordens_producao",
    alvo_id: log.op_id,
    zona_id: log.actor.zonaId ?? null,
    detalhes: { antes: log.antes, depois: log.depois, produto_nome: log.produto_nome },
  });
}

async function reverter(log: OpActionLog) {
  const { error } = await supabase.from("ordens_producao").update(log.antes).eq("id", log.op_id);
  if (error) { toast.error(`Erro a reverter: ${error.message}`); return false; }
  notifyMutation("ordens_producao");
  await supabase.from("audit_log").insert({
    pessoa_id: log.actor.pessoaId ?? null,
    pessoa_nome: log.actor.pessoaNome ?? null,
    acao: `reverter_${log.acao}`,
    alvo_tabela: "ordens_producao",
    alvo_id: log.op_id,
    zona_id: log.actor.zonaId ?? null,
    detalhes: { revertido_de: log.depois, reposto_para: log.antes, produto_nome: log.produto_nome },
  });
  toast.success(`${log.produto_nome}: revertido`);
  return true;
}

function toastComDesfazer(msg: string, log: OpActionLog) {
  toast.success(msg, {
    duration: 8000,
    action: { label: "Desfazer", onClick: () => reverter(log) },
  });
}

/** Inicia ou retoma uma OP */
export async function iniciarOP(op: OrdemProducao, actor: Actor = {}) {
  if (op.bloqueada) { toast.error("OP bloqueada — a zona anterior ainda não concluiu"); return; }
  const antes: Snapshot = { estado: op.estado, inicio: op.inicio, pausada_em: op.pausada_em };
  const depois: Snapshot = { estado: "em_curso", inicio: op.inicio ?? new Date().toISOString(), pausada_em: null };
  const { error } = await supabase.from("ordens_producao").update(depois).eq("id", op.id);
  if (error) { toast.error(`Erro: ${error.message}`); return; }
  notifyMutation("ordens_producao");
  const log: OpActionLog = { acao: "iniciar_op", op_id: op.id, produto_nome: op.produto_nome, antes, depois, actor, created_at: Date.now() };
  await gravarAudit(log);
  toastComDesfazer("OP iniciada", log);
}

/** Pausa uma OP em curso */
export async function pausarOP(op: OrdemProducao, motivo: string | null, actor: Actor = {}) {
  const antes: Snapshot = { estado: op.estado, pausada_em: op.pausada_em, motivo_pausa: op.motivo_pausa };
  const depois: Snapshot = { estado: "pausada", pausada_em: new Date().toISOString(), motivo_pausa: motivo };
  const { error } = await supabase.from("ordens_producao").update(depois).eq("id", op.id);
  if (error) { toast.error(`Erro: ${error.message}`); return; }
  notifyMutation("ordens_producao");
  const log: OpActionLog = { acao: "pausar_op", op_id: op.id, produto_nome: op.produto_nome, antes, depois, actor, created_at: Date.now() };
  await gravarAudit(log);
  toastComDesfazer("OP pausada", log);
}

/** Conclui uma OP */
export async function concluirOP(op: OrdemProducao, actor: Actor = {}) {
  const antes: Snapshot = { estado: op.estado, fim_real: op.fim_real };
  const depois: Snapshot = { estado: "concluida", fim_real: new Date().toISOString() };
  const { error } = await supabase.from("ordens_producao").update(depois).eq("id", op.id);
  if (error) { toast.error(`Erro: ${error.message}`); return; }
  notifyMutation("ordens_producao");
  const log: OpActionLog = { acao: "concluir_op", op_id: op.id, produto_nome: op.produto_nome, antes, depois, actor, created_at: Date.now() };
  await gravarAudit(log);
  toastComDesfazer("OP concluída — pode reverter durante 8s", log);
}

/** Reverte a última acção (qualquer) feita nesta zona, procurando em audit_log */
export async function reverterUltimaNaZona(zonaId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, acao, alvo_id, detalhes, created_at")
    .eq("alvo_tabela", "ordens_producao")
    .eq("zona_id", zonaId)
    .in("acao", ["iniciar_op", "pausar_op", "concluir_op"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) { toast.info?.("Nada para reverter nesta zona"); return false; }
  const log = data[0];
  const detalhes = log.detalhes as { antes?: Snapshot; produto_nome?: string } | null;
  if (!detalhes?.antes || !log.alvo_id) { toast.error("Registo sem estado anterior"); return false; }
  const { error: eUpd } = await supabase.from("ordens_producao").update(detalhes.antes).eq("id", log.alvo_id);
  if (eUpd) { toast.error(`Erro a reverter: ${eUpd.message}`); return false; }
  notifyMutation("ordens_producao");
  await supabase.from("audit_log").insert({
    acao: `reverter_${log.acao}`,
    alvo_tabela: "ordens_producao",
    alvo_id: log.alvo_id,
    zona_id: zonaId,
    detalhes: { revertido_audit_id: log.id, reposto_para: detalhes.antes },
  });
  toast.success(`Revertido: ${detalhes.produto_nome ?? log.alvo_id}`);
  return true;
}
