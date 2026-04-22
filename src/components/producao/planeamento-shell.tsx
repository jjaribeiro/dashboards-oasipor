"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ClockDisplay } from "@/components/clock-display";
import { SessionBadge } from "@/components/dashboard-auth-gate";
import { usePessoaSession, logAction } from "@/hooks/use-pessoa-session";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { supabase } from "@/lib/supabase/client";
import { OPsTab } from "./planeamento-ops";
import { PedidosTab } from "./planeamento-pedidos";
import { PlaneamentoSemanalTab } from "./planeamento-semanal";
import { GanttTab } from "./planeamento-gantt";
import { EquipasTab } from "./planeamento-equipas";
import { PlaneamentoEOTab } from "./planeamento-eo";
import type { OrdemProducao, ZonaProducao, AuditLog, ProducaoRejeito, ProducaoPausa, MetaCategoria, PedidoProducao, Funcionario, PaleteEO, Produto } from "@/lib/types";

interface Props {
  initialZonas: ZonaProducao[];
  initialPedidos: PedidoProducao[];
  initialOPs: OrdemProducao[];
  initialAudit: AuditLog[];
  initialRejeitos: ProducaoRejeito[];
  initialPausas: ProducaoPausa[];
  initialMetas: MetaCategoria[];
  initialFuncionarios: Funcionario[];
  initialPaletes?: PaleteEO[];
  initialProdutos?: Produto[];
}

type TabId = "pedidos" | "planeamento_semanal" | "gantt" | "ops" | "equipas" | "eo";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "pedidos", label: "Pedidos de Produção", icon: "📥" },
  { id: "planeamento_semanal", label: "Planeamento Semanal", icon: "🗓" },
  { id: "gantt", label: "Gantt Semanal", icon: "📅" },
  { id: "ops", label: "Ordens de Produção", icon: "📋" },
  { id: "eo", label: "Planeamento EO", icon: "🧪" },
  { id: "equipas", label: "Equipas", icon: "👥" },
];

const VALID_TABS: TabId[] = ["pedidos", "planeamento_semanal", "gantt", "ops", "equipas", "eo"];

