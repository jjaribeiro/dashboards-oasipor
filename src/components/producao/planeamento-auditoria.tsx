"use client";

import { useMemo, useState } from "react";
import type { AuditLog } from "@/lib/types";

const ACOES_LABEL: Record<string, { label: string; icon: string; cor: string }> = {
  login_comercial: { label: "Login Comercial", icon: "🔑", cor: "bg-blue-100 text-blue-700" },
  login_gestao: { label: "Login Gestão", icon: "🔑", cor: "bg-purple-100 text-purple-700" },
  login_operador: { label: "Login Operador", icon: "🔑", cor: "bg-emerald-100 text-emerald-700" },
  login_planeamento: { label: "Login Planeamento", icon: "🔑", cor: "bg-amber-100 text-amber-700" },
  logout_comercial: { label: "Logout Comercial", icon: "🚪", cor: "bg-slate-100 text-slate-600" },
  logout_gestao: { label: "Logout Gestão", icon: "🚪", cor: "bg-slate-100 text-slate-600" },
  logout_operador: { label: "Logout Operador", icon: "🚪", cor: "bg-slate-100 text-slate-600" },
  op_iniciar: { label: "Iniciou OP", icon: "▶", cor: "bg-emerald-100 text-emerald-700" },
  op_pausar: { label: "Pausou OP", icon: "⏸", cor: "bg-yellow-100 text-yellow-800" },
  op_retomar: { label: "Retomou OP", icon: "▶", cor: "bg-emerald-100 text-emerald-700" },
  op_concluir: { label: "Concluiu OP", icon: "✓", cor: "bg-blue-100 text-blue-700" },
  op_transferir: { label: "Transferiu OP", icon: "→", cor: "bg-purple-100 text-purple-700" },
  op_rejeito: { label: "Registou Rejeitado", icon: "❌", cor: "bg-red-100 text-red-700" },
  qty_update: { label: "Atualizou Qtd", icon: "🔢", cor: "bg-slate-100 text-slate-700" },
};

export function AuditoriaTab({ audit }: { audit: AuditLog[] }) {
  const [search, setSearch] = useState("");
  const [acao, setAcao] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return audit.filter((a) => {
      if (acao && a.acao !== acao) return false;
      if (!q) return true;
      return (
        (a.pessoa_nome ?? "").toLowerCase().includes(q) ||
        (a.zona_id ?? "").toLowerCase().includes(q) ||
        (a.acao ?? "").toLowerCase().includes(q) ||
        JSON.stringify(a.detalhes ?? {}).toLowerCase().includes(q)
      );
    });
  }, [audit, search, acao]);

  const acoesDistintas = useMemo(() => Array.from(new Set(audit.map((a) => a.acao))).sort(), [audit]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar por pessoa, zona, detalhes..."
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        />
        <select
          value={acao}
          onChange={(e) => setAcao(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        >
          <option value="">Todas as ações</option>
          {acoesDistintas.map((a) => <option key={a} value={a}>{ACOES_LABEL[a]?.label ?? a}</option>)}
        </select>
        <span className="ml-auto text-xs font-bold text-slate-500">{filtered.length} registos (últimos 7 dias)</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Quando</th>
                <th className="px-3 py-2 text-left">Quem</th>
                <th className="px-3 py-2 text-left">Ação</th>
                <th className="px-3 py-2 text-left">Zona</th>
                <th className="px-3 py-2 text-left">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const meta = ACOES_LABEL[a.acao] ?? { label: a.acao, icon: "·", cor: "bg-slate-100 text-slate-600" };
                return (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-500" suppressHydrationWarning>{new Date(a.created_at).toLocaleString("pt-PT")}</td>
                    <td className="px-3 py-1.5 font-bold text-slate-800">{a.pessoa_nome ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold ${meta.cor}`}>
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-700">{a.zona_id ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">{a.detalhes ? formatDetails(a.detalhes) : ""}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm font-bold text-slate-400">Sem registos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatDetails(d: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined || v === "") continue;
    parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(" · ");
}
