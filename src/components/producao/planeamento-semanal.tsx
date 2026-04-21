"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { notifyMutation } from "@/hooks/use-realtime-table";
import { toast } from "sonner";
import { cn, computePrioridadeEfetiva } from "@/lib/utils";
import { FormPedido } from "./planeamento-pedidos";
import { SubmeterSemanaDialog } from "./submeter-semana-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PRIORIDADE_OP_COR, PRIORIDADE_OP_LABEL } from "@/lib/constants";
import { rotaParaPedido } from "@/lib/producao-rota";
import type { PedidoProducao, PrioridadeOP, MetaCategoria, CategoriaMeta } from "@/lib/types";

const DIAS_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function startOfWeekMonday(d: Date) {
  const r = new Date(d);
  r.setHours(12, 0, 0, 0);
  const day = r.getDay() || 7; // 1=seg ... 7=dom
  r.setDate(r.getDate() - (day - 1));
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfDayLocal(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function priorityRank(p: PrioridadeOP): number {
  const map: Record<string, number> = { urgente: 4, alta: 3, normal: 2, baixa: 1, por_definir: 0 };
  return map[p] ?? 0;
}

// Deriva a zona (SL1 ou SL2) a partir do pedido:
// SL1 = campos com "NE" (máquina de campos). SL2 = restantes (manual/termo),
// incluindo campos sem NE que são embalados na termoformadora.
function zonaDoTipo(p: PedidoProducao): "sl1" | "sl2" {
  const eCampo = p.categoria === "campo" || p.tipo_linha === "campos" || (p.produto_nome ?? "").toLowerCase().includes("campo");
  if (!eCampo) return "sl2";
  const marcador = `${p.produto_nome ?? ""} ${p.produto_codigo ?? ""}`.toUpperCase();
  const temNE = /\bNE\b/.test(marcador);
  return temNE ? "sl1" : "sl2";
}

const ZONAS: Array<{ id: "sl1" | "sl2"; label: string; categoria: CategoriaMeta; flex: number }> = [
  { id: "sl1", label: "SL1", categoria: "campos_cirurgicos", flex: 1 },
  { id: "sl2", label: "SL2", categoria: "packs_trouxas", flex: 3 },
];

interface Props {
  pedidos: PedidoProducao[];
  metas: MetaCategoria[];
}

export function PlaneamentoSemanalTab({ pedidos, metas }: Props) {
  const [semanaOffset, setSemanaOffset] = useState(0);
  const metaPorZona = useMemo(() => {
    const r: Record<"sl1" | "sl2", number> = { sl1: 0, sl2: 0 };
    for (const z of ZONAS) {
      const m = metas.find((x) => x.categoria === z.categoria);
      r[z.id] = m?.meta_diaria_un ?? 0;
    }
    return r;
  }, [metas]);
  const prioridadeEfetiva = useMemo(() => computePrioridadeEfetiva(pedidos), [pedidos]);
  const prioEf = (id: string, fallback: PrioridadeOP): PrioridadeOP =>
    (prioridadeEfetiva.get(id) ?? fallback) as PrioridadeOP;
  const [filtroPrio, setFiltroPrio] = useState<string>("");
  const [searchAgendar, setSearchAgendar] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  // dropTarget: "inbox" ou "sl1__0" (zona__diaIdx) ou número (dia idx — para retrocompat)
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [viewPedido, setViewPedido] = useState<PedidoProducao | null>(null);
  const [submeterOpen, setSubmeterOpen] = useState(false);
  const [pedidosParaSubmeter, setPedidosParaSubmeter] = useState<PedidoProducao[]>([]);
  const [confirmAnular, setConfirmAnular] = useState<PedidoProducao[] | null>(null);
  const [confirmLimpar, setConfirmLimpar] = useState<PedidoProducao[] | null>(null);

  const { weekStart, days } = useMemo(() => {
    const base = addDays(startOfWeekMonday(new Date()), semanaOffset * 7);
    const ds = Array.from({ length: 5 }, (_, i) => addDays(base, i));
    return { weekStart: base, days: ds };
  }, [semanaOffset]);

  // Pedidos sem dia (para agendar) — filtra só os ainda por programar/pendentes
  const porAgendar = useMemo(() => {
    const q = searchAgendar.trim().toLowerCase();
    return pedidos
      .filter((p) => {
        if (p.estado === "concluido" || p.estado === "cancelado") return false;
        if (p.data_agendada) return false;
        if (filtroPrio && p.prioridade !== filtroPrio) return false;
        if (q) {
          const haystack = [
            p.produto_nome,
            p.produto_codigo,
            p.numero,
            p.cliente,
            p.comercial,
            p.ficha_producao,
          ].filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => priorityRank(prioEf(b.id, b.prioridade)) - priorityRank(prioEf(a.id, a.prioridade)));
  }, [pedidos, filtroPrio, searchAgendar, prioEf]);

  // Calcula em quantos dias da semana actual o pedido está agendado (start + fim opcional)
  function diasOcupadosNaSemana(p: PedidoProducao): number[] {
    if (!p.data_agendada) return [];
    const inicio = startOfDayLocal(new Date(p.data_agendada)).getTime();
    const fim = startOfDayLocal(new Date(p.data_fim_agendada ?? p.data_agendada)).getTime();
    const idxs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const d = startOfDayLocal(days[i]).getTime();
      if (d >= inicio && d <= fim) idxs.push(i);
    }
    return idxs;
  }

  // Pedidos já agendados agrupados por (zona, dia) — start day apenas (cartão "principal")
  const agendadosPorZonaDia = useMemo(() => {
    const map = new Map<string, PedidoProducao[]>();
    for (const z of ZONAS) for (let i = 0; i < 5; i++) map.set(`${z.id}__${i}`, []);
    for (const p of pedidos) {
      if (!p.data_agendada) continue;
      if (p.estado === "concluido" || p.estado === "cancelado") continue;
      const d = new Date(p.data_agendada);
      const zona = zonaDoTipo(p);
      for (let i = 0; i < 5; i++) {
        if (isSameDay(d, days[i])) {
          map.get(`${zona}__${i}`)!.push(p);
          break;
        }
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => priorityRank(prioEf(b.id, b.prioridade)) - priorityRank(prioEf(a.id, a.prioridade)));
    }
    return map;
  }, [pedidos, days]);

  // Continuações: dias ocupados que NÃO correspondem ao dia inicial (data_agendada)
  // Inclui o caso de o pedido ter começado em semana anterior — todos os dias desta semana são continuação
  const continuacoesPorZonaDia = useMemo(() => {
    const map = new Map<string, PedidoProducao[]>();
    for (const z of ZONAS) for (let i = 0; i < 5; i++) map.set(`${z.id}__${i}`, []);
    for (const p of pedidos) {
      if (!p.data_agendada || !p.data_fim_agendada) continue;
      if (p.estado === "concluido" || p.estado === "cancelado") continue;
      const zona = zonaDoTipo(p);
      const idxs = diasOcupadosNaSemana(p);
      const inicioMs = startOfDayLocal(new Date(p.data_agendada)).getTime();
      for (const i of idxs) {
        const dMs = startOfDayLocal(days[i]).getTime();
        if (dMs !== inicioMs) {
          map.get(`${zona}__${i}`)!.push(p);
        }
      }
    }
    return map;
  }, [pedidos, days]);

  // Totais por zona, dia — separados por tipo (campos vs packs/trouxas)
  const totaisPorZonaDia = useMemo(() => {
    const r: Record<string, { campos: number; packs: number }> = {};
    for (const z of ZONAS) for (let i = 0; i < 5; i++) r[`${z.id}__${i}`] = { campos: 0, packs: 0 };
    for (const p of pedidos) {
      if (!p.data_agendada) continue;
      if (p.estado === "concluido" || p.estado === "cancelado") continue;
      const zona = zonaDoTipo(p);
      const idxs = diasOcupadosNaSemana(p);
      if (idxs.length === 0) continue;
      const qtdPorDia = Math.round(p.quantidade_alvo / idxs.length);
      const eCampo = p.categoria === "campo" || p.tipo_linha === "campos" || (p.produto_nome ?? "").toLowerCase().includes("campo");
      for (const i of idxs) {
        if (eCampo) r[`${zona}__${i}`].campos += qtdPorDia;
        else r[`${zona}__${i}`].packs += qtdPorDia;
      }
    }
    return r;
  }, [pedidos, days]);

  const totaisPorDia = useMemo(() => {
    const r = new Array(5).fill(0);
    for (let i = 0; i < 5; i++) {
      for (const z of ZONAS) {
        const t = totaisPorZonaDia[`${z.id}__${i}`];
        r[i] += (t?.campos ?? 0) + (t?.packs ?? 0);
      }
    }
    return r;
  }, [totaisPorZonaDia]);

  const totalPorAgendar = porAgendar.length;
  const totalUnSemana = totaisPorDia.reduce((a, b) => a + b, 0);
  const capacidadeSemana = (metaPorZona.sl1 + metaPorZona.sl2) * 5;

  // Planeado da semana por zona × tipo (campo vs pack/trouxa)
  const planeadoPorZonaTipo = useMemo(() => {
    const r = { sl1_campos: 0, sl2_packs: 0, sl2_campos: 0 };
    for (const z of ZONAS) for (let i = 0; i < 5; i++) {
      for (const p of agendadosPorZonaDia.get(`${z.id}__${i}`) ?? []) {
        const eCampo = p.categoria === "campo" || p.tipo_linha === "campos" || (p.produto_nome ?? "").toLowerCase().includes("campo");
        if (z.id === "sl1") r.sl1_campos += p.quantidade_alvo;
        else if (eCampo) r.sl2_campos += p.quantidade_alvo;
        else r.sl2_packs += p.quantidade_alvo;
      }
    }
    return r;
  }, [agendadosPorZonaDia]);

  async function movePedido(pedidoId: string, target: "inbox" | number) {
    const p = pedidos.find((x) => x.id === pedidoId);
    if (!p) return;
    const novaData = target === "inbox" ? null : days[target].toISOString();
    const update: Record<string, unknown> = { data_agendada: novaData };
    if (novaData && p.estado === "pendente") update.estado = "programado";
    else if (!novaData && p.estado === "programado") update.estado = "pendente";
    const { error } = await supabase.from("pedidos_producao").update(update).eq("id", p.id);
    if (error) toast.error("Erro: " + error.message);
    else notifyMutation("pedidos_producao");
  }

  function onDragStart(id: string) { setDragId(id); }
  function onDragEnd() { setDragId(null); setDropTarget(null); }
  function onDragOver(e: React.DragEvent, target: string) {
    e.preventDefault();
    setDropTarget(target);
  }
  function onDropInbox(e: React.DragEvent) {
    e.preventDefault();
    if (!dragId) return;
    movePedido(dragId, "inbox");
    setDragId(null); setDropTarget(null);
  }
  function onDropCell(e: React.DragEvent, diaIdx: number) {
    e.preventDefault();
    if (!dragId) return;
    movePedido(dragId, diaIdx);
    setDragId(null); setDropTarget(null);
  }

  async function sugerirAuto() {
    // Distribui os pedidos "por agendar" nos 5 dias por ordem de prioridade,
    // respeitando meta diária em un por zona (SL1 = campos, SL2 = packs).
    const fila = [...porAgendar].sort((a, b) => priorityRank(prioEf(b.id, b.prioridade)) - priorityRank(prioEf(a.id, a.prioridade)));
    const ocupados: Record<"sl1" | "sl2", number[]> = {
      sl1: [0, 1, 2, 3, 4].map((i) => { const t = totaisPorZonaDia[`sl1__${i}`]; return (t?.campos ?? 0) + (t?.packs ?? 0); }),
      sl2: [0, 1, 2, 3, 4].map((i) => { const t = totaisPorZonaDia[`sl2__${i}`]; return (t?.campos ?? 0) + (t?.packs ?? 0); }),
    };
    const atribuicoes: Array<{ pedido: PedidoProducao; diaIdx: number }> = [];

    for (const p of fila) {
      const zona = zonaDoTipo(p);
      const meta = metaPorZona[zona];
      let diaIdx = -1;
      if (meta > 0) {
        for (let i = 0; i < 5; i++) {
          if (ocupados[zona][i] + p.quantidade_alvo <= meta) { diaIdx = i; break; }
        }
      }
      if (diaIdx < 0) {
        let min = Infinity;
        for (let i = 0; i < 5; i++) {
          if (ocupados[zona][i] < min) { min = ocupados[zona][i]; diaIdx = i; }
        }
      }
      if (diaIdx >= 0) {
        ocupados[zona][diaIdx] += p.quantidade_alvo;
        atribuicoes.push({ pedido: p, diaIdx });
      }
    }

    if (atribuicoes.length === 0) { toast.info?.("Nada para sugerir"); return; }

    let count = 0;
    for (const a of atribuicoes) {
      const novaData = days[a.diaIdx].toISOString();
      const update: Record<string, unknown> = { data_agendada: novaData };
      if (a.pedido.estado === "pendente") update.estado = "programado";
      const { error } = await supabase.from("pedidos_producao").update(update).eq("id", a.pedido.id);
      if (!error) count++;
    }
    if (count > 0) notifyMutation("pedidos_producao");
    toast.success(`${count} pedidos agendados automaticamente`);
  }

  function abrirSubmeterSemana() {
    const agendados: PedidoProducao[] = [];
    for (const z of ZONAS) for (let i = 0; i < 5; i++) {
      for (const p of agendadosPorZonaDia.get(`${z.id}__${i}`) ?? []) agendados.push(p);
    }
    const novos = agendados.filter((p) => p.estado !== "em_producao" && p.estado !== "concluido" && p.estado !== "cancelado");
    if (novos.length === 0) { toast.info?.("Nada para submeter — semana já em produção"); return; }
    setPedidosParaSubmeter(novos);
    setSubmeterOpen(true);
  }

  async function confirmarSubmeterSemana(rotulagemIds: Set<string>) {
    // Idempotente: pular pedidos que já têm OP criada
    const idsNovos = pedidosParaSubmeter.map((p) => p.id);
    const { data: jaTem } = await supabase
      .from("ordens_producao")
      .select("pedido_id")
      .in("pedido_id", idsNovos);
    const jaSubmetidos = new Set((jaTem ?? []).map((r) => r.pedido_id as string));
    const aCriar = pedidosParaSubmeter.filter((p) => !jaSubmetidos.has(p.id));
    if (aCriar.length === 0) {
      toast.info?.("Todos os pedidos já têm OP criada");
      setSubmeterOpen(false);
      return;
    }

    // Actualizar a flag precisa_rotulagem em todos os pedidos a submeter
    for (const p of pedidosParaSubmeter) {
      const precisa = rotulagemIds.has(p.id);
      if (precisa !== p.precisa_rotulagem) {
        await supabase.from("pedidos_producao").update({ precisa_rotulagem: precisa }).eq("id", p.id);
        notifyMutation("pedidos_producao");
      }
    }

    let opsCriadas = 0;
    let pedidosOk = 0;
    for (const p of aCriar) {
      const inicio = p.data_agendada ? new Date(p.data_agendada).toISOString() : null;
      // Fim previsto da OP = fim agendado no planeamento (default: mesmo dia do início).
      // Deadline do cliente está em pedidos_producao.fim_previsto e não é copiada para a OP.
      const fimPlaneamento = p.data_fim_agendada
        ? new Date(p.data_fim_agendada).toISOString()
        : inicio;
      const payload: Record<string, unknown> = {
        pedido_id: p.id,
        // Nº OP é atribuído manualmente mais tarde — não herda do pedido (PP)
        numero: null,
        zona_id: rotaParaPedido(p)[0], // zona inicial — operador transfere para a próxima
        produto_id: p.produto_id,
        produto_codigo: p.produto_codigo,
        produto_nome: p.produto_nome,
        cliente: p.cliente,
        categoria: p.categoria,
        tipo_linha: p.tipo_linha,
        quantidade_alvo: p.quantidade_alvo,
        quantidade_atual: 0,
        estado: "planeada",
        prioridade: prioEf(p.id, p.prioridade),
        inicio_previsto: inicio,
        fim_previsto: fimPlaneamento,
        ordem_fila: 1,
      };
      const { error } = await supabase.from("ordens_producao").insert(payload);
      if (error) { toast.error(`Erro a criar OP de ${p.produto_nome}: ${error.message}`); continue; }
      opsCriadas++;
      pedidosOk++;
      notifyMutation("ordens_producao");
      // Estado mantém-se "programado". Passa a "em_producao" quando operador iniciar a OP (trigger DB).
    }
    toast.success(`${pedidosOk} pedidos submetidos · ${opsCriadas} OPs criadas · ${rotulagemIds.size} para rotulagem`);
    setSubmeterOpen(false);
  }

  async function abrirAnularSubmissao() {
    const { data: opsRelacionadas, error: err1 } = await supabase
      .from("ordens_producao")
      .select("id, pedido_id, estado, inicio, quantidade_atual")
      .not("pedido_id", "is", null);
    if (err1) { toast.error("Erro a verificar OPs"); return; }
    const opsPorPedido = new Map<string, typeof opsRelacionadas>();
    for (const op of opsRelacionadas ?? []) {
      if (!op.pedido_id) continue;
      const arr = opsPorPedido.get(op.pedido_id) ?? [];
      arr.push(op);
      opsPorPedido.set(op.pedido_id, arr);
    }
    const candidatos: PedidoProducao[] = [];
    for (const z of ZONAS) for (let i = 0; i < 5; i++) {
      for (const p of agendadosPorZonaDia.get(`${z.id}__${i}`) ?? []) {
        if (p.estado !== "em_producao" && p.estado !== "programado") continue;
        const ops = opsPorPedido.get(p.id) ?? [];
        if (ops.length === 0) continue;
        const tocaram = ops.some((o) => o.estado !== "planeada" || (o.quantidade_atual ?? 0) > 0 || o.inicio !== null);
        if (!tocaram) candidatos.push(p);
      }
    }
    if (candidatos.length === 0) { toast.info?.("Nenhum pedido desta semana pode ser anulado"); return; }
    setConfirmAnular(candidatos);
  }

  async function confirmarAnularSubmissao() {
    const candidatos = confirmAnular ?? [];
    let ok = 0;
    for (const p of candidatos) {
      const { error: eDel } = await supabase.from("ordens_producao").delete().eq("pedido_id", p.id);
      if (eDel) { toast.error(`Erro a apagar OPs de ${p.produto_nome}`); continue; }
      notifyMutation("ordens_producao");
      const { error: eUpd } = await supabase.from("pedidos_producao").update({ estado: "programado" }).eq("id", p.id);
      if (!eUpd) { ok++; notifyMutation("pedidos_producao"); }
    }
    toast.success(`${ok} pedidos anulados`);
    setConfirmAnular(null);
  }

  function abrirLimparSemana() {
    const todos: PedidoProducao[] = [];
    for (const z of ZONAS) for (let i = 0; i < 5; i++) {
      for (const p of agendadosPorZonaDia.get(`${z.id}__${i}`) ?? []) todos.push(p);
    }
    if (todos.length === 0) { toast.info?.("Semana já vazia"); return; }
    setConfirmLimpar(todos);
  }

  async function confirmarLimparSemana() {
    const todos = confirmLimpar ?? [];
    if (todos.length === 0) { setConfirmLimpar(null); return; }

    // Ir buscar todas as OPs dos pedidos a limpar para saber o que pode ser apagado
    const pedidoIds = todos.map((p) => p.id);
    const { data: opsLigadas, error: errOps } = await supabase
      .from("ordens_producao")
      .select("id, pedido_id, estado, inicio, quantidade_atual")
      .in("pedido_id", pedidoIds);
    if (errOps) { toast.error("Erro a verificar OPs"); return; }

    // OPs tocadas (já iniciadas) — não podem ser apagadas
    const tocadas = new Set<string>();
    const tocadasPorPedido = new Map<string, number>();
    for (const op of opsLigadas ?? []) {
      const iniciou = op.estado !== "planeada" || op.inicio !== null || (op.quantidade_atual ?? 0) > 0;
      if (iniciou) {
        tocadas.add(op.id);
        if (op.pedido_id) tocadasPorPedido.set(op.pedido_id, (tocadasPorPedido.get(op.pedido_id) ?? 0) + 1);
      }
    }

    // Apagar as OPs que ainda não foram iniciadas (estão só planeadas)
    const idsParaApagar = (opsLigadas ?? []).filter((o) => !tocadas.has(o.id)).map((o) => o.id);
    let opsApagadas = 0;
    if (idsParaApagar.length > 0) {
      const { error: errDel } = await supabase.from("ordens_producao").delete().in("id", idsParaApagar);
      if (errDel) toast.error(`Erro a apagar OPs: ${errDel.message}`);
      else { opsApagadas = idsParaApagar.length; notifyMutation("ordens_producao"); }
    }

    // Desagendar pedidos; os que têm OPs tocadas mantêm estado (continuam em produção)
    let desagendados = 0;
    let mantidos = 0;
    for (const p of todos) {
      const temTocadas = (tocadasPorPedido.get(p.id) ?? 0) > 0;
      const update: Record<string, unknown> = { data_agendada: null, data_fim_agendada: null };
      if (!temTocadas && p.estado === "programado") update.estado = "pendente";
      if (temTocadas) mantidos++;
      const { error } = await supabase.from("pedidos_producao").update(update).eq("id", p.id);
      if (!error) {
        notifyMutation("pedidos_producao");
        if (!temTocadas) desagendados++;
      }
    }

    const partes: string[] = [];
    if (desagendados > 0) partes.push(`${desagendados} desagendado${desagendados === 1 ? "" : "s"}`);
    if (opsApagadas > 0) partes.push(`${opsApagadas} OP${opsApagadas === 1 ? "" : "s"} apagada${opsApagadas === 1 ? "" : "s"}`);
    if (mantidos > 0) partes.push(`${mantidos} mantido${mantidos === 1 ? "" : "s"} (em produção)`);
    toast.success(partes.join(" · ") || "Semana limpa");
    setConfirmLimpar(null);
  }

  return (
    <div className="flex h-full flex-col space-y-3">
      {/* Header — navegação + acções */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <button
          onClick={() => setSemanaOffset((s) => s - 1)}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-700 hover:bg-slate-200"
        >← Semana anterior</button>
        <button
          onClick={() => setSemanaOffset(0)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-extrabold",
            semanaOffset === 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
        >Hoje</button>
        <button
          onClick={() => setSemanaOffset((s) => s + 1)}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-700 hover:bg-slate-200"
        >Semana seguinte →</button>
        <div className="ml-4 text-sm font-black text-slate-800">
          {fmtDate(weekStart)} — {fmtDate(addDays(weekStart, 4))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-3 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-600">
            <span>
              <span className="rounded bg-slate-100 px-1 text-[10px] font-extrabold text-slate-700">SL1</span>
              <span className="ml-1 text-slate-500">Campos:</span>
              <span className="ml-0.5 font-extrabold text-slate-900">{planeadoPorZonaTipo.sl1_campos} un</span>
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="rounded bg-slate-100 px-1 text-[10px] font-extrabold text-slate-700">SL2</span>
              <span className="ml-1 text-slate-500">Packs/Trouxas:</span>
              <span className="ml-0.5 font-extrabold text-slate-900">{planeadoPorZonaTipo.sl2_packs} un</span>
              <span className="mx-1 text-slate-300">·</span>
              <span className="text-slate-500">Campos:</span>
              <span className="ml-0.5 font-extrabold text-slate-900">{planeadoPorZonaTipo.sl2_campos} un</span>
            </span>
          </div>
          <button
            disabled
            aria-disabled="true"
            tabIndex={-1}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm opacity-30 cursor-not-allowed"
            title="Em breve"
          >✨ Sugerir auto</button>
          <button
            onClick={abrirSubmeterSemana}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-700"
            title="Cria as OPs para cada pedido agendado e envia para os painéis de produção"
          >✓ Submeter semana</button>
          <button
            onClick={abrirAnularSubmissao}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-700 hover:bg-amber-100"
            title="Apaga as OPs criadas para pedidos que ainda não foram iniciados e repõe-nos em programado"
          >↶ Anular submissão</button>
          <button
            onClick={abrirLimparSemana}
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-100"
          >Limpar semana</button>
        </div>
      </div>

      {/* Split: sidebar + grid (2 zonas x 5 dias) */}
      <div className="grid flex-1 gap-3 min-h-0" style={{ gridTemplateColumns: "340px 1fr" }}>
        {/* Sidebar: pedidos por agendar */}
        <div
          className={cn(
            "flex flex-col overflow-hidden rounded-xl border-2 border-slate-200 bg-white",
            dropTarget === "inbox" && "border-sky-400 bg-sky-50"
          )}
          onDragOver={(e) => onDragOver(e, "inbox")}
          onDrop={onDropInbox}
        >
          <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">Por agendar</h3>
                <p className="text-[10px] font-bold text-slate-500">{totalPorAgendar} pedidos{searchAgendar && ` (filtrado)`}</p>
              </div>
              <select
                value={filtroPrio}
                onChange={(e) => setFiltroPrio(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700"
              >
                <option value="">Todas prio.</option>
                {Object.entries(PRIORIDADE_OP_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </div>
            <div className="relative">
              <input
                type="search"
                value={searchAgendar}
                onChange={(e) => setSearchAgendar(e.target.value)}
                placeholder="Pesquisar produto, ref, cliente, comercial…"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 pl-7 text-xs font-bold text-slate-700 placeholder:font-normal placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200"
              />
              <svg className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchAgendar && (
                <button
                  onClick={() => setSearchAgendar("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400 hover:text-slate-700"
                  title="Limpar"
                >×</button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {porAgendar.map((p) => (
              <PedidoCard
                key={p.id}
                pedido={p}
                prioridadeEfetiva={prioEf(p.id, p.prioridade)}
                draggable
                onDragStart={() => onDragStart(p.id)}
                onDragEnd={onDragEnd}
                dragging={dragId === p.id}
                showStockCp
                onClick={() => setViewPedido(p)}
              />
            ))}
            {porAgendar.length === 0 && (
              <p className="px-2 py-8 text-center text-xs font-bold text-slate-400">Tudo agendado 🎉</p>
            )}
          </div>
        </div>

        {/* Grid principal: linhas = zonas, colunas = dias */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border-2 border-slate-200 bg-white">
          {/* Header dos dias */}
          <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: "70px repeat(5, 1fr)" }}>
            <div className="border-r border-slate-200 px-2 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Zona</div>
            {days.map((d, i) => {
              const isHoje = isSameDay(d, new Date());
              return (
                <div
                  key={i}
                  className={cn(
                    "border-r border-slate-200 px-2 py-2",
                    isHoje && "bg-emerald-100"
                  )}
                >
                  <p className={cn("text-xs font-black", isHoje ? "text-emerald-800" : "text-slate-900")}>
                    {DIAS_LABEL[i]} {fmtDate(d)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Linhas por zona — preenchem a altura disponível */}
          <div className="flex flex-1 flex-col min-h-0">
            {ZONAS.map((zona) => (
              <div
                key={zona.id}
                className="grid min-h-0 border-b border-slate-200 last:border-b-0"
                style={{ gridTemplateColumns: "70px repeat(5, 1fr)", flex: zona.flex }}
              >
                <div className="border-r border-slate-200 bg-slate-50 px-2 py-3 text-xs font-black uppercase tracking-wide text-slate-700">
                  {zona.label}
                </div>
                {days.map((d, i) => {
                  const cellKey = `${zona.id}__${i}`;
                  const lista = agendadosPorZonaDia.get(cellKey) ?? [];
                  const continuacoes = continuacoesPorZonaDia.get(cellKey) ?? [];
                  const tot = totaisPorZonaDia[cellKey] ?? { campos: 0, packs: 0 };
                  const isDropTarget = dropTarget === cellKey;
                  const isHoje = isSameDay(d, new Date());
                  const totalPedidosNaCelula = lista.length + continuacoes.length;
                  return (
                    <div
                      key={i}
                      onDragOver={(e) => onDragOver(e, cellKey)}
                      onDrop={(e) => onDropCell(e, i)}
                      className={cn(
                        "border-r border-slate-200 p-1.5 space-y-1.5 overflow-y-auto transition-colors",
                        isHoje && "bg-emerald-50/40",
                        isDropTarget && "bg-sky-100",
                      )}
                    >
                      {(totalPedidosNaCelula > 0 || tot.campos > 0 || tot.packs > 0) && (
                        <div className="sticky top-0 z-[1] -mx-1.5 -mt-1.5 mb-0.5 border-b border-slate-200 bg-white/80 px-1.5 pt-1 pb-1 backdrop-blur">
                          <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold">
                            <span className="text-slate-400">
                              {totalPedidosNaCelula > 0 ? `${totalPedidosNaCelula} ${totalPedidosNaCelula === 1 ? "ped" : "peds"}` : ""}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {tot.campos > 0 && (
                                <span className="rounded bg-emerald-100 px-1 py-0.5 text-emerald-700" title="Campos">C {tot.campos}</span>
                              )}
                              {tot.packs > 0 && (
                                <span className="rounded bg-sky-100 px-1 py-0.5 text-sky-700" title="Packs / Trouxas">P {tot.packs}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                      {lista.map((p) => {
                        const idxs = diasOcupadosNaSemana(p);
                        const totalDias = idxs.length;
                        const qtdPorDia = totalDias > 0 ? Math.round(p.quantidade_alvo / totalDias) : p.quantidade_alvo;
                        return (
                          <PedidoCard
                            key={p.id}
                            pedido={p}
                            prioridadeEfetiva={prioEf(p.id, p.prioridade)}
                            draggable
                            onDragStart={() => onDragStart(p.id)}
                            onDragEnd={onDragEnd}
                            dragging={dragId === p.id}
                            onRemove={() => movePedido(p.id, "inbox")}
                            compact
                            onClick={() => setViewPedido(p)}
                            spanDias={totalDias > 1 ? totalDias : undefined}
                            qtyDoDia={totalDias > 1 ? qtdPorDia : undefined}
                          />
                        );
                      })}
                      {continuacoes.map((p) => {
                        const idxs = diasOcupadosNaSemana(p);
                        const qtdPorDia = idxs.length > 0 ? Math.round(p.quantidade_alvo / idxs.length) : 0;
                        return (
                          <button
                            key={`cont-${p.id}`}
                            onClick={() => setViewPedido(p)}
                            className="flex w-full items-center gap-1.5 rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-left text-[10px] font-bold text-slate-500 hover:border-sky-400 hover:bg-sky-50"
                            title={`Continuação de ${p.produto_nome}`}
                          >
                            <span className="text-slate-400">↳</span>
                            <span className="truncate">{p.produto_nome}</span>
                            <span className="ml-auto rounded bg-slate-200 px-1 py-0.5 text-[9px] font-extrabold text-slate-700">{qtdPorDia} un</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {viewPedido && (
        <FormPedido
          open
          editItem={viewPedido}
          onClose={() => setViewPedido(null)}
        />
      )}

      <SubmeterSemanaDialog
        open={submeterOpen}
        pedidos={pedidosParaSubmeter}
        onClose={() => setSubmeterOpen(false)}
        onConfirm={confirmarSubmeterSemana}
      />

      {confirmAnular && (
        <ConfirmDialog
          title="Anular submissão?"
          message={`${confirmAnular.length} pedido${confirmAnular.length === 1 ? "" : "s"} vão voltar a "programado"`}
          detail={
            <p>Apaga as OPs criadas para pedidos que <b>ainda não foram iniciados</b>. Pedidos com OP em curso ou com progresso não são afectados.</p>
          }
          confirmLabel="Anular"
          variant="warning"
          onCancel={() => setConfirmAnular(null)}
          onConfirm={confirmarAnularSubmissao}
        />
      )}

      {confirmLimpar && (
        <ConfirmDialog
          title="Limpar semana?"
          message={`Desagendar ${confirmLimpar.length} pedido${confirmLimpar.length === 1 ? "" : "s"}`}
          detail={
            <p>Os pedidos voltam para "Por agendar" sem perder informação. Esta acção <b>não apaga OPs</b> já criadas.</p>
          }
          confirmLabel="Limpar"
          variant="danger"
          onCancel={() => setConfirmLimpar(null)}
          onConfirm={confirmarLimparSemana}
        />
      )}
    </div>
  );
}

function PedidoCard({ pedido, draggable, onDragStart, onDragEnd, dragging, onRemove, compact, showStockCp, prioridadeEfetiva, onClick, spanDias, qtyDoDia }: {
  pedido: PedidoProducao;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  onRemove?: () => void;
  compact?: boolean;
  showStockCp?: boolean;
  prioridadeEfetiva?: PrioridadeOP;
  onClick?: () => void;
  spanDias?: number; // se >1, sinaliza que ocupa N dias
  qtyDoDia?: number; // qty distribuída por dia
}) {
  const prio = prioridadeEfetiva ?? pedido.prioridade;
  const prioAjustada = prioridadeEfetiva !== undefined && prioridadeEfetiva !== pedido.prioridade;
  const disp = (pedido.stock_existente ?? 0) - (pedido.reservas_existentes ?? 0);
  const cons = pedido.consumos_6m ?? 0;
  const meses = cons > 0 ? Math.max(0, Math.round((disp * 6) / cons)) : null;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "cursor-grab rounded-lg border-2 bg-white p-2 text-[11px] shadow-sm transition-all hover:shadow-md active:cursor-grabbing",
        dragging && "opacity-40",
        "border-slate-200"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span
              className={cn("shrink-0 rounded border px-1 py-0.5 text-[9px] font-extrabold", PRIORIDADE_OP_COR[prio])}
              title={prioAjustada ? `Original: ${PRIORIDADE_OP_LABEL[pedido.prioridade]} — ajustada em cascata` : undefined}
            >
              {PRIORIDADE_OP_LABEL[prio] ?? prio}{prioAjustada && <span className="ml-0.5 opacity-60">↓</span>}
            </span>
            {pedido.numero && (
              <span className="truncate font-mono text-[10px] font-bold text-slate-500" title={`PP ${pedido.numero}`}>{pedido.numero}</span>
            )}
            {pedido.produto_codigo && pedido.produto_codigo !== pedido.numero && (
              <span className="truncate font-mono text-[10px] font-bold text-slate-400" title={`Ref ${pedido.produto_codigo}`}>{pedido.produto_codigo}</span>
            )}
            {/* Chip StockCP/MP */}
            {pedido.stock_status === "ok" && (
              <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[9px] font-extrabold text-emerald-700" title="Stock CP/MP OK">CP ✓</span>
            )}
            {pedido.stock_status === "pendente" && (
              <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[9px] font-extrabold text-amber-800" title="Falta stock de componentes / matéria-prima">CP ⚠</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs font-extrabold text-slate-900" title={pedido.produto_nome}>
            {pedido.produto_nome}
          </p>
          {pedido.cliente && (
            <p className="truncate text-[10px] font-bold text-slate-500" title={pedido.cliente}>{pedido.cliente}</p>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold flex-wrap">
            {spanDias && spanDias > 1 && qtyDoDia !== undefined ? (
              <span className="rounded bg-sky-100 px-1 text-sky-700" title={`Total ${pedido.quantidade_alvo} un · ${spanDias} dias`}>
                {qtyDoDia}/{pedido.quantidade_alvo} un · {spanDias}d
              </span>
            ) : (
              <span className="rounded bg-slate-100 px-1 text-slate-700">{pedido.quantidade_alvo} un</span>
            )}
            {pedido.tipo_linha && (() => {
              const label = pedido.tipo_linha === "termoformadora" ? "Termo"
                : pedido.tipo_linha === "manual" ? "Manual"
                : pedido.tipo_linha === "stock" ? "Stock"
                : pedido.tipo_linha === "campos" ? "Campos"
                : pedido.tipo_linha;
              const cls = pedido.tipo_linha === "termoformadora" ? "bg-purple-100 text-purple-700"
                : pedido.tipo_linha === "manual" ? "bg-sky-100 text-sky-700"
                : pedido.tipo_linha === "stock" ? "bg-slate-200 text-slate-700"
                : pedido.tipo_linha === "campos" ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-600";
              return <span className={cn("rounded px-1 font-extrabold", cls)} title={`Linha: ${label}`}>{label}</span>;
            })()}
            {pedido.fim_previsto && (() => {
              const d = new Date(pedido.fim_previsto);
              const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
              const diff = Math.ceil((d.getTime() - hoje.getTime()) / 86400000);
              const cls = diff < 0 ? "bg-red-100 text-red-700" : diff <= 3 ? "bg-orange-100 text-orange-700" : diff <= 7 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600";
              return (
                <span className={cn("rounded px-1", cls)} title="Entrega pretendida">
                  📅 {fmtDate(d)}
                </span>
              );
            })()}
            {meses !== null && (
              <span className={cn("rounded px-1", meses <= 0 ? "bg-red-100 text-red-700" : meses < 1 ? "bg-orange-100 text-orange-700" : meses <= 3 ? "bg-slate-100 text-slate-700" : "bg-emerald-100 text-emerald-700")}>
                {meses}m stock
              </span>
            )}
            {showStockCp && pedido.reservas_existentes !== null && pedido.reservas_existentes !== undefined && pedido.reservas_existentes > 0 && (
              <span className="rounded bg-slate-100 px-1 text-slate-600">{pedido.reservas_existentes} res.</span>
            )}
          </div>
        </div>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
            title="Remover do dia"
          >✕</button>
        )}
      </div>
    </div>
  );
}
