import { createServerSupabase } from "@/lib/supabase/server";
import { QualidadeTvPanel } from "@/components/producao/qualidade-tv-panel";
import { FuncionarioAuthGate } from "@/components/funcionario-auth-gate";
import type { OrdemProducao, PedidoProducao, RotulagemInspecao, CqInspecao, NaoConformidade } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function QualidadeTvPage() {
  const supabase = createServerSupabase();
  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() - 30);

  const [ops, pedidos, rotulagem, cq, ncs] = await Promise.all([
    supabase.from("ordens_producao").select("*").order("updated_at", { ascending: false }).limit(500),
    supabase.from("pedidos_producao").select("*").order("updated_at", { ascending: false }).limit(500),
    supabase.from("rotulagem_inspecoes").select("*").gte("created_at", trintaDias.toISOString()).order("created_at", { ascending: false }).limit(500),
    supabase.from("cq_inspecoes").select("*").gte("created_at", trintaDias.toISOString()).order("created_at", { ascending: false }).limit(500),
    supabase.from("nao_conformidades").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  return (
    <FuncionarioAuthGate requiredAccess="qualidade" title="Qualidade">
      <main className="h-dvh overflow-hidden">
        <QualidadeTvPanel
          ops={(ops.data ?? []) as OrdemProducao[]}
          pedidos={(pedidos.data ?? []) as PedidoProducao[]}
          initialRotulagem={(rotulagem.data ?? []) as RotulagemInspecao[]}
          initialCq={(cq.data ?? []) as CqInspecao[]}
          initialNcs={(ncs.data ?? []) as NaoConformidade[]}
        />
      </main>
    </FuncionarioAuthGate>
  );
}
