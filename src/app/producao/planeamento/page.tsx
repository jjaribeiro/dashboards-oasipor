import { createServerSupabase } from "@/lib/supabase/server";
import { PlaneamentoShell } from "@/components/producao/planeamento-shell";
import { DashboardAuthGate } from "@/components/dashboard-auth-gate";
import type { OrdemProducao, ZonaProducao, AuditLog, ProducaoRejeito, ProducaoPausa, MetaCategoria, PedidoProducao } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlaneamentoPage() {
  const supabase = createServerSupabase();

  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

  const [zonas, pedidos, ops, audit, rejeitos, pausas, metas] = await Promise.all([
    supabase.from("zonas_producao").select("*").order("ordem"),
    supabase.from("pedidos_producao").select("*").order("updated_at", { ascending: false }).limit(500),
    supabase.from("ordens_producao").select("*").order("updated_at", { ascending: false }).limit(500),
    supabase.from("audit_log").select("*").gte("created_at", seteDiasAtras.toISOString()).order("created_at", { ascending: false }).limit(500),
    supabase.from("producao_rejeitos").select("*").gte("created_at", seteDiasAtras.toISOString()).order("created_at", { ascending: false }).limit(500),
    supabase.from("producao_pausas").select("*").gte("created_at", seteDiasAtras.toISOString()).order("created_at", { ascending: false }).limit(500),
    supabase.from("producao_metas_categoria").select("*"),
  ]);

  return (
    <DashboardAuthGate dashboardKey="planeamento" title="Produção — Planeamento" hideBadge>
      <main className="h-full">
        <PlaneamentoShell
          initialZonas={(zonas.data ?? []) as ZonaProducao[]}
          initialPedidos={(pedidos.data ?? []) as PedidoProducao[]}
          initialOPs={(ops.data ?? []) as OrdemProducao[]}
          initialAudit={(audit.data ?? []) as AuditLog[]}
          initialRejeitos={(rejeitos.data ?? []) as ProducaoRejeito[]}
          initialPausas={(pausas.data ?? []) as ProducaoPausa[]}
          initialMetas={(metas.data ?? []) as MetaCategoria[]}
        />
      </main>
    </DashboardAuthGate>
  );
}
