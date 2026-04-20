"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ClockDisplay } from "@/components/clock-display";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { supabase } from "@/lib/supabase/client";
import { KpisDashboard } from "./kpis-dashboard";
import { KpisTab } from "./planeamento-kpis";
import { MetasTab } from "./planeamento-metas";
import { AuditoriaTab } from "./planeamento-auditoria";
import { RejeitosTab, PausasTab } from "./planeamento-shell";
import type {
  OrdemProducao,
  ZonaProducao,
  AuditLog,
  ProducaoRejeito,
  ProducaoPausa,
  MetaCategoria,
  PedidoProducao,
} from "@/lib/types";

interface Props {
  initialZonas: ZonaProducao[];
  initialPedidos: PedidoProducao[];
  initialOPs: OrdemProducao[];
  initialAudit: AuditLog[];
  initialRejeitos: ProducaoRejeito[];
  initialPausas: ProducaoPausa[];
  initialMetas: MetaCategoria[];
}

type TabId = "visao" | "kpis" | "metas" | "historico" | "rejeitos" | "paragens";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "visao", label: "Visão Geral", icon: "📊" },
  { id: "kpis", label: "KPIs detalhe", icon: "📈" },
  { id: "metas", label: "Metas", icon: "🎯" },
  { id: "historico", label: "Histórico", icon: "📜" },
  { id: "rejeitos", label: "Rejeitados", icon: "❌" },
  { id: "paragens", label: "Paragens", icon: "⏸" },
];

export function ProducaoKpisShell({
  initialZonas,
  initialPedidos,
  initialOPs,
  initialAudit,
  initialRejeitos,
  initialPausas,
  initialMetas,
}: Props) {
  const [tab, setTab] = useState<TabId>("visao");

  const { items: zonas } = useRealtimeTable<ZonaProducao>("zonas_producao", initialZonas, { orderBy: "ordem", ascending: true });
  const { items: pedidos } = useRealtimeTable<PedidoProducao>("pedidos_producao", initialPedidos, { orderBy: "updated_at", ascending: false });
  const { items: ops } = useRealtimeTable<OrdemProducao>("ordens_producao", initialOPs, { orderBy: "updated_at", ascending: false });
  const { items: audit } = useRealtimeTable<AuditLog>("audit_log", initialAudit, { orderBy: "created_at", ascending: false });
  const { items: rejeitos } = useRealtimeTable<ProducaoRejeito>("producao_rejeitos", initialRejeitos, { orderBy: "created_at", ascending: false });
  const { items: pausas } = useRealtimeTable<ProducaoPausa>("producao_pausas", initialPausas, { orderBy: "created_at", ascending: false });

  const [metas, setMetas] = useState<MetaCategoria[]>(initialMetas);
  useEffect(() => {
    const channel = supabase
      .channel("producao_metas_categoria_kpis_rt")
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
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Produção — KPIs</h1>
            <p className="text-xs font-bold text-slate-500">Indicadores, metas e histórico operacional</p>
          </div>
        </div>
        <ClockDisplay />
      </header>

      <div className="flex gap-1 border-b border-slate-200 bg-white px-6 py-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-t-lg border-b-2 px-4 py-2 text-sm font-extrabold transition-colors",
              tab === t.id ? "border-emerald-500 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className={cn("flex-1 p-4", tab === "visao" ? "min-h-0 overflow-hidden" : "overflow-y-auto")}>
        {tab === "visao" && (
          <KpisDashboard
            zonas={zonas}
            pedidos={pedidos}
            ops={ops}
            rejeitos={rejeitos}
            pausas={pausas}
            audit={audit}
            metas={metas}
          />
        )}
        {tab === "kpis" && (
          <KpisTab pedidos={pedidos} ops={ops} zonas={zonas} rejeitos={rejeitos} pausas={pausas} metas={metas} />
        )}
        {tab === "metas" && <MetasTab metas={metas} />}
        {tab === "historico" && <AuditoriaTab audit={audit} />}
        {tab === "rejeitos" && <RejeitosTab rejeitos={rejeitos} />}
        {tab === "paragens" && <PausasTab pausas={pausas} />}
      </div>
    </div>
  );
}
