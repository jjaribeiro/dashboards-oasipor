import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { OperadorZona } from "@/components/producao/operador-zona";
import { DashboardAuthGate } from "@/components/dashboard-auth-gate";
import type { EquipamentoCiclo, Funcionario, OrdemProducao, ZonaProducao } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OperadorZonaPage({
  params,
}: {
  params: Promise<{ zona: string }>;
}) {
  const { zona: zonaId } = await params;
  const supabase = createServerSupabase();

  const { data: zona } = await supabase
    .from("zonas_producao")
    .select("*")
    .eq("id", zonaId)
    .maybeSingle();

  if (!zona) notFound();

  const [ops, ciclos, funcionarios] = await Promise.all([
    supabase
      .from("ordens_producao")
      .select("*")
      .eq("zona_id", zonaId)
      .in("estado", ["planeada", "em_curso", "pausada", "concluida"])
      .order("updated_at", { ascending: false }),
    supabase
      .from("equipamento_ciclo")
      .select("*")
      .eq("zona_id", zonaId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("funcionarios")
      .select("*")
      .eq("ativo", true)
      .order("nome", { ascending: true }),
  ]);

  return (
    <DashboardAuthGate dashboardKey="operador" title="Produção — Operadores" subtitle="Introduz o teu PIN para entrar">
      <main className="h-full">
        <OperadorZona
          zona={zona as ZonaProducao}
          initialOPs={(ops.data ?? []) as OrdemProducao[]}
          initialCiclos={(ciclos.data ?? []) as EquipamentoCiclo[]}
          initialFuncionarios={(funcionarios.data ?? []) as Funcionario[]}
        />
      </main>
    </DashboardAuthGate>
  );
}
