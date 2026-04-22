"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRealtimeTable, notifyMutation } from "@/hooks/use-realtime-table";
import { usePessoaSession, logAction } from "@/hooks/use-pessoa-session";
import { ClockDisplay } from "@/components/clock-display";
import { cn } from "@/lib/utils";
import { ZONA_LABEL, PRIORIDADE_OP_COR, PRIORIDADE_OP_LABEL, ESTADO_OP_LABEL, ESTADO_OP_COR } from "@/lib/constants";
import type {
  OrdemProducao,
  PedidoProducao,
  RotulagemInspecao,
  CqInspecao,
  NaoConformidade,
  ResultadoRotulagem,
  ResultadoCq,
  CqChecklistItem,
  AuditLog,
} from "@/lib/types";

interface Props {
  ops: OrdemProducao[];
  pedidos: PedidoProducao[];
  initialRotulagem: RotulagemInspecao[];
  initialCq: CqInspecao[];
  initialNcs: NaoConformidade[];
}

const DIAS_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function startOfWeekMonday(d: Date) {
  const r = new Date(d);
  r.setHours(12, 0, 0, 0);
  const day = r.getDay() || 7;
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

export function QualidadeTvPanel({ ops: initialOps, pedidos: initialPedidos, initialRotulagem, initialCq, initialNcs }: Props) {
  const { session } = usePessoaSession();
  const { items: ops } = useRealtimeTable<OrdemProducao>("ordens_producao", initialOps, { orderBy: "updated_at", ascending: false });
  const { items: pedidos } = useRealtimeTable<PedidoProducao>("pedidos_producao", initialPedidos, { orderBy: "updated_at", ascending: false });
  const { items: rotulagem } = useRealtimeTable<RotulagemInspecao>("rotulagem_inspecoes", initialRotulagem, { orderBy: "created_at", ascending: false });
  const { items: cq } = useRealtimeTable<CqInspecao>("cq_inspecoes", initialCq, { orderBy: "created_at", ascending: false });
  const { items: ncs } = useRealtimeTable<NaoConformidade>("nao_conformidades", initialNcs, { orderBy: "created_at", ascending: false });

  // Pedidos de manutenção recentes (audit_log com acao=manutencao_solicitada, últimas 24h)
  const [manutencaoPedidos, setManutencaoPedidos] = useState<AuditLog[]>([]);
  useEffect(() => {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fetch = () => supabase
      .from("audit_log")
      .select("*")
      .eq("acao", "manutencao_solicitada")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setManutencaoPedidos(data as AuditLog[]); });
    fetch();
    const ch = supabase.channel("audit-manutencao-q")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const [semanaOffset, setSemanaOffset] = useState(0);
  const [rotInspecao, setRotInspecao] = useState<OrdemProducao | null>(null);
  const [cqInspecao, setCqInspecao] = useState<{ op: OrdemProducao; pendente: CqInspecao | null } | null>(null);

  const { weekStart, days } = useMemo(() => {
    const base = addDays(startOfWeekMonday(new Date()), semanaOffset * 7);
    const ds = Array.from({ length: 5 }, (_, i) => addDays(base, i));
    return { weekStart: base, days: ds };
  }, [semanaOffset]);

  const pedidoPorId = useMemo(() => {
    const m = new Map<string, PedidoProducao>();
    for (const p of pedidos) m.set(p.id, p);
    return m;
  }, [pedidos]);

  // Planeado: pedidos com data_agendada nesta semana
  const planeadoPorDia = useMemo(() => {
    const arr: PedidoProducao[][] = Array.from({ length: 5 }, () => []);
    for (const p of pedidos) {
      if (!p.data_agendada) continue;
      if (p.estado === "concluido" || p.estado === "cancelado") continue;
      const d = new Date(p.data_agendada);
      for (let i = 0; i < 5; i++) if (isSameDay(d, days[i])) { arr[i].push(p); break; }
    }
    return arr;
  }, [pedidos, days]);

  // Rotulagem pendente: OPs cujo pedido tem precisa_rotulagem e ainda não foram inspeccionadas
  // (aparece logo que o pedido é submetido — estados planeada/em_curso/concluida).
  // Excluímos cancelada e agrupamos por pedido_id para evitar duplicados quando há várias OPs.
  const rotulagemPendente = useMemo(() => {
    const jaFeitas = new Set(rotulagem.filter((i) => i.resultado !== "pendente").map((i) => i.op_id));
    const opsFiltradas = ops.filter((o) => {
      if (o.estado === "cancelada") return false;
      if (jaFeitas.has(o.id)) return false;
      const ped = o.pedido_id ? pedidoPorId.get(o.pedido_id) : null;
      return ped?.precisa_rotulagem === true;
    });
    // Ordena por estado (concluida → em_curso → planeada) e depois por fim_previsto
    const ordemEstado: Record<string, number> = { concluida: 0, em_curso: 1, planeada: 2, pausada: 3 };
    return opsFiltradas.sort((a, b) => {
      const ea = ordemEstado[a.estado] ?? 9;
      const eb = ordemEstado[b.estado] ?? 9;
      if (ea !== eb) return ea - eb;
      const fa = a.fim_previsto ? new Date(a.fim_previsto).getTime() : Infinity;
      const fb = b.fim_previsto ? new Date(b.fim_previsto).getTime() : Infinity;
      return fa - fb;
    });
  }, [ops, rotulagem, pedidoPorId]);

  // CQ solicitado: inspecoes com resultado=pendente (criadas pelo operador via "Solicitar CQ")
  const cqSolicitado = useMemo(() => {
    const pendentes = cq.filter((i) => i.resultado === "pendente");
    const opsMap = new Map<string, OrdemProducao>();
    for (const o of ops) opsMap.set(o.id, o);
    return pendentes
      .map((i) => ({ inspecao: i, op: i.op_id ? opsMap.get(i.op_id) ?? null : null }))
      .filter((x): x is { inspecao: CqInspecao; op: OrdemProducao } => x.op !== null);
  }, [cq, ops]);

  const ncsAbertas = useMemo(() => ncs.filter((n) => n.estado !== "fechada" && n.estado !== "cancelada"), [ncs]);

  const kpis = useMemo(() => {
    const totalRot = rotulagem.length;
    const aprovRot = rotulagem.filter((i) => i.resultado === "aprovado").length;
    const totalCq = cq.filter((i) => i.resultado !== "pendente").length;
    const aprovCq = cq.filter((i) => i.resultado === "aprovado").length;
    return {
      rotPct: totalRot > 0 ? (aprovRot / totalRot) * 100 : 100,
      cqPct: totalCq > 0 ? (aprovCq / totalCq) * 100 : 100,
      ncsAbertas: ncsAbertas.length,
      ncsCriticas: ncsAbertas.filter((n) => n.severidade === "critica").length,
    };
  }, [rotulagem, cq, ncsAbertas]);

  const semanaTotal = planeadoPorDia.reduce((acc, lst) => acc + lst.length, 0);

  return (
    <div className="flex h-dvh flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" title="Voltar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Qualidade</p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Dashboard Qualidade</h1>
            <p className="text-sm font-bold text-slate-500">Planeamento · Rótulos · Controlo de Qualidade</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSemanaOffset((s) => s - 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-slate-200">← Semana</button>
          <button onClick={() => setSemanaOffset(0)} className={cn("rounded-lg px-3 py-1.5 text-xs font-extrabold", semanaOffset === 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>Hoje</button>
          <button onClick={() => setSemanaOffset((s) => s + 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-slate-200">Semana →</button>
          <div className="ml-2 text-sm font-black text-slate-800">{fmtDate(weekStart)} — {fmtDate(addDays(weekStart, 4))}</div>
          <ClockDisplay />
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <KpiCard label="Pedidos na semana" value={String(semanaTotal)} color="slate" />
        <KpiCard label="Rotulagem pendente" value={String(rotulagemPendente.length)} color={rotulagemPendente.length > 0 ? "amber" : "emerald"} />
        <KpiCard label="CQ/Manutenção solicitado" value={String(cqSolicitado.length + manutencaoPedidos.length)} color={(cqSolicitado.length + manutencaoPedidos.length) > 0 ? "sky" : "emerald"} />
        <KpiCard label="NC abertas" value={String(kpis.ncsAbertas)} color={kpis.ncsAbertas > 0 ? "red" : "emerald"} sub={kpis.ncsCriticas > 0 ? `${kpis.ncsCriticas} críticas` : undefined} />
        <KpiCard label="Aprovação CQ" value={`${kpis.cqPct.toFixed(0)}%`} color={kpis.cqPct >= 95 ? "emerald" : kpis.cqPct >= 80 ? "amber" : "red"} />
      </div>

      {/* Grid 3 colunas: Planeado | Rotulagem | CQ */}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 p-3">
        {/* Planeado da semana */}
        <Section title="📅 Planeado da semana" badge={`${semanaTotal} pedidos`}>
          <PlaneadoCarousel days={days} planeadoPorDia={planeadoPorDia} />
        </Section>

        {/* Rotulagem */}
        <Section title="🏷️ Rotulagem pendente" badge={`${rotulagemPendente.length}`} accent="lime">
          <RotulagemCarousel ops={rotulagemPendente} pedidoPorId={pedidoPorId} />
        </Section>

        {/* CQ / Manutenção */}
        <Section title="🔍 CQ / Manutenção solicitado" badge={`${cqSolicitado.length + manutencaoPedidos.length}`} accent="sky">
          <CqManutencaoCarousel cqSolicitado={cqSolicitado} manutencaoPedidos={manutencaoPedidos} pedidoPorId={pedidoPorId} onClickCq={(cq) => setCqInspecao(cq)} />
        </Section>
      </div>

      {rotInspecao && <FormRotulagem op={rotInspecao} onClose={() => setRotInspecao(null)} pessoa={session} />}
      {cqInspecao && <FormCq op={cqInspecao.op} pendente={cqInspecao.pendente} onClose={() => setCqInspecao(null)} pessoa={session} />}
    </div>
  );
}

function Section({ title, badge, accent = "slate", children }: { title: string; badge?: string; accent?: "slate" | "lime" | "sky"; children: React.ReactNode }) {
  const borderCls = accent === "lime" ? "border-lime-200" : accent === "sky" ? "border-sky-200" : "border-slate-200";
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border-2 bg-white", borderCls)}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        {badge && <span className="rounded bg-white px-2.5 py-1 text-xs font-extrabold text-slate-700">{badge}</span>}
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: "slate" | "emerald" | "amber" | "sky" | "red" }) {
  const cls = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    red: "border-red-200 bg-red-50 text-red-700",
  }[color];
  return (
    <div className={cn("rounded-xl border-2 p-4", cls)}>
      <p className="text-sm font-extrabold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-4xl font-black">{value}</p>
      {sub && <p className="mt-0.5 text-xs font-bold opacity-80">{sub}</p>}
    </div>
  );
}

const ROTULAGEM_PER_PAGE = 4;
const ROTULAGEM_ROTATION_SECONDS = 15;

function PlaneadoCarousel({ days, planeadoPorDia }: { days: Date[]; planeadoPorDia: PedidoProducao[][] }) {
  const flat = useMemo(() => {
    const arr: { pedido: PedidoProducao; diaIdx: number; dia: Date }[] = [];
    for (let i = 0; i < days.length; i++) {
      for (const p of planeadoPorDia[i]) arr.push({ pedido: p, diaIdx: i, dia: days[i] });
    }
    return arr;
  }, [days, planeadoPorDia]);

  const totalPages = Math.max(1, Math.ceil(flat.length / ROTULAGEM_PER_PAGE));
  const needsCarousel = totalPages > 1;
  const [page, setPage] = useState(0);

  useEffect(() => { if (page >= totalPages) setPage(0); }, [page, totalPages]);
  useEffect(() => {
    if (!needsCarousel) return;
    const id = setInterval(() => setPage((p) => (p + 1) % totalPages), ROTULAGEM_ROTATION_SECONDS * 1000);
    return () => clearInterval(id);
  }, [needsCarousel, totalPages]);

  const pageRows = flat.slice(page * ROTULAGEM_PER_PAGE, (page + 1) * ROTULAGEM_PER_PAGE);

  if (flat.length === 0) {
    return <div className="flex-1 p-2"><p className="py-12 text-center text-sm font-bold text-slate-400">Nada planeado 🎉</p></div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {needsCarousel && (
        <div className="flex items-center justify-end border-b border-slate-100 bg-slate-50/60 px-3 py-1">
          <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">{page + 1}/{totalPages}</span>
        </div>
      )}
      {needsCarousel && (
        <div className="h-1 w-full bg-slate-100">
          <div key={`${page}-${totalPages}`} className="h-full bg-blue-400" style={{ animation: `progressFill ${ROTULAGEM_ROTATION_SECONDS}s linear` }} />
        </div>
      )}
      <ul className="grid min-h-0 flex-1 grid-rows-4 gap-2 overflow-hidden p-2">
        {pageRows.map((r, idx) => {
          const p = r.pedido;
          const hoje = isSameDay(r.dia, new Date());
          return (
            <li key={`p-${p.id}-${idx}`} className="flex min-h-0 flex-col justify-center gap-1 overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
              <div className="flex w-full flex-wrap items-center gap-1.5">
                <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-sm font-extrabold text-white shrink-0" title="Referência do produto">{p.produto_codigo ?? "—"}</span>
                <span className={cn("rounded border px-2 py-0.5 text-xs font-extrabold shrink-0 capitalize", PRIORIDADE_OP_COR[p.prioridade])}>{PRIORIDADE_OP_LABEL[p.prioridade]}</span>
                {p.precisa_rotulagem && <span className="rounded bg-lime-100 px-2 py-0.5 text-xs font-extrabold text-lime-700 shrink-0">🏷 rotul.</span>}
                <span className={cn("ml-auto rounded px-2 py-0.5 text-xs font-black uppercase tracking-wider shrink-0", hoje ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600")}>
                  {DIAS_LABEL[r.diaIdx]} {fmtDate(r.dia)}{hoje && " · HOJE"}
                </span>
              </div>
              <p className="truncate text-xl font-black text-slate-900 leading-tight">{p.produto_nome}</p>
              <p className="truncate text-sm font-bold text-slate-500">{p.cliente ?? "—"}</p>
              <div className="flex w-full flex-wrap items-center gap-1.5 text-xs font-bold">
                {p.ficha_producao && <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono font-extrabold text-indigo-700 shrink-0" title="Ficha de Produção">FP {p.ficha_producao}</span>}
                {p.numero && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono font-extrabold text-sky-700 shrink-0" title="Pedido de Produção">PP {p.numero}</span>}
                <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 font-extrabold text-slate-700 shrink-0">{p.quantidade_alvo} un</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RotulagemCarousel({ ops, pedidoPorId }: { ops: OrdemProducao[]; pedidoPorId: Map<string, PedidoProducao> }) {
  const totalPages = Math.max(1, Math.ceil(ops.length / ROTULAGEM_PER_PAGE));
  const needsCarousel = totalPages > 1;
  const [page, setPage] = useState(0);

  useEffect(() => { if (page >= totalPages) setPage(0); }, [page, totalPages]);

  useEffect(() => {
    if (!needsCarousel) return;
    const id = setInterval(() => setPage((p) => (p + 1) % totalPages), ROTULAGEM_ROTATION_SECONDS * 1000);
    return () => clearInterval(id);
  }, [needsCarousel, totalPages]);

  if (ops.length === 0) {
    return <div className="flex-1 p-2"><p className="py-12 text-center text-sm font-bold text-slate-400">Tudo inspeccionado 🎉</p></div>;
  }

  const pageOps = ops.slice(page * ROTULAGEM_PER_PAGE, (page + 1) * ROTULAGEM_PER_PAGE);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Badge de página */}
      {needsCarousel && (
        <div className="flex items-center justify-end border-b border-slate-100 bg-slate-50/60 px-3 py-1">
          <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">{page + 1}/{totalPages}</span>
        </div>
      )}

      {/* Progress bar do carrossel */}
      {needsCarousel && (
        <div className="h-1 w-full bg-slate-100">
          <div
            key={`${page}-${totalPages}`}
            className="h-full bg-blue-400"
            style={{ animation: `progressFill ${ROTULAGEM_ROTATION_SECONDS}s linear` }}
          />
        </div>
      )}

      <ul className="grid min-h-0 flex-1 grid-rows-4 gap-2 overflow-hidden p-2">
        {pageOps.map((op) => {
          const ped = op.pedido_id ? pedidoPorId.get(op.pedido_id) : null;
          return (
            <li key={op.id} className="flex min-h-0 flex-col justify-center gap-1 overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
              <div className="flex w-full flex-wrap items-center gap-1.5">
                <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-sm font-extrabold text-white shrink-0" title="Referência do produto">{op.produto_codigo ?? "—"}</span>
                <span className={cn("rounded border px-2 py-0.5 text-xs font-extrabold shrink-0", ESTADO_OP_COR[op.estado] ?? "bg-slate-100 text-slate-700 border-slate-200")}>
                  {ESTADO_OP_LABEL[op.estado] ?? op.estado}
                </span>
                {op.lote ? (
                  <span className="rounded bg-lime-100 px-2 py-0.5 font-mono text-xs font-extrabold text-lime-700 shrink-0" title="Lote">LT {op.lote}</span>
                ) : (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-700 shrink-0">sem lote</span>
                )}
                <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-700 shrink-0">{op.quantidade_atual}/{op.quantidade_alvo}</span>
              </div>
              <p className="truncate text-xl font-black text-slate-900 leading-tight">{op.produto_nome}</p>
              <p className="truncate text-sm font-bold text-slate-500">{op.cliente ?? ped?.cliente ?? "—"} · {ZONA_LABEL[op.zona_id] ?? op.zona_id}</p>
              <div className="flex w-full flex-wrap items-center gap-1.5 text-xs font-bold">
                {ped?.ficha_producao && <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono font-extrabold text-indigo-700 shrink-0" title="Ficha de Produção">FP {ped.ficha_producao}</span>}
                {ped?.numero && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono font-extrabold text-sky-700 shrink-0" title="Pedido de Produção">PP {ped.numero}</span>}
                {op.numero && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono font-extrabold text-violet-700 shrink-0" title="Ordem de Produção">OP {op.numero}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type CqItem = { kind: "cq"; inspecao: CqInspecao; op: OrdemProducao } | { kind: "manu"; log: AuditLog };

function CqManutencaoCarousel({ cqSolicitado, manutencaoPedidos, pedidoPorId, onClickCq }: {
  cqSolicitado: { inspecao: CqInspecao; op: OrdemProducao }[];
  manutencaoPedidos: AuditLog[];
  pedidoPorId: Map<string, PedidoProducao>;
  onClickCq: (cq: { op: OrdemProducao; pendente: CqInspecao }) => void;
}) {
  const flat = useMemo<CqItem[]>(() => {
    const arr: CqItem[] = [];
    for (const c of cqSolicitado) arr.push({ kind: "cq", inspecao: c.inspecao, op: c.op });
    for (const l of manutencaoPedidos) arr.push({ kind: "manu", log: l });
    return arr;
  }, [cqSolicitado, manutencaoPedidos]);

  const totalPages = Math.max(1, Math.ceil(flat.length / ROTULAGEM_PER_PAGE));
  const needsCarousel = totalPages > 1;
  const [page, setPage] = useState(0);

  useEffect(() => { if (page >= totalPages) setPage(0); }, [page, totalPages]);
  useEffect(() => {
    if (!needsCarousel) return;
    const id = setInterval(() => setPage((p) => (p + 1) % totalPages), ROTULAGEM_ROTATION_SECONDS * 1000);
    return () => clearInterval(id);
  }, [needsCarousel, totalPages]);

  if (flat.length === 0) {
    return <div className="flex-1 p-2"><p className="py-12 text-center text-sm font-bold text-slate-400">Sem pedidos pendentes 🎉</p></div>;
  }

  const pageItems = flat.slice(page * ROTULAGEM_PER_PAGE, (page + 1) * ROTULAGEM_PER_PAGE);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {needsCarousel && (
        <div className="flex items-center justify-end border-b border-slate-100 bg-slate-50/60 px-3 py-1">
          <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">{page + 1}/{totalPages}</span>
        </div>
      )}
      {needsCarousel && (
        <div className="h-1 w-full bg-slate-100">
          <div key={`${page}-${totalPages}`} className="h-full bg-blue-400" style={{ animation: `progressFill ${ROTULAGEM_ROTATION_SECONDS}s linear` }} />
        </div>
      )}
      <ul className="grid min-h-0 flex-1 grid-rows-4 gap-2 overflow-hidden p-2">
        {pageItems.map((it, idx) => {
          if (it.kind === "cq") {
            const { inspecao, op } = it;
            const ped = op.pedido_id ? pedidoPorId.get(op.pedido_id) : null;
            return (
              <li key={`cq-${inspecao.id}-${idx}`}>
                <button onClick={() => onClickCq({ op, pendente: inspecao })} className="flex h-full w-full min-h-0 flex-col justify-center gap-1 overflow-hidden rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left shadow-sm hover:border-sky-400 hover:bg-sky-100">
                  <div className="flex w-full flex-wrap items-center gap-1.5">
                    <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-sm font-extrabold text-white shrink-0" title="Referência do produto">{op.produto_codigo ?? "—"}</span>
                    <span className="rounded bg-sky-600 px-2 py-0.5 text-xs font-extrabold text-white shrink-0">CQ SOLICITADO</span>
                    {op.lote ? (
                      <span className="rounded bg-lime-100 px-2 py-0.5 font-mono text-xs font-extrabold text-lime-700 shrink-0" title="Lote">LT {op.lote}</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-700 shrink-0">sem lote</span>
                    )}
                    <span className="ml-auto text-xs font-bold text-slate-500 shrink-0" suppressHydrationWarning>{new Date(inspecao.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="truncate text-xl font-black text-slate-900 leading-tight">{op.produto_nome}</p>
                  <p className="truncate text-sm font-bold text-slate-500">{op.cliente ?? ped?.cliente ?? "—"} · {ZONA_LABEL[op.zona_id] ?? op.zona_id}</p>
                  <div className="flex w-full flex-wrap items-center gap-1.5 text-xs font-bold">
                    {ped?.ficha_producao && <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono font-extrabold text-indigo-700 shrink-0" title="Ficha de Produção">FP {ped.ficha_producao}</span>}
                    {ped?.numero && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono font-extrabold text-sky-700 shrink-0" title="Pedido de Produção">PP {ped.numero}</span>}
                    {op.numero && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono font-extrabold text-violet-700 shrink-0" title="Ordem de Produção">OP {op.numero}</span>}
                  </div>
                </button>
              </li>
            );
          }
          const log = it.log;
          const det = (log.detalhes as Record<string, string> | null) ?? null;
          return (
            <li key={`manu-${log.id}-${idx}`} className="flex min-h-0 flex-col justify-center gap-1 overflow-hidden rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 shadow-sm">
              <div className="flex w-full flex-wrap items-center gap-1.5">
                {det?.produto_codigo && <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-sm font-extrabold text-white shrink-0" title="Referência do produto">{det.produto_codigo}</span>}
                <span className="rounded bg-orange-600 px-2 py-0.5 text-xs font-extrabold text-white shrink-0">🔧 MANUTENÇÃO</span>
                {det?.lote && <span className="rounded bg-lime-100 px-2 py-0.5 font-mono text-xs font-extrabold text-lime-700 shrink-0" title="Lote">LT {det.lote}</span>}
                <span className="ml-auto text-xs font-bold text-slate-500 shrink-0" suppressHydrationWarning>{new Date(log.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="truncate text-xl font-black text-slate-900 leading-tight">{det?.produto ?? "—"}</p>
              <p className="truncate text-sm font-bold text-slate-500">{log.pessoa_nome ?? "—"} · {log.zona_id ? (ZONA_LABEL[log.zona_id as keyof typeof ZONA_LABEL] ?? log.zona_id) : "—"}</p>
              <div className="flex w-full flex-wrap items-center gap-1.5 text-xs font-bold">
                {det?.pp_numero && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono font-extrabold text-sky-700 shrink-0" title="Pedido de Produção">PP {det.pp_numero}</span>}
                {det?.op_numero && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono font-extrabold text-violet-700 shrink-0" title="Ordem de Produção">OP {det.op_numero}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HistoricoRotulagem({ lista }: { lista: RotulagemInspecao[] }) {
  const feitas = lista.filter((i) => i.resultado !== "pendente").slice(0, 5);
  if (feitas.length === 0) return null;
  return (
    <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
      <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">Últimas inspeções</p>
      <ul className="space-y-0.5">
        {feitas.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-bold text-slate-600">{i.lote ?? "—"} · {i.pessoa_nome ?? "—"}</span>
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-extrabold", corRotulagem(i.resultado))}>{labelRotulagem(i.resultado)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NcsAbertas({ lista }: { lista: NaoConformidade[] }) {
  if (lista.length === 0) return null;
  return (
    <div className="border-t border-slate-200 bg-red-50/50 px-3 py-2">
      <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-red-700">Não-conformidades abertas</p>
      <ul className="space-y-0.5">
        {lista.slice(0, 4).map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-bold text-slate-700" title={n.descricao}>{n.numero ?? "NC"} · {n.descricao.slice(0, 40)}{n.descricao.length > 40 ? "…" : ""}</span>
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-extrabold", corSeveridade(n.severidade))}>{n.severidade}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelRotulagem(r: ResultadoRotulagem) {
  return { aprovado: "Aprovado", reetiquetar: "Reetiq.", descartar: "Descart.", pendente: "Pendente" }[r];
}
function corRotulagem(r: ResultadoRotulagem) {
  return { aprovado: "bg-emerald-100 text-emerald-700", reetiquetar: "bg-amber-100 text-amber-700", descartar: "bg-red-100 text-red-700", pendente: "bg-slate-100 text-slate-700" }[r];
}
function corSeveridade(s: string) {
  return ({ baixa: "bg-slate-100 text-slate-700", media: "bg-amber-100 text-amber-700", alta: "bg-orange-100 text-orange-700", critica: "bg-red-100 text-red-700" } as Record<string, string>)[s] ?? "bg-slate-100 text-slate-700";
}

/* ===== Form Rotulagem (compacto) ===== */
const CHECKS_ROT: Array<{ id: keyof Pick<RotulagemInspecao, "check_lote" | "check_validade" | "check_ref_cliente" | "check_idioma" | "check_quantidade">; label: string }> = [
  { id: "check_lote", label: "Lote impresso correto" },
  { id: "check_validade", label: "Validade visível" },
  { id: "check_ref_cliente", label: "Ref. cliente confere" },
  { id: "check_idioma", label: "Idioma correto" },
  { id: "check_quantidade", label: "Quantidade confere" },
];

function FormRotulagem({ op, onClose, pessoa }: { op: OrdemProducao; onClose: () => void; pessoa: { pessoaId: string; pessoaNome: string } | null }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [lote, setLote] = useState(op.lote ?? "");
  const [qtdRee, setQtdRee] = useState(0);
  const [qtdDesc, setQtdDesc] = useState(0);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const total = CHECKS_ROT.length;
  const okCount = CHECKS_ROT.filter((c) => checks[c.id]).length;
  const resultado: ResultadoRotulagem = qtdDesc > 0 ? "descartar" : qtdRee > 0 ? "reetiquetar" : okCount === total ? "aprovado" : "pendente";

  async function gravar() {
    setSaving(true);
    const { error } = await supabase.from("rotulagem_inspecoes").insert({
      op_id: op.id,
      pedido_id: op.pedido_id,
      lote: lote || null,
      check_lote: !!checks.check_lote,
      check_validade: !!checks.check_validade,
      check_ref_cliente: !!checks.check_ref_cliente,
      check_idioma: !!checks.check_idioma,
      check_quantidade: !!checks.check_quantidade,
      resultado,
      qtd_reetiquetada: qtdRee,
      qtd_descartada: qtdDesc,
      pessoa_id: pessoa?.pessoaId ?? null,
      pessoa_nome: pessoa?.pessoaNome ?? null,
      notas: notas || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    notifyMutation("rotulagem_inspecoes");
    await logAction({ pessoaId: pessoa?.pessoaId ?? null, pessoaNome: pessoa?.pessoaNome ?? null, acao: "rotulagem_inspecao", alvoTabela: "rotulagem_inspecoes", alvoId: op.id, detalhes: { resultado, qtdRee, qtdDesc } });
    toast.success("Inspeção registada");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-lime-700">🏷 Rotulagem</p>
            <h2 className="text-lg font-black text-slate-900">{op.produto_nome}</h2>
            <p className="text-xs font-bold text-slate-500">{op.cliente ?? "—"} · OP {op.numero ?? "—"}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        <label className="text-[10px] font-extrabold uppercase text-slate-500">Lote</label>
        <input value={lote} onChange={(e) => setLote(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" placeholder="ex: L2604-001" />

        <ul className="mb-3 space-y-1.5">
          {CHECKS_ROT.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100">
                <input type="checkbox" checked={!!checks[c.id]} onChange={(e) => setChecks((s) => ({ ...s, [c.id]: e.target.checked }))} className="h-5 w-5" />
                {c.label}
              </label>
            </li>
          ))}
        </ul>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-extrabold uppercase text-amber-700">Reetiquetar</label>
            <input type="number" min={0} value={qtdRee} onChange={(e) => setQtdRee(Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm font-bold" />
          </div>
          <div>
            <label className="text-[10px] font-extrabold uppercase text-red-700">Descartar</label>
            <input type="number" min={0} value={qtdDesc} onChange={(e) => setQtdDesc(Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-bold" />
          </div>
        </div>

        <label className="text-[10px] font-extrabold uppercase text-slate-500">Notas</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" />

        <div className="flex items-center justify-between">
          <span className={cn("rounded px-2 py-1 text-xs font-extrabold", corRotulagem(resultado))}>{labelRotulagem(resultado)}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button onClick={gravar} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "A gravar…" : "Registar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Form CQ (compacto) ===== */
const CHECKLIST_CQ: CqChecklistItem[] = [
  { descricao: "Material conforme especificação", ok: false },
  { descricao: "Costuras/selagem íntegras", ok: false },
  { descricao: "Dimensões corretas", ok: false },
  { descricao: "Sem contaminação visível", ok: false },
  { descricao: "Embalagem primária OK", ok: false },
];

function FormCq({ op, pendente, onClose, pessoa }: { op: OrdemProducao; pendente: CqInspecao | null; onClose: () => void; pessoa: { pessoaId: string; pessoaNome: string } | null }) {
  const [checklist, setChecklist] = useState<CqChecklistItem[]>(
    (pendente?.checklist && pendente.checklist.length > 0 ? pendente.checklist : CHECKLIST_CQ).map((c) => ({ ...c, ok: false }))
  );
  const [tamanhoAmostra, setTamanhoAmostra] = useState(pendente?.tamanho_amostra ?? 5);
  const [notas, setNotas] = useState(pendente?.notas ?? "");
  const [forcado, setForcado] = useState<ResultadoCq | "">("");
  const [saving, setSaving] = useState(false);

  const okCount = checklist.filter((c) => c.ok).length;
  const resultado: ResultadoCq = forcado || (okCount === checklist.length ? "aprovado" : okCount === 0 ? "pendente" : "condicionado");

  async function gravar() {
    if (resultado === "pendente") { toast.error("Marca pelo menos 1 item ou força o resultado"); return; }
    setSaving(true);
    const payload = {
      tamanho_amostra: tamanhoAmostra,
      checklist: checklist as unknown as Record<string, unknown>[],
      resultado,
      pessoa_id: pessoa?.pessoaId ?? null,
      pessoa_nome: pessoa?.pessoaNome ?? null,
      notas: notas || null,
    };
    let error;
    if (pendente) {
      ({ error } = await supabase.from("cq_inspecoes").update(payload).eq("id", pendente.id));
    } else {
      ({ error } = await supabase.from("cq_inspecoes").insert({ op_id: op.id, pedido_id: op.pedido_id, produto_codigo: op.produto_codigo, ...payload }));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    notifyMutation("cq_inspecoes");
    await logAction({ pessoaId: pessoa?.pessoaId ?? null, pessoaNome: pessoa?.pessoaNome ?? null, acao: "cq_inspecao", alvoTabela: "cq_inspecoes", alvoId: op.id, detalhes: { resultado } });
    toast.success("Inspeção CQ registada");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-sky-700">🔍 Controlo de Qualidade</p>
            <h2 className="text-lg font-black text-slate-900">{op.produto_nome}</h2>
            <p className="text-xs font-bold text-slate-500">{op.cliente ?? "—"} · OP {op.numero ?? "—"}{pendente?.pessoa_nome && ` · solicitado por ${pendente.pessoa_nome}`}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        <label className="text-[10px] font-extrabold uppercase text-slate-500">Tamanho da amostra</label>
        <input type="number" min={1} value={tamanhoAmostra} onChange={(e) => setTamanhoAmostra(Math.max(1, Number(e.target.value) || 1))} className="mb-3 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" />

        <ul className="mb-3 space-y-1.5">
          {checklist.map((c, idx) => (
            <li key={idx}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100">
                <input type="checkbox" checked={c.ok} onChange={(e) => setChecklist((s) => s.map((it, i) => i === idx ? { ...it, ok: e.target.checked } : it))} className="h-5 w-5" />
                {c.descricao}
              </label>
            </li>
          ))}
        </ul>

        <label className="text-[10px] font-extrabold uppercase text-slate-500">Resultado</label>
        <select value={forcado} onChange={(e) => setForcado(e.target.value as ResultadoCq | "")} className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">
          <option value="">Auto: {resultado}</option>
          <option value="aprovado">Aprovado</option>
          <option value="condicionado">Condicionado</option>
          <option value="rejeitado">Rejeitado</option>
        </select>

        <label className="text-[10px] font-extrabold uppercase text-slate-500">Notas</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={gravar} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "A gravar…" : "Registar"}</button>
        </div>
      </div>
    </div>
  );
}
