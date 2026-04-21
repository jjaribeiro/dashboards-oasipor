"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRealtimeTable, notifyMutation } from "@/hooks/use-realtime-table";
import { cn } from "@/lib/utils";
import { ZONA_LABEL, AREA_COR, AREA_LABEL } from "@/lib/constants";
import type { EscalaFuncionario, Funcionario, ZonaId, ZonaProducao } from "@/lib/types";

/** Segunda-feira da semana que contém a data passada (ISO: segunda=1) */
function getMondayOf(d: Date): Date {
  const m = new Date(d);
  const day = m.getDay() || 7;
  m.setDate(m.getDate() - (day - 1));
  m.setHours(0, 0, 0, 0);
  return m;
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtSemana(monday: Date): string {
  const sexta = new Date(monday);
  sexta.setDate(sexta.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${monday.toLocaleDateString("pt-PT", opts)} – ${sexta.toLocaleDateString("pt-PT", opts)}`;
}

interface Props {
  zonas: ZonaProducao[];
  initialFuncionarios: Funcionario[];
}

export function EquipasTab({ zonas, initialFuncionarios }: Props) {
  const { items: funcionarios, setItems: setFuncionarios } = useRealtimeTable<Funcionario>("funcionarios", initialFuncionarios, { orderBy: "nome" });
  const [search, setSearch] = useState("");

  // Week navigation: 0 = current week, +1 = next week, -1 = last week, etc.
  const [weekOffset, setWeekOffset] = useState(0);
  const currentMonday = useMemo(() => getMondayOf(new Date()), []);
  const viewMonday = useMemo(() => {
    const m = new Date(currentMonday);
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [currentMonday, weekOffset]);
  const isCurrentWeek = weekOffset === 0;

  // Escala data for non-current weeks
  const [escala, setEscala] = useState<EscalaFuncionario[]>([]);
  const [escalaLoading, setEscalaLoading] = useState(false);

  const loadEscala = useCallback(async (monday: Date) => {
    setEscalaLoading(true);
    const dataStr = toYYYYMMDD(monday);
    const sexta = new Date(monday);
    sexta.setDate(sexta.getDate() + 4);
    const { data, error } = await supabase
      .from("escala_funcionario")
      .select("*")
      .gte("data", dataStr)
      .lte("data", toYYYYMMDD(sexta));
    setEscalaLoading(false);
    if (error) toast.error("Erro ao carregar escala");
    else setEscala((data ?? []) as EscalaFuncionario[]);
  }, []);

  useEffect(() => {
    if (!isCurrentWeek) loadEscala(viewMonday);
    else setEscala([]);
  }, [isCurrentWeek, viewMonday, loadEscala]);

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

  // Escala (non-current week): add or remove a funcionario↔zona assignment for the viewed week's Monday
  async function moveEscala(funcId: string, zonaId: string | null, removeZonaId?: string) {
    if (zonaId) {
      // upsert: one row per (funcionario_id, data, zona_id)
      const dataStr = toYYYYMMDD(viewMonday);
      const exists = escala.some((e) => e.funcionario_id === funcId && e.zona_id === zonaId && e.data === dataStr);
      if (exists) return;
      const { data: inserted, error } = await supabase
        .from("escala_funcionario")
        .insert({ funcionario_id: funcId, data: dataStr, zona_id: zonaId })
        .select()
        .single();
      if (error) { toast.error("Erro ao guardar escala"); return; }
      notifyMutation("escala_funcionario");
      setEscala((prev) => [...prev, inserted as EscalaFuncionario]);
    } else if (removeZonaId) {
      const dataStr = toYYYYMMDD(viewMonday);
      const row = escala.find((e) => e.funcionario_id === funcId && e.zona_id === removeZonaId && e.data === dataStr);
      if (!row) return;
      await supabase.from("escala_funcionario").delete().eq("id", row.id);
      notifyMutation("escala_funcionario");
      setEscala((prev) => prev.filter((e) => e.id !== row.id));
    } else {
      // clear all for this func in this week
      const dataStr = toYYYYMMDD(viewMonday);
      const toDelete = escala.filter((e) => e.funcionario_id === funcId && e.data === dataStr);
      await supabase.from("escala_funcionario").delete().in("id", toDelete.map((e) => e.id));
      notifyMutation("escala_funcionario");
      setEscala((prev) => prev.filter((e) => !(e.funcionario_id === funcId && e.data === dataStr)));
    }
  }

  // novaZona=null + removerZona=undefined → limpar tudo (arrasta para sidebar)
  // novaZona=string → adicionar esta zona ao array
  // removerZona=string → remover esta zona específica (X dentro de uma zona)
  async function moveFuncionario(id: string, novaZona: string | null, removerZona?: string) {
    const f = funcionarios.find((x) => x.id === id);
    if (!f) return;
    const zonasAntes = f.zonas_atuais ?? [];
    let zonasDepois: string[];

    if (removerZona) {
      zonasDepois = zonasAntes.filter((z) => z !== removerZona);
    } else if (novaZona) {
      zonasDepois = (zonasAntes as string[]).includes(novaZona) ? zonasAntes : [...zonasAntes, novaZona as ZonaId];
    } else {
      zonasDepois = [];
    }

    const novaZonaAtual = (zonasDepois[0] ?? null) as Funcionario["zona_atual"];
    const antes = { zona_atual: f.zona_atual, zonas_atuais: zonasAntes };
    patchFuncionario(id, { zona_atual: novaZonaAtual, zonas_atuais: zonasDepois as Funcionario["zonas_atuais"] });
    const { error } = await supabase.from("funcionarios")
      .update({ zona_atual: novaZonaAtual, zonas_atuais: zonasDepois })
      .eq("id", id);
    if (error) {
      toast.error("Erro a mover");
      patchFuncionario(id, { zona_atual: antes.zona_atual, zonas_atuais: antes.zonas_atuais as Funcionario["zonas_atuais"] });
    } else {
      notifyMutation("funcionarios");
    }
  }

  // For other weeks: derive "virtual funcionarios" from escala so ZonaRow works unchanged
  const funcionariosEscala: Funcionario[] = useMemo(() => {
    if (isCurrentWeek) return funcionarios;
    const dataStr = toYYYYMMDD(viewMonday);
    const thisWeek = escala.filter((e) => e.data === dataStr);
    // Build a map: funcId → zona list for this week
    const zonesByFunc = new Map<string, ZonaId[]>();
    for (const e of thisWeek) {
      const arr = zonesByFunc.get(e.funcionario_id) ?? [];
      arr.push(e.zona_id as ZonaId);
      zonesByFunc.set(e.funcionario_id, arr);
    }
    return funcionarios.map((f) => {
      const zones = zonesByFunc.get(f.id) ?? [];
      return { ...f, zonas_atuais: zones, zona_atual: zones[0] ?? null };
    });
  }, [isCurrentWeek, funcionarios, escala, viewMonday]);

  const semZona = ativos.filter((f) => {
    if (isCurrentWeek) return !f.zona_atual && (!f.zonas_atuais || f.zonas_atuais.length === 0);
    const fe = funcionariosEscala.find((x) => x.id === f.id);
    return !fe?.zona_atual && (!fe?.zonas_atuais || fe.zonas_atuais.length === 0);
  });
  const semZonaFiltered = search.trim()
    ? semZona.filter((f) => f.nome.toLowerCase().includes(search.toLowerCase()))
    : semZona;

  const onMoveAny = isCurrentWeek ? moveFuncionario : moveEscala;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Week navigation bar */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="rounded border border-slate-200 px-2 py-0.5 text-sm font-bold text-slate-500 hover:bg-slate-50"
          title="Semana anterior"
        >←</button>
        <span className={cn("flex-1 text-center text-sm font-extrabold", isCurrentWeek ? "text-emerald-700" : "text-slate-700")}>
          {isCurrentWeek ? "Semana atual · " : ""}{fmtSemana(viewMonday)}
        </span>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="rounded border border-slate-200 px-2 py-0.5 text-sm font-bold text-slate-500 hover:bg-slate-50"
          title="Próxima semana"
        >→</button>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekOffset(0)}
            className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
          >Hoje</button>
        )}
        {!isCurrentWeek && escalaLoading && <span className="text-xs text-slate-400">A carregar…</span>}
        {!isCurrentWeek && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">Planeamento</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* SIDEBAR esquerda — pool de pessoas */}
        <SemZonaSidebar
          funcionarios={semZonaFiltered}
          total={semZona.length}
          totalAtivos={ativos.length}
          search={search}
          onSearch={setSearch}
          onDrop={(id) => onMoveAny(id, null)}
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
                      funcionarios={funcionariosEscala}
                      onPatch={patchFuncionario}
                      onMoveFuncionario={onMoveAny}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* COBERTURA strip — todas zonas visíveis com badge contagem */}
          <CoberturaStrip zonas={zonas} funcionarios={funcionariosEscala.filter((f) => f.ativo)} />
        </div>
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
          <div className="flex flex-col gap-0.5">
            {funcionarios.map((f) => <FuncChipDraggable key={f.id} f={f} />)}
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
  onMoveFuncionario: (id: string, novaZona: string | null, removerZona?: string) => void;
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

  const nestaZona = funcionarios.filter((f) => f.ativo && (f.zonas_atuais?.includes(zona.id) || f.zona_atual === zona.id));
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
    else { notifyMutation("zonas_producao"); }
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
              funcionarios={funcionarios.filter((f) => f.ativo && !f.zonas_atuais?.includes(zona.id) && f.zona_atual !== zona.id)}
              onAdd={(ids) => {
                for (const id of ids) onMoveFuncionario(id, zona.id);
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Linha 2: lista vertical */}
      <div className="flex flex-col gap-0.5 min-h-[20px]">
        {nestaZona.length === 0 && <span className="text-[10px] font-bold italic text-slate-300">arrasta aqui</span>}
        {nestaZona.map((f) => (
          <FuncChipDraggable
            key={f.id}
            f={f}
            removable
            onRemove={() => onMoveFuncionario(f.id, null, zona.id)}
            multiZona={(f.zonas_atuais?.length ?? 0) > 1}
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
      const zonas = f.zonas_atuais?.length ? f.zonas_atuais : (f.zona_atual ? [f.zona_atual] : []);
      for (const z of zonas) m.set(z, (m.get(z) ?? 0) + 1);
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
              <span className="flex-1 text-[10px] font-bold text-slate-800">{f.nome}</span>
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

/* ========== Chip arrastável (lista) ========== */
function FuncChipDraggable({ f, removable, onRemove, multiZona }: { f: Funcionario; removable?: boolean; onRemove?: () => void; multiZona?: boolean }) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/funcionario-id", f.id); e.dataTransfer.effectAllowed = "move"; }}
      className="group flex cursor-grab items-center gap-1.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 hover:border-slate-300 hover:bg-slate-50 active:cursor-grabbing"
      title={removable ? `${f.nome} — arrasta ou × para retirar desta zona` : f.nome}
    >
      <span
        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-extrabold text-white shrink-0"
        style={{ backgroundColor: f.cor ?? "#64748b" }}
      >{f.iniciais ?? f.nome[0]}</span>
      <span className="flex-1 text-[11px] font-bold text-slate-800 leading-tight">{f.nome}</span>
      {multiZona && (
        <span
          className="shrink-0 rounded bg-violet-100 px-1 text-[8px] font-extrabold text-violet-700"
          title={`Também em: ${(f.zonas_atuais ?? []).slice(1).map((z) => ZONA_LABEL[z] ?? z).join(", ")}`}
        >+{(f.zonas_atuais?.length ?? 2) - 1} zona{(f.zonas_atuais?.length ?? 2) > 2 ? "s" : ""}</span>
      )}
      {removable && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-slate-400 hover:text-red-600 text-xs"
          title="Retirar desta zona"
        >×</button>
      )}
    </div>
  );
}