export function PlaneamentoShell({ initialZonas, initialPedidos, initialOPs, initialAudit, initialRejeitos, initialPausas, initialMetas, initialFuncionarios, initialPaletes = [], initialProdutos = [] }: Props) {
  // initialAudit/initialRejeitos/initialPausas mantidos na assinatura por compatibilidade — agora consumidos em /producao/kpis
  void initialAudit; void initialRejeitos; void initialPausas;
  // Tab persistida na URL (?tab=...) — resolve ANTES de renderizar o conteúdo para evitar flash
  const [tab, setTabState] = useState<TabId>("pedidos");
  const [tabResolved, setTabResolved] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("tab") as TabId | null;
    if (q && VALID_TABS.includes(q)) setTabState(q);
    setTabResolved(true);
  }, []);
  const setTab = (id: TabId) => {
    setTabState(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState({}, "", url.toString());
    }
  };
  const { session, logout } = usePessoaSession();

  // Realtime: cada tabela mantém-se sincronizada via WebSocket; fallback de polling 60s embebido no hook
  const { items: zonas } = useRealtimeTable<ZonaProducao>("zonas_producao", initialZonas, { orderBy: "ordem", ascending: true });
  const { items: pedidos, setItems: setPedidos } = useRealtimeTable<PedidoProducao>("pedidos_producao", initialPedidos, { orderBy: "updated_at", ascending: false });
  const { items: ops, setItems: setOps } = useRealtimeTable<OrdemProducao>("ordens_producao", initialOPs, { orderBy: "updated_at", ascending: false });
  const { items: audit } = useRealtimeTable<AuditLog>("audit_log", initialAudit, { orderBy: "created_at", ascending: false });
  const { items: rejeitos } = useRealtimeTable<ProducaoRejeito>("producao_rejeitos", initialRejeitos, { orderBy: "created_at", ascending: false });
  const { items: pausas } = useRealtimeTable<ProducaoPausa>("producao_pausas", initialPausas, { orderBy: "created_at", ascending: false });
  // Metas: sem id na tabela (PK = categoria) — subscrição manual a realtime para refletir mudanças de imediato
  const [metas, setMetas] = useState<MetaCategoria[]>(initialMetas);
  useEffect(() => {
    const channel = supabase
      .channel("producao_metas_categoria_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "producao_metas_categoria" }, (payload) => {
        setMetas((prev) => {
          const row = (payload.new ?? payload.old) as MetaCategoria;
          if (!row?.categoria) return prev;
          if (payload.eventType === "DELETE") return prev.filter((m) => m.categoria !== row.categoria);
          const idx = prev.findIndex((m) => m.categoria === row.categoria);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return [...prev, row];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* HEADER */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Produção — Planeamento</h1>
            <p className="text-xs font-bold text-slate-500">Importar, analisar e planear a produção</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ClockDisplay />
          {session && (
            <SessionBadge
              variant="inline"
              nome={session.pessoaNome}
              onLogout={() => {
                logAction({
                  pessoaId: session.pessoaId,
                  pessoaNome: session.pessoaNome,
                  acao: "logout_planeamento",
                });
                logout();
              }}
            />
          )}
        </div>
      </header>

      {/* TABS */}
      <div className="flex gap-1 border-b border-slate-200 bg-white px-6 py-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-t-lg border-b-2 px-4 py-2 text-sm font-extrabold transition-colors",
              tabResolved && tab === t.id
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* CONTENT — só renderiza depois de resolver o tab da URL para evitar flash em refresh */}
      <div className={cn("flex-1 p-4", tab === "equipas" || tab === "eo" ? "min-h-0 overflow-hidden" : "overflow-y-auto")}>
        {tabResolved && tab === "planeamento_semanal" && <PlaneamentoSemanalTab pedidos={pedidos} metas={metas} setPedidos={setPedidos} />}
        {tabResolved && tab === "gantt" && <GanttTab pedidos={pedidos} ops={ops} zonas={zonas} />}
        {tabResolved && tab === "pedidos" && <PedidosTab pedidos={pedidos} ops={ops} zonas={zonas} setPedidos={setPedidos} setOps={setOps} />}
        {tabResolved && tab === "ops" && <OPsTab ops={ops} pedidos={pedidos} zonas={zonas} setOps={setOps} />}
        {tabResolved && tab === "equipas" && <EquipasTab zonas={zonas} initialFuncionarios={initialFuncionarios} />}
        {tabResolved && tab === "eo" && <PlaneamentoEOTab ops={ops} setOps={setOps} initialPaletes={initialPaletes} initialProdutos={initialProdutos} />}
      </div>
    </div>
  );
}

/* ===== REJEITOS TAB ===== */
export function RejeitosTab({ rejeitos }: { rejeitos: ProducaoRejeito[] }) {
  const total = rejeitos.reduce((a, r) => a + r.quantidade, 0);
  const porMotivo = rejeitos.reduce<Record<string, number>>((acc, r) => {
    acc[r.motivo] = (acc[r.motivo] ?? 0) + r.quantidade;
    return acc;
  }, {});
  const porZona = rejeitos.reduce<Record<string, number>>((acc, r) => {
    const z = r.zona_id ?? "—";
    acc[z] = (acc[z] ?? 0) + r.quantidade;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total rejeitados (7d)" value={total.toString()} sub="unidades" tone="bad" />
        <StatCard label="Motivos distintos" value={Object.keys(porMotivo).length.toString()} tone="neutral" />
        <StatCard label="Zonas afetadas" value={Object.keys(porZona).length.toString()} tone="neutral" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <BreakdownCard title="Por motivo" items={Object.entries(porMotivo).sort((a, b) => b[1] - a[1])} />
        <BreakdownCard title="Por zona" items={Object.entries(porZona).sort((a, b) => b[1] - a[1])} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-black text-slate-700">Últimos registos</h3>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Zona</th>
                <th className="px-3 py-2 text-left">Pessoa</th>
                <th className="px-3 py-2 text-left">Motivo</th>
                <th className="px-3 py-2 text-right">Qtd</th>
                <th className="px-3 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody>
              {rejeitos.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 text-slate-500" suppressHydrationWarning>{new Date(r.created_at).toLocaleString("pt-PT")}</td>
                  <td className="px-3 py-1.5 font-mono font-bold text-slate-700">{r.zona_id ?? "—"}</td>
                  <td className="px-3 py-1.5 font-bold text-slate-800">{r.pessoa_nome ?? "—"}</td>
                  <td className="px-3 py-1.5 text-slate-700">{r.motivo}</td>
                  <td className="px-3 py-1.5 text-right font-extrabold text-red-600">{r.quantidade}</td>
                  <td className="px-3 py-1.5 text-slate-500">{r.notas ?? ""}</td>
                </tr>
              ))}
              {rejeitos.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm font-bold text-slate-400">Sem rejeitos nos últimos 7 dias</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ===== PAUSAS TAB ===== */
export function PausasTab({ pausas }: { pausas: ProducaoPausa[] }) {
  const totalMin = pausas.reduce((a, p) => a + (p.duracao_min ?? 0), 0);
  const porMotivo = pausas.reduce<Record<string, number>>((acc, p) => {
    acc[p.motivo] = (acc[p.motivo] ?? 0) + (p.duracao_min ?? 0);
    return acc;
  }, {});
  const porZona = pausas.reduce<Record<string, number>>((acc, p) => {
    const z = p.zona_id ?? "—";
    acc[z] = (acc[z] ?? 0) + (p.duracao_min ?? 0);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tempo paragens (7d)" value={`${Math.round(totalMin)} min`} sub={`${(totalMin / 60).toFixed(1)}h`} tone="warn" />
        <StatCard label="Total paragens" value={pausas.length.toString()} tone="neutral" />
        <StatCard label="Média/paragem" value={`${pausas.length > 0 ? Math.round(totalMin / pausas.length) : 0} min`} tone="neutral" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <BreakdownCard title="Por motivo (min)" items={Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])} />
        <BreakdownCard title="Por zona (min)" items={Object.entries(porZona).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-black text-slate-700">Histórico de paragens</h3>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Início</th>
                <th className="px-3 py-2 text-left">Fim</th>
                <th className="px-3 py-2 text-left">Zona</th>
                <th className="px-3 py-2 text-left">Pessoa</th>
                <th className="px-3 py-2 text-left">Motivo</th>
                <th className="px-3 py-2 text-right">Duração</th>
              </tr>
            </thead>
            <tbody>
              {pausas.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 text-slate-500" suppressHydrationWarning>{new Date(p.inicio).toLocaleString("pt-PT")}</td>
                  <td className="px-3 py-1.5 text-slate-500" suppressHydrationWarning>{p.fim ? new Date(p.fim).toLocaleString("pt-PT") : <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-extrabold text-yellow-700">em curso</span>}</td>
                  <td className="px-3 py-1.5 font-mono font-bold text-slate-700">{p.zona_id ?? "—"}</td>
                  <td className="px-3 py-1.5 font-bold text-slate-800">{p.pessoa_nome ?? "—"}</td>
                  <td className="px-3 py-1.5 text-slate-700">{p.motivo}</td>
                  <td className="px-3 py-1.5 text-right font-extrabold text-slate-900">{p.duracao_min != null ? `${Math.round(p.duracao_min)} min` : "—"}</td>
                </tr>
              ))}
              {pausas.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm font-bold text-slate-400">Sem paragens nos últimos 7 dias</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ===== SHARED ===== */
export function StatCard({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const toneClass = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-yellow-50 text-yellow-800 border-yellow-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-white text-slate-700 border-slate-200",
  }[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2 shadow-sm", toneClass)}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-black leading-tight">{value}</p>
      {sub && <p className="text-[10px] font-bold opacity-70">{sub}</p>}
    </div>
  );
}

function BreakdownCard({ title, items }: { title: string; items: Array<[string, number]> }) {
  const max = Math.max(1, ...items.map((x) => x[1]));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-black text-slate-700">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 && <p className="text-xs font-bold text-slate-400">Sem dados</p>}
        {items.slice(0, 10).map(([k, v]) => (
          <div key={k} className="text-xs">
            <div className="flex justify-between font-bold">
              <span className="truncate text-slate-700">{k}</span>
              <span className="text-slate-900">{v}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-700" style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
