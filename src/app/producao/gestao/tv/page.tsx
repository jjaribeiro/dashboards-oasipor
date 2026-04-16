import { createServerSupabase } from "@/lib/supabase/server";
import { ProducaoGestaoGrid } from "@/components/producao/producao-gestao-grid";
import type { EquipamentoCiclo, Funcionario, OrdemProducao, ZonaProducao } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProducaoGestaoTv() {
  const supabase = createServerSupabase();

  const [zonas, ops, ciclos, funcionarios] = await Promise.all([
    supabase.from("zonas_producao").select("*").order("ordem", { ascending: true }),
    supabase.from("ordens_producao").select("*").neq("estado", "concluida").neq("estado", "cancelada").order("updated_at", { ascending: false }),
    supabase.from("equipamento_ciclo").select("*").order("updated_at", { ascending: false }),
    supabase.from("funcionarios").select("*").eq("ativo", true).order("nome", { ascending: true }),
  ]);

  return (
    <main className="h-full">
      <ProducaoGestaoGrid
        zonas={(zonas.data ?? []) as ZonaProducao[]}
        initialOPs={(ops.data ?? []) as OrdemProducao[]}
        initialCiclos={(ciclos.data ?? []) as EquipamentoCiclo[]}
        initialFuncionarios={(funcionarios.data ?? []) as Funcionario[]}
        kiosk
      />
    </main>
  );
}
