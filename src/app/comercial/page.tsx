import { createServerSupabase } from "@/lib/supabase/server";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import type { Concurso, Cotacao, Encomenda, Tarefa, Amostra } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Comercial() {
  const supabase = createServerSupabase();

  const [concursos, cotacoes, encomendas, tarefas, amostras] = await Promise.all([
    supabase
      .from("concursos")
      .select("*")
      .eq("is_completed", false)
      .order("prazo", { ascending: true }),
    supabase
      .from("cotacoes")
      .select("*")
      .eq("is_completed", false)
      .order("prazo", { ascending: true, nullsFirst: false }),
    supabase
      .from("encomendas")
      .select("*")
      .eq("is_completed", false)
      .order("data_encomenda", { ascending: true, nullsFirst: false }),
    supabase
      .from("tarefas")
      .select("*")
      .eq("is_completed", false)
      .order("data_hora", { ascending: true, nullsFirst: false }),
    supabase
      .from("amostras")
      .select("*")
      .eq("is_completed", false)
      .order("data_expedicao", { ascending: true, nullsFirst: false }),
  ]);

  return (
    <main className="h-full">
      <DashboardGrid
        initialConcursos={(concursos.data ?? []) as Concurso[]}
        initialCotacoes={(cotacoes.data ?? []) as Cotacao[]}
        initialEncomendas={(encomendas.data ?? []) as Encomenda[]}
        initialTarefas={(tarefas.data ?? []) as Tarefa[]}
        initialAmostras={(amostras.data ?? []) as Amostra[]}
      />
    </main>
  );
}
