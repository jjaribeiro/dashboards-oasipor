"use client";

import { useState, useCallback, useRef } from "react";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import type { Funcionario, Produto } from "@/lib/types";

interface Props {
  initialFuncionarios: Funcionario[];
  initialProdutos?: Produto[];
}

export function DadosGrid({ initialFuncionarios }: Props) {
  const { items: funcionarios, refetch: refetchFunc } = useRealtimeTable<Funcionario>("funcionarios", initialFuncionarios, { orderBy: "nome" });

  return (
    <div className="mx-auto flex h-screen max-w-7xl flex-col gap-3 px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-900" title="Voltar ao hub">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <h1 className="text-2xl font-extrabold text-slate-900">Funcionários</h1>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{funcionarios.length}</span>
        </div>
      </div>

      <GridFuncionarios items={funcionarios} refetch={refetchFunc} />
    </div>
  );
}

/* ============================================================
   Grid Funcionários — cards compactos com edição rápida
   ============================================================ */
const TIPO_OPTIONS = ["mascaras", "toucas", "campos", "laminados", "stock", "outros"] as const;

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
];

const DEPARTAMENTOS = ["Produção", "Qualidade", "Logística", "Comercial", "Administração", "Manutenção", "Outros"];
const FUNCOES = ["Operador", "Chefe de linha", "Supervisor", "Responsável", "Técnico de Qualidade", "Administrativo", "Gestor", "Outro"];
const ACESSOS_DISPONIVEIS: { key: string; label: string; icon: string }[] = [
  { key: "planeamento", label: "Planeamento", icon: "📅" },
  { key: "gestao", label: "Gestão", icon: "🏭" },
  { key: "operador", label: "Operador", icon: "👷" },
  { key: "kpis", label: "KPIs", icon: "📊" },
  { key: "qualidade", label: "Qualidade", icon: "🔬" },
  { key: "dados", label: "Dados", icon: "⚙️" },
];

type FuncData = {
  nome: string;
  iniciais: string;
  cor: string;
  ativo: boolean;
  email: string;
  departamento: string;
  funcao: string;
  acessos: string[];
  pin: string;
};

const EMPTY_FUNC: FuncData = { nome: "", iniciais: "", cor: "#64748b", ativo: true, email: "", departamento: "", funcao: "", acessos: [], pin: "" };

