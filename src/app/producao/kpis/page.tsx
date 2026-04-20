import { createServerSupabase } from "@/lib/supabase/server";
import { ProducaoKpisShell } from "@/components/producao/producao-kpis-shell";
import { DashboardAuthGate } from "@/components/dashboard-auth-gate";
import type { OrdemProducao, PedidoProducao, ZonaProducao, ProducaoRejeito, ProducaoPausa, AuditLog, MetaCategoria } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KpisPage() {
  const supabase = createServerSupabase();
  const seteDias = new Date();
  seteDias.setDate(seteDias.getDate() - 7);
  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() - 30);

  const [zonas, pedidos, ops, rejeitos, pausas, audit, metas] = await Promise.all([
    supabase.from("zonas_producao").select("*").order("ordem"),
    supabase.from("pedidos_producao").select("*").limit(1000),
    supabase.from("ordens_producao").select("*").gte("updated_at", trintaDias.toISOString()).limit(2000),
    supabase.from("producao_rejeitos").select("*").gte("created_at", seteDias.toISOString()).order("created_at", { ascending: false }).limit(2000),
    supabase.from("producao_pausas").select("*").gte("created_at", seteDias.toISOString()).order("created_at", { ascending: false }).limit(2000),
    supabase.from("audit_log").select("*").gte("created_at", seteDias.toISOString()).order("created_at", { ascending: false }).limit(2000),
    supabase.from("producao_metas_categoria").select("*"),
  ]);

  return (
    <DashboardAuthGate dashboardKey="kpis" title="Produção — KPIs">
      <main className="h-full">
        <ProducaoKpisShell
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
