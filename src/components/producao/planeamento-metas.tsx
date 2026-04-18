"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { MetaCategoria, CategoriaMeta } from "@/lib/types";

const CATEGORIAS: Array<{ id: CategoriaMeta; label: string; descricao: string; cor: string }> = [
  {
    id: "packs_trouxas",
    label: "Packs / Trouxas",
    descricao: "Packs cirúrgicos, trouxas, kits e sets",
    cor: "border-sky-300 bg-sky-50",
  },
  {
    id: "campos_cirurgicos",
    label: "Campos Cirúrgicos",
    descricao: "Todos os campos cirúrgicos",
    cor: "border-emerald-300 bg-emerald-50",
  },
];

export function MetasTab({ metas: initialMetas }: { metas: MetaCategoria[] }) {
  const [metas, setMetas] = useState(() => {
    const mapa = new Map(initialMetas.map((m) => [m.categoria, m]));
    return CATEGORIAS.map((c) => mapa.get(c.id) ?? {
      categoria: c.id,
      meta_diaria_un: null,
      meta_semanal_un: null,
      meta_mensal_un: null,
      updated_at: new Date().toISOString(),
    });
  });

  async function saveMeta(categoria: CategoriaMeta, field: "meta_diaria_un" | "meta_semanal_un" | "meta_mensal_un", value: string) {
    const n = value === "" ? null : Number(value);
    setMetas((prev) => prev.map((m) => m.categoria === categoria ? { ...m, [field]: n } : m));
    const { error } = await supabase
      .from("producao_metas_categoria")
      .upsert({ categoria, [field]: n }, { onConflict: "categoria" });
    if (error) toast.error("Erro a guardar"); else toast.success("Meta atualizada");
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
        🎯 Metas por <strong>categoria de produto</strong>. Packs e trouxas contam juntos. Semana = 5 dias úteis (Seg–Sex).
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {CATEGORIAS.map((cat) => {
          const m = metas.find((x) => x.categoria === cat.id)!;
          return (
            <div key={cat.id} className={`overflow-hidden rounded-xl border-2 ${cat.cor}`}>
              <div className="border-b border-slate-200 bg-white/60 px-4 py-3">
                <h3 className="text-lg font-black text-slate-900">{cat.label}</h3>
                <p className="text-xs font-bold text-slate-500">{cat.descricao}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 p-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                    Meta diária (un)
                  </label>
                  <input
                    type="number"
                    min={0}
                    defaultValue={m.meta_diaria_un ?? ""}
                    onBlur={(e) => {
                      const novo = e.target.value;
                      const atual = m.meta_diaria_un?.toString() ?? "";
                      if (novo !== atual) saveMeta(cat.id, "meta_diaria_un", novo);
                    }}
                    placeholder="—"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg font-extrabold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                    Meta semanal (un)
                  </label>
                  <input
                    type="number"
                    min={0}
                    defaultValue={m.meta_semanal_un ?? ""}
                    onBlur={(e) => {
                      const novo = e.target.value;
                      const atual = m.meta_semanal_un?.toString() ?? "";
                      if (novo !== atual) saveMeta(cat.id, "meta_semanal_un", novo);
                    }}
                    placeholder="—"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg font-extrabold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                    Meta mensal (un)
                  </label>
                  <input
                    type="number"
                    min={0}
                    defaultValue={m.meta_mensal_un ?? ""}
                    onBlur={(e) => {
                      const novo = e.target.value;
                      const atual = m.meta_mensal_un?.toString() ?? "";
                      if (novo !== atual) saveMeta(cat.id, "meta_mensal_un", novo);
                    }}
                    placeholder="—"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg font-extrabold text-slate-900"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
