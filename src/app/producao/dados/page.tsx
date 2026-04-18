import { createServerSupabase } from "@/lib/supabase/server";
import { DadosGrid } from "@/components/producao/dados-grid";
import type { Funcionario, Produto } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProducaoDados() {
  const supabase = createServerSupabase();

  const [funcionarios, produtos] = await Promise.all([
    supabase.from("funcionarios").select("*").order("nome", { ascending: true }),
    supabase.from("produtos").select("*").order("referencia", { ascending: true }),
  ]);

  return (
    <main className="min-h-dvh bg-slate-50">
      <DadosGrid
        initialFuncionarios={(funcionarios.data ?? []) as Funcionario[]}
        initialProdutos={(produtos.data ?? []) as Produto[]}
      />
    </main>
  );
}
