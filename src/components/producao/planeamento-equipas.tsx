"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { cn } from "@/lib/utils";
import { ZONA_LABEL, AREA_COR, AREA_LABEL } from "@/lib/constants";
import type { Funcionario, ZonaProducao } from "@/lib/types";

interface Props {
  zonas: ZonaProducao[];
  initialFuncionarios: Funcionario[];
}

export function EquipasTab({ zonas, initialFuncionarios }: Props) {
  const { items: funcionarios, setItems: setFuncionarios } = useRealtimeTable<Funcionario>("funcionarios", initialFuncionarios, { orderBy: "nome" });
  const [search, setSearch] = useState("");

  function patchFuncionario(id: string, patch: Partial<Funcionario>) {
    setFuncionarios((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  }

  const porArea = useMemo(() => {
    const groups: Record<string, ZonaProducao[]> = {};
    for (const z of zonas) {
      if (!groups[z.area]) groups[z.area] = [];
      groups[z.area].push(z);
    }
    for (const arr of Object.values(groups)) arr.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    return groups;
  }, [zonas]);

  const ordemArea: Array<keyof typeof AREA_LABEL> = ["sala_limpa_1", "sala_limpa_2", "esterilizacao"];
  const areasVisiveis = ordemArea.filter((a) => porArea[a]?.length);

  const ativos = funcionarios.filter((f) => f.ativo);
  const semZona = ativos.filter((f) => !f.zona_atual);
  const semZonaFiltered = search.trim()
    ? semZona.filter((f) => f.nome.toLowerCase().includes(search.toLowerCase()))
    : semZona;

  async function moveFuncionario(id: string, novaZona: string | null) {
    const f = funcionarios.find((x) => x.id === id);
    if (!f) return;
    const anterior = f.zona_atual;
    patchFuncionario(id, { zona_atual: novaZona as Funcionario["zona_atual"] });
    const { error } = await supabase.from("funcionarios").update({ zona_atual: novaZona }).eq("id", id);
    if (error) {
      toast.error("Erro a mover");
      patchFuncionario(id, { zona_atual: anterior });
    }
  }

  return (
    <div className="flex h-full gap-3">
      {/* SIDEBAR esquerda — pool de pessoas */}
      <SemZonaSidebar
        funcionarios={semZonaFiltered}
        total={semZona.length}
        totalAtivos={ativos.length}
        search={search}
        onSearch={setSearch}
        onDrop={(id) => moveFuncionario(id, null)}
      />

      {/* MAIN — áreas em grid */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="grid min-h-0 flex-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {areasVisiveis.map((area) => (
            <section key={area} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1">
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", AREA_COR[area])}>{AREA_LABEL[area]}</span>
                <span className="text-[10px] font-bold text-slate-400">{porArea[area].length} zona{porArea[area].length === 1 ? "" : "s"}</span>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                {porArea[area].map((z) => (
                  <ZonaRow
                    key={z.id}
                    zona={z}
                    funcionarios={funcionarios}
                    onPatch={patchFuncionario}
                    onMoveFuncionario={moveFuncionario}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* COBERTURA strip — todas zonas visíveis com badge contagem */}
        <CoberturaStrip zonas={zonas} funcionarios={ativos} />
      </div>
    </div>
  );
}

/* ========== Sidebar pool de pessoas ========== */
function SemZonaSidebar({
  funcionarios, total, totalAtivos, search, onSearch, onDrop,
}: {
  funcionarios: Funcionario[];
  total: number;
  totalAtivos: number;
  search: string;
  onSearch: (s: string) => void;
  onDrop: (funcId: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <aside
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const id = e.dataTransfer.getData("text/funcionario-id");
        if (id) onDrop(id);
      }}
      className={cn(
        "flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border bg-white transition-colors",
        over ? "border-amber-400 bg-amber-50/40" : "border-slate-200"
      )}
    >
      <div className="border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700">Sem zona</span>
          <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-slate-700">{total}/{totalAtivos}</span>
        </div>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Pesquisar…"
          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold focus:border-blue-300 focus:outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {funcionarios.length === 0 ? (
          <p className="px-2 py-4 text-center text-[10px] font-bold italic text-slate-400">{search ? "Sem resultados" : "Todos alocados"}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {funcionarios.map((f) => <FuncChipDraggable key={f.id} f={f} compact />)}
          </div>
        )}
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-400">
        ↕ Arrasta para zona · ou para aqui retira
      </div>
    </aside>
  );
}

/* ========== Zona row — compacto: 1 linha + chips abaixo ========== */
function ZonaRow({
  zona, funcionarios, onPatch, onMoveFuncionario,
}: {
  zona: ZonaProducao;
  funcionarios: Funcionario[];
  onPatch: (id: string, patch: Partial<Funcionario>) => void;
  onMoveFuncionario: (id: string, novaZona: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [over, setOver] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [respLocal, setRespLocal] = useState<string | null>(zona.responsavel);
  useEffect(() => { setRespLocal(zona.responsavel); }, [zona.responsavel]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  const nestaZona = funcionarios.filter((f) => f.zona_atual === zona.id && f.ativo);
  const opcoesResp = funcionarios.filter((f) => f.ativo).sort((a, b) => {
    const na = a.zona_atual === zona.id ? 0 : 1;
    const nb = b.zona_atual === zona.id ? 0 : 1;
    if (na !== nb) return na - nb;
    return a.nome.localeCompare(b.nome);
  });

  async function guardarResp(novo: string) {
    const v = novo || null;
    if (v === respLocal) return;
    const anterior = respLocal;
    setRespLocal(v);
    const { error } = await supabase.from("zonas_producao").update({ responsavel: v }).eq("id", zona.id);
    if (error) { setRespLocal(anterior); toast.error("Erro ao guardar responsável"); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setOver(false);
    const id = e.dataTransfer.getData("text/funcionario-id");
    if (!id) return;
    onMoveFuncionario(id, zona.id);
  }

  const corBadge = nestaZona.length === 0 ? "bg-slate-100 text-slate-400"
    : nestaZona.length === 1 ? "bg-amber-100 text-amber-700"
    : "bg-emerald-100 text-emerald-700";

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={cn("space-y-1 px-2 py-1.5 transition-colors", over && "bg-emerald-50/60")}
    >
      {/* Linha 1: nome + badge + resp + add */}
      <div className="flex items-center gap-1.5">
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-black text-slate-900">{ZONA_LABEL[zona.id] ?? zona.nome}</h3>
        <span className={cn("rounded-full px-1.5 text-[10px] font-extrabold tabular-nums", corBadge)}>{nestaZona.length}</span>
        <select
          value={respLocal ?? ""}
          onChange={(e) => guardarResp(e.target.value)}
          className={cn(
            "min-w-0 max-w-[110px] rounded border border-slate-300 bg-white px-1 py-0 text-[10px] font-bold",
            respLocal ? "text-slate-800" : "text-slate-400"
          )}
          title="Responsável"
        >
          <option value="">— resp —</option>
          {opcoesResp.map((f) => (
            <option key={f.id} value={f.nome}>{f.nome}</option>
          ))}
        </select>
        <div ref={pickerRef} className="relative">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className="rounded border border-dashed border-slate-300 bg-white px-1.5 py-0 text-[10px] font-extrabold text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
            title="Adicionar (multi)"
          >+</button>
          {pickerOpen && (
            <MultiAddPicker
              funcionarios={funcionarios.filter((f) => f.ativo && f.zona_atual !== zona.id)}
              onAdd={(ids) => {
                for (const id of ids) onPatch(id, { zona_atual: zona.id as Funcionario["zona_atual"] });
                supabase.from("funcionarios").update({ zona_atual: zona.id }).in("id", ids).then(({ error }) => {
                  if (error) toast.error("Erro a adicionar");
                  else toast.success(`${ids.length} adicionado${ids.length === 1 ? "" : "s"}`);
                });
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Linha 2: chips */}
      <div className="flex flex-wrap gap-0.5 min-h-[20px]">
        {nestaZona.length === 0 && <span className="text-[10px] font-bold italic text-slate-300">arrasta aqui</span>}
        {nestaZona.map((f) => (
          <FuncChipDraggable
            key={f.id}
            f={f}
            compact
            removable
            onRemove={() => onMoveFuncionario(f.id, null)}
          />
        ))}
      </div>
    </div>
  );
}

/* ========== Cobertura strip (resumo todas zonas) ========== */
function CoberturaStrip({ zonas, funcionarios }: { zonas: ZonaProducao[]; funcionarios: Funcionario[] }) {
  const ordemArea: Array<keyof typeof AREA_LABEL> = ["sala_limpa_1", "sala_limpa_2", "esterilizacao"];
  const porArea = useMemo(() => {
    const g: Record<string, ZonaProducao[]> = {};
    for (const z of zonas) {
      if (!g[z.area]) g[z.area] = [];
      g[z.area].push(z);
    }
    for (const arr of Object.values(g)) arr.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    return g;
  }, [zonas]);

  const countPorZona = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of funcionarios) {
      if (f.zona_atual) m.set(f.zona_atual, (m.get(f.zona_atual) ?? 0) + 1);
    }
    return m;
  }, [funcionarios]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Cobertura</span>
        {ordemArea.filter((a) => porArea[a]?.length).map((area) => (
          <div key={area} className="flex items-center gap-1">
            <span className={cn("rounded border px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide", AREA_COR[area])}>{AREA_LABEL[area]}</span>
            <div className="flex items-center gap-0.5">
              {porArea[area].map((z) => {
                const c = countPorZona.get(z.id) ?? 0;
                const cls = c === 0 ? "bg-red-50 text-red-600 border-red-200"
                  : c === 1 ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200";
                return (
                  <span
                    key={z.id}
                    title={`${ZONA_LABEL[z.id] ?? z.nome}: ${c} pessoa${c === 1 ? "" : "s"}`}
                    className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold", cls)}
                  >
                    <span className="font-extrabold">{c}</span>
                    <span className="ml-1 opacity-70">{(ZONA_LABEL[z.id] ?? z.nome).replace(/^SL\d — /, "")}</span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========== Multi-add picker ========== */
function MultiAddPicker({
  funcionarios, onAdd, onClose,
}: {
  funcionarios: Funcionario[];
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  void onClose;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? funcionarios.filter((f) => f.nome.toLowerCase().includes(search.toLowerCase()))
    : funcionarios;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-300 bg-white shadow-xl">
      <div className="border-b border-slate-200 p-1.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar…"
          autoFocus
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-blue-300 focus:outline-none"
        />
      </div>
      <div className="max-h-56 overflow-y-auto p-1">
        {filtered.length === 0 && <p className="px-2 py-3 text-center text-[11px] font-bold italic text-slate-400">{search ? "Sem resultados" : "Sem opções"}</p>}
        {filtered.map((f) => {
          const on = selected.has(f.id);
          return (
            <button
              key={f.id}
              onClick={() => toggle(f.id)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-slate-100",
                on && "bg-emerald-50"
              )}
            >
              <span className={cn(
                "flex h-3.5 w-3.5 items-center justify-center rounded border-2 text-[8px]",
                on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
              )}>{on && "✓"}</span>
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-extrabold text-white" style={{ backgroundColor: f.cor ?? "#64748b" }}>{f.iniciais ?? f.nome[0]}</span>
              <span className="flex-1 truncate text-[10px] font-bold text-slate-800">{f.nome}</span>
              {f.zona_atual && (
                <span className="text-[9px] text-slate-400">({(ZONA_LABEL[f.zona_atual] ?? f.zona_atual).replace(/^SL\d — /, "")})</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-2 py-1">
        <span className="text-[10px] font-bold text-slate-500">{selected.size}</span>
        <div className="flex gap-1">
          <button
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
            className="rounded px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-200 disabled:opacity-40"
          >Limpar</button>
          <button
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
            className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
          >Adicionar</button>
        </div>
      </div>
    </div>
  );
}

/* ========== Chip arrastável ========== */
function FuncChipDraggable({ f, removable, onRemove, compact }: { f: Funcionario; removable?: boolean; onRemove?: () => void; compact?: boolean }) {
  return (
    <span
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/funcionario-id", f.id); e.dataTransfer.effectAllowed = "move"; }}
      className={cn(
        "group inline-flex cursor-grab items-center gap-1 rounded-full border border-slate-200 bg-slate-50 shadow-sm hover:border-slate-300 active:cursor-grabbing",
        compact ? "py-0 pl-0 pr-1 text-[10px] font-bold text-slate-700" : "py-0.5 pl-0.5 pr-1.5 text-[11px] font-bold text-slate-700"
      )}
      title={removable ? `${f.nome} — arrasta ou × para retirar` : f.nome}
    >
      <span className={cn(
        "inline-flex items-center justify-center rounded-full px-1 text-[8px] font-extrabold text-white",
        compact ? "h-3.5 min-w-3.5" : "h-4 min-w-4"
      )} style={{ backgroundColor: f.cor ?? "#64748b" }}>{f.iniciais ?? f.nome[0]}</span>
      <span className={cn("truncate", compact ? "max-w-[100px]" : "max-w-[140px]")}>{f.nome.split(" ")[0]}</span>
      {removable && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 transition-opacity group-hover:opacity-100 text-slate-400 hover:text-red-600"
          title="Retirar"
        >×</button>
      )}
    </span>
  );
}
