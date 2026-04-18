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
  initialProdutos: Produto[];
}

type Tab = "funcionarios" | "produtos";

const TIPO_OPTIONS = ["Manual", "Termoformadora", "Stock"];

export function DadosGrid({ initialFuncionarios, initialProdutos }: Props) {
  const { items: funcionarios, refetch: refetchFunc } = useRealtimeTable<Funcionario>("funcionarios", initialFuncionarios, { orderBy: "nome" });
  const { items: produtos, refetch: refetchProd } = useRealtimeTable<Produto>("produtos", initialProdutos, { orderBy: "referencia" });
  const [tab, setTab] = useState<Tab>("funcionarios");

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/producao/gestao" className="flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-900" title="Voltar">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <h1 className="text-2xl font-extrabold text-slate-900">Dados de Produção</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-200 p-1">
        <button
          onClick={() => setTab("funcionarios")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-bold transition-all",
            tab === "funcionarios" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Funcionários ({funcionarios.length})
        </button>
        <button
          onClick={() => setTab("produtos")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-bold transition-all",
            tab === "produtos" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Produtos ({produtos.length})
        </button>
      </div>

      {tab === "funcionarios" && <TabelaFuncionarios items={funcionarios} refetch={refetchFunc} />}
      {tab === "produtos" && <TabelaProdutos items={produtos} refetch={refetchProd} />}
    </div>
  );
}

/* ============================================================
   Tabela Funcionários (igual)
   ============================================================ */
function TabelaFuncionarios({ items, refetch }: { items: Funcionario[]; refetch: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ nome: "", iniciais: "", cor: "#64748b" });
  const [newRow, setNewRow] = useState(false);
  const [newData, setNewData] = useState({ nome: "", iniciais: "", cor: "#64748b" });
  const [saving, setSaving] = useState(false);

  const startEdit = (f: Funcionario) => {
    setEditId(f.id);
    setEditData({ nome: f.nome, iniciais: f.iniciais ?? "", cor: f.cor ?? "#64748b" });
  };
  const cancelEdit = () => setEditId(null);

  const saveEdit = useCallback(async () => {
    if (!editId || !editData.nome.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("funcionarios").update({
      nome: editData.nome.trim(),
      iniciais: editData.iniciais.trim() || null,
      cor: editData.cor,
    }).eq("id", editId);
    setSaving(false);
    if (error) toast.error("Erro ao guardar");
    else { toast.success("Guardado"); setEditId(null); refetch(); }
  }, [editId, editData, refetch]);

  const addNew = useCallback(async () => {
    if (!newData.nome.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("funcionarios").insert({
      nome: newData.nome.trim(), iniciais: newData.iniciais.trim() || null, cor: newData.cor, ativo: true,
    });
    setSaving(false);
    if (error) toast.error("Erro ao criar");
    else { toast.success("Funcionário criado"); setNewRow(false); setNewData({ nome: "", iniciais: "", cor: "#64748b" }); refetch(); }
  }, [newData, refetch]);

  const remove = useCallback(async (id: string) => {
    if (!confirm("Apagar este funcionário?")) return;
    const { error } = await supabase.from("funcionarios").delete().eq("id", id);
    if (error) toast.error("Erro ao apagar");
    else { toast.success("Apagado"); refetch(); }
  }, [refetch]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3 w-24">Iniciais</th>
            <th className="px-4 py-3 w-20">Cor</th>
            <th className="px-4 py-3 w-28 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => (
            <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
              {editId === f.id ? (
                <>
                  <td className="px-4 py-2">
                    <input value={editData.nome} onChange={(e) => setEditData((d) => ({ ...d, nome: e.target.value }))}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                  </td>
                  <td className="px-4 py-2">
                    <input value={editData.iniciais} onChange={(e) => setEditData((d) => ({ ...d, iniciais: e.target.value }))}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-center" maxLength={3}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="color" value={editData.cor} onChange={(e) => setEditData((d) => ({ ...d, cor: e.target.value }))}
                      className="h-8 w-12 cursor-pointer rounded border border-slate-200" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={saveEdit} disabled={saving} className="mr-2 rounded-md bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-200">{saving ? "..." : "Guardar"}</button>
                    <button onClick={cancelEdit} className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200">Cancelar</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-2.5 font-bold text-slate-900">{f.nome}</td>
                  <td className="px-4 py-2.5 text-center">
                    {f.iniciais && (
                      <span className="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-extrabold text-white" style={{ backgroundColor: f.cor ?? "#64748b" }}>{f.iniciais}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5"><div className="h-6 w-10 rounded-md border border-slate-200" style={{ backgroundColor: f.cor ?? "#64748b" }} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => startEdit(f)} className="mr-2 rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200">Editar</button>
                    <button onClick={() => remove(f.id)} className="rounded-md bg-red-50 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-100">Apagar</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {newRow && (
            <tr className="border-b border-slate-100 bg-blue-50/30">
              <td className="px-4 py-2">
                <input value={newData.nome} onChange={(e) => setNewData((d) => ({ ...d, nome: e.target.value }))} placeholder="Nome do funcionário"
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") addNew(); if (e.key === "Escape") setNewRow(false); }} />
              </td>
              <td className="px-4 py-2">
                <input value={newData.iniciais} onChange={(e) => setNewData((d) => ({ ...d, iniciais: e.target.value }))} placeholder="Ex: JS"
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-center" maxLength={3}
                  onKeyDown={(e) => { if (e.key === "Enter") addNew(); if (e.key === "Escape") setNewRow(false); }} />
              </td>
              <td className="px-4 py-2">
                <input type="color" value={newData.cor} onChange={(e) => setNewData((d) => ({ ...d, cor: e.target.value }))} className="h-8 w-12 cursor-pointer rounded border border-slate-200" />
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
          + Novo Funcionário
        </button>
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
  const [editData, setEditData] = useState({ referencia: "", descricao: "", tipo: "" });
  const [newRow, setNewRow] = useState(false);
  const [newData, setNewData] = useState({ referencia: "", descricao: "", tipo: "" });
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
    setEditData({ referencia: p.referencia, descricao: p.descricao, tipo: p.tipo ?? "" });
  };
  const cancelEdit = () => setEditId(null);

  const saveEdit = useCallback(async () => {
    if (!editId || !editData.referencia.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("produtos").update({
      referencia: editData.referencia.trim(),
      descricao: editData.descricao.trim(),
      tipo: editData.tipo.trim() || null,
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
    });
    setSaving(false);
    if (error) toast.error("Erro ao criar");
    else { toast.success("Produto criado"); setNewRow(false); setNewData({ referencia: "", descricao: "", tipo: "" }); refetch(); }
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
              <th className="px-4 py-3 w-36">Referência</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 w-36">Tipo</th>
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
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
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