function GridFuncionarios({ items, refetch }: { items: Funcionario[]; refetch: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [data, setData] = useState<FuncData>(EMPTY_FUNC);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showInativos, setShowInativos] = useState(false);

  const filtered = items.filter((f) => {
    if (!showInativos && !f.ativo) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.nome.toLowerCase().includes(q) ||
      (f.iniciais ?? "").toLowerCase().includes(q) ||
      (f.email ?? "").toLowerCase().includes(q) ||
      (f.departamento ?? "").toLowerCase().includes(q) ||
      (f.funcao ?? "").toLowerCase().includes(q)
    );
  });

  const openEdit = (f: Funcionario) => {
    setEditId(f.id);
    setData({
      nome: f.nome,
      iniciais: f.iniciais ?? "",
      cor: f.cor ?? "#64748b",
      ativo: f.ativo,
      email: f.email ?? "",
      departamento: f.departamento ?? "",
      funcao: f.funcao ?? "",
      acessos: f.acessos ?? [],
      pin: f.pin ?? "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setData(EMPTY_FUNC);
    setDialogOpen(true);
  };

  const close = () => { setDialogOpen(false); setEditId(null); };

  const save = useCallback(async () => {
    if (!data.nome.trim()) return;
    setSaving(true);
    const iniciaisAuto = data.iniciais.trim() || data.nome.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    const payload = {
      nome: data.nome.trim(),
      iniciais: iniciaisAuto || null,
      cor: data.cor,
      ativo: data.ativo,
      email: data.email.trim() || null,
      departamento: data.departamento.trim() || null,
      funcao: data.funcao.trim() || null,
      acessos: data.acessos,
      pin: data.pin.trim() || null,
    };
    const { error } = editId
      ? await supabase.from("funcionarios").update(payload).eq("id", editId)
      : await supabase.from("funcionarios").insert({ ...payload, ativo: true });
    setSaving(false);
    if (error) toast.error(`Erro: ${error.message}`);
    else { toast.success(editId ? "Guardado" : "Criado"); close(); refetch(); }
  }, [editId, data, refetch]);

  const remove = useCallback(async () => {
    if (!editId) return;
    if (!confirm(`Apagar "${data.nome}"? Histórico mantém-se.`)) return;
    const { error } = await supabase.from("funcionarios").delete().eq("id", editId);
    if (error) toast.error("Erro ao apagar");
    else { toast.success("Apagado"); close(); refetch(); }
  }, [editId, data.nome, refetch]);

  const toggleAcesso = (key: string) => {
    setData((d) => ({ ...d, acessos: d.acessos.includes(key) ? d.acessos.filter((k) => k !== key) : [...d.acessos, key] }));
  };

  const iniciaisPreview = (data.iniciais || data.nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")).toUpperCase() || "?";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por nome, email, departamento, função…"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50">
          <input type="checkbox" checked={showInativos} onChange={(e) => setShowInativos(e.target.checked)} className="h-3.5 w-3.5" />
          Mostrar inativos
        </label>
        <button
          onClick={openNew}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >+ Novo funcionário</button>
      </div>

      {/* Tabela */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3 w-20">Iniciais</th>
              <th className="px-4 py-3 w-36">Departamento</th>
              <th className="px-4 py-3 w-36">Função</th>
              <th className="px-4 py-3 w-24">PIN</th>
              <th className="px-4 py-3 w-48">Acessos</th>
              <th className="px-4 py-3 w-20 text-center">Estado</th>
              <th className="px-4 py-3 w-20 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr
                key={f.id}
                className={cn("border-b border-slate-100 hover:bg-slate-50", !f.ativo && "opacity-50")}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                      style={{ backgroundColor: f.cor ?? "#64748b" }}
                    >
                      {f.iniciais ?? f.nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-900">{f.nome}</p>
                      {f.email && <p className="text-[11px] text-slate-400">{f.email}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono font-extrabold text-slate-700">{f.iniciais ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{f.departamento ?? <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-2.5 text-slate-600">{f.funcao ?? <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-2.5">
                  {f.pin
                    ? <span className="font-mono font-bold text-slate-700">{"•".repeat(f.pin.length)}</span>
                    : <span className="text-[11px] font-bold text-amber-600">Sem PIN</span>
                  }
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-0.5 max-w-[160px]">
                    {(f.acessos ?? []).slice(0, 4).map((a) => (
                      <span key={a} className="rounded bg-slate-800 px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-white">{a}</span>
                    ))}
                    {(f.acessos ?? []).length > 4 && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[8px] font-extrabold text-slate-600" title={(f.acessos ?? []).slice(4).join(", ")}>+{(f.acessos ?? []).length - 4}</span>
                    )}
                    {(f.acessos ?? []).length === 0 && <span className="text-slate-300 text-[11px]">—</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase",
                    f.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  )}>
                    {f.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => openEdit(f)}
                    className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  >Editar</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                  {search ? `Nenhum funcionário corresponde a "${search}"` : "Sem funcionários"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <button
          onClick={openNew}
          className="flex w-full items-center justify-center gap-2 border-t border-dashed border-slate-200 py-3 text-sm font-bold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
        >
          + Novo Funcionário
        </button>
      </div>

      {/* Modal */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-3xl max-h-[92vh] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-black text-white shadow ring-2 ring-white"
                  style={{ backgroundColor: data.cor }}
                >{iniciaisPreview}</div>
                <div>
                  <h3 className="text-base font-black text-slate-900">{editId ? "Editar funcionário" : "Novo funcionário"}</h3>
                  <p className="text-[11px] font-bold text-slate-500">Perfil completo: dados, cor, acessos</p>
                </div>
              </div>
              <button onClick={close} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Identificação */}
                <section className="md:col-span-2">
                  <h4 className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Identificação</h4>
                  <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Nome *</label>
                      <input
                        value={data.nome}
                        onChange={(e) => setData((d) => ({ ...d, nome: e.target.value }))}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold"
                        placeholder="Nome completo"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Iniciais</label>
                      <input
                        value={data.iniciais}
                        onChange={(e) => setData((d) => ({ ...d, iniciais: e.target.value.toUpperCase() }))}
                        maxLength={3}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-center text-sm font-extrabold tracking-wider"
                        placeholder="auto"
                      />
                    </div>
                  </div>
                </section>

                {/* Contacto + Empresa */}
                <section>
                  <h4 className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Contacto &amp; PIN</h4>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Email</label>
                      <input
                        type="email"
                        value={data.email}
                        onChange={(e) => setData((d) => ({ ...d, email: e.target.value }))}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold"
                        placeholder="nome@oasipor.pt"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">PIN (entrada/pausa/saída)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        pattern="[0-9]*"
                        value={data.pin}
                        onChange={(e) => setData((d) => ({ ...d, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono font-extrabold tracking-[0.3em]"
                        placeholder="4–6 dígitos"
                      />
                      <p className="mt-0.5 text-[10px] font-bold text-slate-400">Usado pela pessoa para marcar presença na linha</p>
                    </div>
                  </div>
                </section>
                <section>
                  <h4 className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Organização</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Departamento</label>
                      <input
                        value={data.departamento}
                        onChange={(e) => setData((d) => ({ ...d, departamento: e.target.value }))}
                        list="deps-list"
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold"
                        placeholder="Ex: Produção"
                      />
                      <datalist id="deps-list">
                        {DEPARTAMENTOS.map((d) => <option key={d} value={d} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Função</label>
                      <input
                        value={data.funcao}
                        onChange={(e) => setData((d) => ({ ...d, funcao: e.target.value }))}
                        list="fn-list"
                        className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold"
                        placeholder="Ex: Operador"
                      />
                      <datalist id="fn-list">
                        {FUNCOES.map((f) => <option key={f} value={f} />)}
                      </datalist>
                    </div>
                  </div>
                </section>

                {/* Cor */}
                <section className="md:col-span-2">
                  <h4 className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Cor do avatar</h4>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setData((d) => ({ ...d, cor: c }))}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition-all hover:scale-110",
                          data.cor === c ? "border-slate-900 ring-2 ring-slate-300" : "border-white shadow"
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={`Cor ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={data.cor}
                      onChange={(e) => setData((d) => ({ ...d, cor: e.target.value }))}
                      className="h-7 w-10 cursor-pointer rounded border border-slate-200"
                      title="Cor personalizada"
                    />
                  </div>
                </section>

                {/* Acessos */}
                <section className="md:col-span-2">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Acessos aos dashboards</h4>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setData((d) => ({ ...d, acessos: ACESSOS_DISPONIVEIS.map((a) => a.key) }))}
                        className="rounded px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100"
                      >Selecionar todos</button>
                      <button
                        type="button"
                        onClick={() => setData((d) => ({ ...d, acessos: [] }))}
                        className="rounded px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100"
                      >Nenhum</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {ACESSOS_DISPONIVEIS.map((a) => {
                      const on = data.acessos.includes(a.key);
                      return (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => toggleAcesso(a.key)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-left text-xs font-extrabold transition-all",
                            on
                              ? "border-emerald-400 bg-emerald-50 text-emerald-800 shadow-sm"
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                          )}
                        >
                          <span className="text-base">{a.icon}</span>
                          <span className="flex-1 truncate">{a.label}</span>
                          {on && <span className="text-emerald-600">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={data.ativo}
                    onChange={(e) => setData((d) => ({ ...d, ativo: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  Ativo
                </label>
                {editId && (
                  <button
                    onClick={remove}
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                  >Apagar</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={close} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button
                  onClick={save}
                  disabled={saving || !data.nome.trim()}
                  className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >{saving ? "A guardar…" : editId ? "Guardar" : "Criar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Tabela Produtos — com coluna Tipo + import Excel
   ============================================================ */
interface ImportRow {
  referencia: string;
  descricao: string;
  tipo: string;
}

function TabelaProdutos({ items, refetch }: { items: Produto[]; refetch: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ referencia: "", descricao: "", tipo: "", tipo_caixa: "", qtd_por_caixa: "" });
  const [newRow, setNewRow] = useState(false);
  const [newData, setNewData] = useState({ referencia: "", descricao: "", tipo: "", tipo_caixa: "", qtd_por_caixa: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [defaultTipo, setDefaultTipo] = useState("");
  const [importing, setImporting] = useState(false);

  const filtered = search.trim()
    ? items.filter((p) =>
        p.referencia.toLowerCase().includes(search.toLowerCase()) ||
        p.descricao.toLowerCase().includes(search.toLowerCase()) ||
        (p.tipo ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const startEdit = (p: Produto) => {
    setEditId(p.id);
    setEditData({
      referencia: p.referencia ?? "",
      descricao: p.descricao ?? "",
      tipo: p.tipo ?? "",
      tipo_caixa: p.tipo_caixa ?? "",
      qtd_por_caixa: p.qtd_por_caixa != null ? String(p.qtd_por_caixa) : "",
    });
  };
  const cancelEdit = () => setEditId(null);

  const saveEdit = useCallback(async () => {
    if (!editId || !editData.referencia.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("produtos").update({
      referencia: editData.referencia.trim(),
      descricao: editData.descricao.trim(),
      tipo: editData.tipo.trim() || null,
      tipo_caixa: editData.tipo_caixa || null,
      qtd_por_caixa: editData.qtd_por_caixa === "" ? null : Number(editData.qtd_por_caixa),
    }).eq("id", editId);
    setSaving(false);
    if (error) toast.error("Erro ao guardar");
    else { toast.success("Guardado"); setEditId(null); refetch(); }
  }, [editId, editData, refetch]);

  const addNew = useCallback(async () => {
    if (!newData.referencia.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("produtos").insert({
      referencia: newData.referencia.trim(),
      descricao: newData.descricao.trim(),
      tipo: newData.tipo.trim() || null,
      tipo_caixa: newData.tipo_caixa || null,
      qtd_por_caixa: newData.qtd_por_caixa === "" ? null : Number(newData.qtd_por_caixa),
    });
    setSaving(false);
    if (error) toast.error("Erro ao criar");
    else { toast.success("Produto criado"); setNewRow(false); setNewData({ referencia: "", descricao: "", tipo: "", tipo_caixa: "", qtd_por_caixa: "" }); refetch(); }
  }, [newData, refetch]);

  const remove = useCallback(async (id: string) => {
    if (!confirm("Apagar este produto?")) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) toast.error("Erro ao apagar");
    else { toast.success("Apagado"); refetch(); }
  }, [refetch]);

  // ---- Excel Import ----
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        const rows: ImportRow[] = json.map((row) => {
          // Tentar várias variantes de nomes de coluna
          const ref = String(row["referencia"] ?? row["Referencia"] ?? row["Referência"] ?? row["ref"] ?? row["Ref"] ?? row["REF"] ?? row["codigo"] ?? row["Codigo"] ?? row["Código"] ?? "").trim();
          const desc = String(row["descricao"] ?? row["Descricao"] ?? row["Descrição"] ?? row["desc"] ?? row["Desc"] ?? row["produto"] ?? row["Produto"] ?? row["nome"] ?? row["Nome"] ?? "").trim();
          const tipo = String(row["tipo"] ?? row["Tipo"] ?? row["TIPO"] ?? row["type"] ?? row["Type"] ?? "").trim();
          return { referencia: ref, descricao: desc, tipo };
        }).filter((r) => r.referencia.length > 0);

        if (rows.length === 0) {
          toast.error("Nenhum produto encontrado no ficheiro. Verifique que tem coluna 'referencia'.");
          return;
        }

        // Verificar se há tipos em falta
        const semTipo = rows.filter((r) => !r.tipo);
        if (semTipo.length > 0 && semTipo.length < rows.length) {
          // Alguns têm tipo, outros não — manter como está, podem selecionar default
        }

        setImportRows(rows);
        setDefaultTipo("");
      } catch {
        toast.error("Erro ao ler ficheiro Excel");
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input para permitir selecionar o mesmo ficheiro novamente
    e.target.value = "";
  }

  async function confirmImport() {
    if (!importRows) return;
    setImporting(true);

    const toInsert = importRows.map((r) => ({
      referencia: r.referencia,
      descricao: r.descricao,
      tipo: r.tipo || defaultTipo || null,
    }));

    // Inserir em lotes de 100
    let inserted = 0;
    let errors = 0;
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase.from("produtos").insert(batch);
      if (error) errors++;
      else inserted += batch.length;
    }

    setImporting(false);
    setImportRows(null);

    if (errors > 0) toast.error(`Alguns lotes falharam (${errors} erros)`);
    toast.success(`${inserted} produtos importados`);
    refetch();
  }

  // Contagem de linhas sem tipo
  const semTipoCount = importRows?.filter((r) => !r.tipo).length ?? 0;

  return (
    <div>
      {/* Toolbar: Pesquisa + Import */}
      <div className="mb-3 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por referência, descrição ou tipo..."
          className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
        <button
          onClick={() => fileRef.current?.click()}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          Importar Excel
        </button>
      </div>

      {/* Modal de pré-visualização do import */}
      {importRows && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-blue-900">
              Pré-visualização — {importRows.length} produto{importRows.length !== 1 ? "s" : ""} encontrado{importRows.length !== 1 ? "s" : ""}
            </h3>
            <button onClick={() => setImportRows(null)} className="text-xs font-bold text-blue-600 hover:text-blue-800">Cancelar</button>
          </div>

          {/* Selector de tipo default para os que não têm */}
          {semTipoCount > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <span className="text-sm font-bold text-amber-800">
                {semTipoCount} produto{semTipoCount !== 1 ? "s" : ""} sem tipo definido.
              </span>
              <span className="text-sm text-amber-700">Tipo por defeito:</span>
              <select
                value={defaultTipo}
                onChange={(e) => setDefaultTipo(e.target.value)}
                className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm font-bold text-slate-900"
              >
                <option value="">— Nenhum —</option>
                {TIPO_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* Preview table */}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-blue-200 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-blue-100 bg-blue-50/50 text-left font-bold uppercase text-blue-600">
                  <th className="px-3 py-2 w-32">Ref</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2 w-32">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {importRows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="px-3 py-1.5 font-mono font-bold">{r.referencia}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.descricao}</td>
                    <td className="px-3 py-1.5">
                      {r.tipo ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700">{r.tipo}</span>
                      ) : (
                        <span className="text-amber-500 italic">{defaultTipo || "sem tipo"}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {importRows.length > 20 && (
                  <tr><td colSpan={3} className="px-3 py-2 text-center text-slate-400">... e mais {importRows.length - 20} linhas</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setImportRows(null)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">
              Cancelar
            </button>
            <button
              onClick={confirmImport}
              disabled={importing}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? "A importar..." : `Importar ${importRows.length} produtos`}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 w-32">Referência</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 w-28">Tipo</th>
              <th className="px-4 py-3 w-28">Caixa</th>
              <th className="px-4 py-3 w-24 text-right">Qtd/Caixa</th>
              <th className="px-4 py-3 w-28 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                {editId === p.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input value={editData.referencia} onChange={(e) => setEditData((d) => ({ ...d, referencia: e.target.value }))}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-sm" autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                    </td>
                    <td className="px-4 py-2">
                      <input value={editData.descricao} onChange={(e) => setEditData((d) => ({ ...d, descricao: e.target.value }))}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                    </td>
                    <td className="px-4 py-2">
                      <select value={editData.tipo} onChange={(e) => setEditData((d) => ({ ...d, tipo: e.target.value }))}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm">
                        <option value="">—</option>
                        {TIPO_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select value={editData.tipo_caixa} onChange={(e) => setEditData((d) => ({ ...d, tipo_caixa: e.target.value }))}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm">
                        <option value="">—</option>
                        <option value="termo">Termo</option>
                        <option value="manual">Manual</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" min={0} value={editData.qtd_por_caixa} onChange={(e) => setEditData((d) => ({ ...d, qtd_por_caixa: e.target.value }))}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-right"
                        placeholder="—"
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={saveEdit} disabled={saving} className="mr-2 rounded-md bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-200">{saving ? "..." : "Guardar"}</button>
                      <button onClick={cancelEdit} className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200">Cancelar</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{p.referencia}</td>
                    <td className="px-4 py-2.5 text-slate-700">{p.descricao}</td>
                    <td className="px-4 py-2.5">
                      {p.tipo && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{p.tipo}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.tipo_caixa === "termo" && <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-extrabold text-sky-700" title="558×378×314 mm">Termo</span>}
                      {p.tipo_caixa === "manual" && <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-extrabold text-violet-700" title="575×390×420 mm">Manual</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-900">{p.qtd_por_caixa ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => startEdit(p)} className="mr-2 rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200">Editar</button>
                      <button onClick={() => remove(p.id)} className="rounded-md bg-red-50 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-100">Apagar</button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {filtered.length === 0 && !newRow && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  {search ? "Nenhum produto encontrado" : "Sem produtos registados"}
                </td>
              </tr>
            )}

            {newRow && (
              <tr className="border-b border-slate-100 bg-blue-50/30">
                <td className="px-4 py-2">
                  <input value={newData.referencia} onChange={(e) => setNewData((d) => ({ ...d, referencia: e.target.value }))}
                    placeholder="Ex: 213112" className="w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-sm" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") addNew(); if (e.key === "Escape") setNewRow(false); }} />
                </td>
                <td className="px-4 py-2">
                  <input value={newData.descricao} onChange={(e) => setNewData((d) => ({ ...d, descricao: e.target.value }))}
                    placeholder="Ex: Campo Cirúrgico 75x90" className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") addNew(); if (e.key === "Escape") setNewRow(false); }} />
                </td>
                <td className="px-4 py-2">
                  <select value={newData.tipo} onChange={(e) => setNewData((d) => ({ ...d, tipo: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm">
                    <option value="">—</option>
                    {TIPO_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select value={newData.tipo_caixa} onChange={(e) => setNewData((d) => ({ ...d, tipo_caixa: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm">
                    <option value="">—</option>
                    <option value="termo">Termo</option>
                    <option value="manual">Manual</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input type="number" min={0} value={newData.qtd_por_caixa} onChange={(e) => setNewData((d) => ({ ...d, qtd_por_caixa: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-right"
                    placeholder="—"
                    onKeyDown={(e) => { if (e.key === "Enter") addNew(); if (e.key === "Escape") setNewRow(false); }} />
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={addNew} disabled={saving} className="mr-2 rounded-md bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-200">{saving ? "..." : "Adicionar"}</button>
                  <button onClick={() => setNewRow(false)} className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200">Cancelar</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!newRow && (
          <button onClick={() => setNewRow(true)}
            className="flex w-full items-center justify-center gap-2 border-t border-dashed border-slate-200 py-3 text-sm font-bold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600">
            + Novo Produto
          </button>
        )}
      </div>
    </div>
  );
}
