"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImportPedidosDialogProps {
  onClose: () => void;
  onImported?: () => void;
}

// Aceita tanto o formato PHC real (Referência, Designação, Pedido de Produção…) como o formato antigo (Nº OP, Ref, Produto…)
type ExcelRow = Record<string, string | number | null | undefined>;

type EstadoPedido = "pendente" | "em_producao" | "concluido" | "cancelado";
type PrioridadeOP = "por_definir" | "baixa" | "normal" | "alta" | "urgente";
type TipoLinha = "manual" | "termoformadora" | "stock" | "campos" | null;
type CategoriaProduto = "campo" | "trouxa" | "pack" | "outros" | null;

interface Parsed {
  numero: string | null;
  ficha_producao: string | null;
  produto_codigo: string | null;
  produto_nome: string;
  cliente: string | null;
  categoria: CategoriaProduto;
  tipo_linha: TipoLinha;
  quantidade_alvo: number;
  quantidade_por_caixa: number | null;
  consumos_6m: number | null;
  qtd_total_pp: number | null;
  qtd_pendente_pp: number | null;
  stock_existente: number | null;
  reservas_existentes: number | null;
  stock_status: "ok" | "pendente" | null;
  estado: EstadoPedido;
  prioridade: PrioridadeOP;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  notas: string | null;
  _row: number;
  _errors: string[];
}

// Infere categoria a partir do nome do produto — default "outros" quando nada bate
function inferirCategoria(produto_nome: string, produto_codigo: string | null): CategoriaProduto {
  const t = `${produto_nome} ${produto_codigo ?? ""}`.toLowerCase();
  if (/\b(pack|kit|set)\b/.test(t)) return "pack";
  if (/\btrouxa/.test(t)) return "trouxa";
  if (/\bcampo/.test(t)) return "campo";
  return "outros";
}

// Infere tipo_linha a partir de categoria + NE
function inferirTipo(categoria: CategoriaProduto, produto_nome: string, produto_codigo: string | null): TipoLinha {
  const isNE = /\bNE\b/i.test(produto_codigo ?? "") || /\bNE\b/i.test(produto_nome);
  if (categoria === "campo") {
    return isNE ? "stock" : "termoformadora";
  }
  // packs e trouxas: deixar null para o utilizador escolher manual vs termo
  return null;
}

const ESTADO_MAP: Record<string, EstadoPedido> = {
  "planeada": "pendente", "planeado": "pendente", "plan": "pendente", "pendente": "pendente",
  "em curso": "em_producao", "em_curso": "em_producao", "em producao": "em_producao", "em_producao": "em_producao",
  "pausada": "em_producao", "pausado": "em_producao",
  "concluida": "concluido", "concluído": "concluido", "concluido": "concluido",
  "cancelada": "cancelado", "cancelado": "cancelado",
};
// Matches em keyword (o Excel PHC usa valores longos como "Tapete Linha Manual", "Termoformadora VMS", etc).
// Normaliza e procura a palavra-chave dentro do valor.
function mapTipoLinha(raw: string | number | undefined | null): TipoLinha {
  if (raw === null || raw === undefined || raw === "") return null;
  const t = normalize(String(raw));
  if (!t) return null;
  if (/\btermo/.test(t)) return "termoformadora";
  if (/\bmanual/.test(t)) return "manual";
  if (/\bcampo/.test(t)) return "campos";       // "Máquina de Campos"
  if (/\bstock\b/.test(t)) return "stock";
  return null;
}
const PRIORIDADE_MAP: Record<string, PrioridadeOP> = {
  "baixa": "baixa",
  "normal": "normal",
  "alta": "alta",
  "urgente": "urgente",
};
const CATEGORIA_MAP: Record<string, CategoriaProduto> = {
  "campo": "campo", "campos": "campo", "campo cirurgico": "campo", "campos cirurgicos": "campo",
  "trouxa": "trouxa", "trouxas": "trouxa",
  "pack": "pack", "packs": "pack", "kit": "pack", "set": "pack",
  "outros": "outros", "outro": "outros",
};

function normalize(s: string | number | undefined | null): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[—–\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseExcelDate(v: string | number | undefined | null, dateOnly = false): string | null {
  if (v === null || v === undefined || v === "") return null;
  let dt: Date | null = null;
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = v * 24 * 60 * 60 * 1000;
    dt = new Date(epoch.getTime() + ms);
  } else {
    const s = String(v).trim();
    if (!s) return null;
    // DD.MM.YYYY (formato PHC), DD/MM/YYYY ou DD-MM-YYYY, com hora opcional
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
    if (m) {
      const [, dd, mm, yy, hh, mi] = m;
      const year = Number(yy) < 100 ? 2000 + Number(yy) : Number(yy);
      dt = new Date(year, Number(mm) - 1, Number(dd), Number(hh ?? 0), Number(mi ?? 0));
    } else {
      const d = new Date(s);
      if (!isNaN(d.getTime())) dt = d;
    }
  }
  if (!dt || isNaN(dt.getTime())) return null;
  if (dateOnly) {
    // Normalizar para meio-dia local (evita problemas de timezone quando só interessa a data)
    dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 12, 0, 0);
  }
  return dt.toISOString();
}

// Helper: procura uma coluna no row por várias possibilidades, ignorando case/espaços/acentos
function pick(row: ExcelRow, candidates: string[]): string | number | null | undefined {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const targetNorm = normalize(c);
    for (const k of keys) {
      if (normalize(k) === targetNorm) return row[k];
    }
  }
  return undefined;
}

function parseRow(row: ExcelRow, idx: number): Parsed {
  const errors: string[] = [];

  const produto_nome = String(pick(row, ["Designação", "Produto"]) ?? "").trim();
  if (!produto_nome) errors.push("Produto/Designação em falta");

  // Helper: converte valor do Excel para integer (arredonda se for decimal)
  const toInt = (v: string | number | null | undefined): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
  };

  // Qtd: "Pedido" = qty desta linha específica; fallback para "Qtd Alvo"
  const quantidade_alvo = toInt(pick(row, ["Pedido", "Qtd Alvo"])) ?? 0;
  if (!quantidade_alvo || quantidade_alvo <= 0) errors.push("Qtd inválida");

  const quantidade_por_caixa = toInt(pick(row, ["Qttporcaixa", "Qtd/Caixa", "Qtd Caixa"]));
  const consumos_6m = toInt(pick(row, ["Consumos6m", "Consumos 6m", "Consumos últimos 6 meses"]));
  const qtd_pendente_pp = toInt(pick(row, ["Pendente"]));
  const qtd_total_pp = toInt(pick(row, ["Qtd_ped", "Qtd PP"]));
  const stock_existente = toInt(pick(row, ["Stock"]));
  const reservas_existentes = toInt(pick(row, ["Reservas"]));

  // Stock de componentes (Stockcp do Excel): SIM = há stock de todos os componentes; NÃO = falta algum
  // Se a coluna não existir, cai no fallback (Stock produto acabado - Reservas vs Pedido)
  let stock_status: "ok" | "pendente" | null = null;
  const stockcpRaw = pick(row, ["Stockcp", "Stock CP", "Stock cp"]);
  if (stockcpRaw !== null && stockcpRaw !== undefined && stockcpRaw !== "") {
    const v = normalize(String(stockcpRaw));
    if (v === "sim" || v === "yes" || v === "true" || v === "1") stock_status = "ok";
    else if (v === "nao" || v === "no" || v === "false" || v === "0") stock_status = "pendente";
  } else if (stock_existente !== null) {
    // Fallback: usar Stock (produto acabado) - Reservas vs quantidade alvo
    const disponivel = stock_existente - (reservas_existentes ?? 0);
    stock_status = disponivel >= quantidade_alvo ? "ok" : "pendente";
  }

  const estadoKey = normalize(String(pick(row, ["Estado"]) ?? ""));
  const estado: EstadoPedido = estadoKey ? (ESTADO_MAP[estadoKey] ?? "pendente") : "pendente";

  // Nº Pedido (PP): "Pp" (novo Excel) / "Pedido de Produção" / "Nº OP"
  const numeroRaw = pick(row, ["Pp", "Pedido de Produção", "Nº OP", "Nº Pedido"]);
  // Ref / Referência
  const refRaw = pick(row, ["Referência", "Ref"]);
  // Cliente
  const clienteRaw = pick(row, ["Cliente"]);
  // Ficha de Produção: "Fp" (novo Excel) ou "Ficha de Produção"
  const fichaRaw = pick(row, ["Fp", "Ficha de Produção"]);
  const comercialRaw = pick(row, ["Comercial"]);
  // Notas
  const notasBaseRaw = pick(row, ["Notas"]);
  const notasParts: string[] = [];
  if (notasBaseRaw) notasParts.push(String(notasBaseRaw).trim());
  if (comercialRaw) notasParts.push(`Comercial: ${String(comercialRaw).trim()}`);
  const notas = notasParts.length > 0 ? notasParts.join(" · ") : null;

  const refStr = refRaw ? String(refRaw) : null;

  // Categoria: Excel ou inferida do nome
  const categoriaKey = normalize(String(pick(row, ["Categoria"]) ?? ""));
  let categoria: CategoriaProduto = categoriaKey ? (CATEGORIA_MAP[categoriaKey] ?? null) : null;
  if (!categoria) categoria = inferirCategoria(produto_nome, refStr);

  // Tipo: do Excel (PHC usa valores como "Tapete Linha Manual") — mapear por keyword; senão inferir
  let tipo_linha: TipoLinha = mapTipoLinha(pick(row, ["Tipo"]));
  if (!tipo_linha) tipo_linha = inferirTipo(categoria, produto_nome, refStr);

  // Prioridade: Excel (coluna "Prioridade") OU inferida de stock/reservas/cons_6m/deadline.
  const prioridadeKey = normalize(String(pick(row, ["Prioridade"]) ?? ""));
  let prioridade: PrioridadeOP = prioridadeKey ? (PRIORIDADE_MAP[prioridadeKey] ?? "por_definir") : "por_definir";
  const fimPrev = parseExcelDate(pick(row, ["Deadline", "Fim Previsto", "Prazo"]), true);

  if (!prioridadeKey) {
    const disponivel = (stock_existente ?? 0) - (reservas_existentes ?? 0);

    if (disponivel < 0) {
      // Reservas excedem stock — demanda imediata não coberta
      prioridade = "urgente";
    } else if (!consumos_6m || consumos_6m <= 0) {
      // Sem consumo histórico e stock cobre reservas → sem urgência
      prioridade = "baixa";
    } else {
      const mesesStock = (disponivel * 6) / consumos_6m;
      if (mesesStock <= 0) prioridade = "urgente";          // rompeu stock
      else if (mesesStock < 1) prioridade = "alta";          // < 1 mês
      else if (mesesStock <= 3) prioridade = "normal";       // 1–3 meses
      else prioridade = "baixa";                             // > 3 meses
    }
  }

  return {
    numero: numeroRaw ? String(numeroRaw).trim() : null,
    ficha_producao: fichaRaw ? String(fichaRaw).trim() : null,
    produto_codigo: refStr?.trim() ?? null,
    produto_nome,
    cliente: clienteRaw ? String(clienteRaw).trim() : null,
    categoria,
    tipo_linha,
    quantidade_alvo,
    quantidade_por_caixa,
    consumos_6m,
    qtd_pendente_pp,
    qtd_total_pp,
    stock_existente,
    reservas_existentes,
    stock_status,
    estado,
    prioridade,
    inicio_previsto: parseExcelDate(pick(row, ["Início Previsto"])),
    fim_previsto: fimPrev,
    notas,
    _row: idx + 2,
    _errors: errors,
  };
}

// Detecta se o Excel carregado tem colunas Tipo/Prioridade (para mostrar aviso)
function detectMissingColumns(rows: ExcelRow[]): string[] {
  if (rows.length === 0) return [];
  const keys = new Set(Object.keys(rows[0]).map((k) => normalize(k)));
  const missing: string[] = [];
  if (!keys.has("tipo")) missing.push("Tipo");
  if (!keys.has("prioridade")) missing.push("Prioridade");
  return missing;
}

export function ImportOpsDialog({ onClose, onImported }: ImportPedidosDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setFile(f);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: null });
    const filtered = rows.filter((r) => Object.values(r).some((v) => v !== null && v !== ""));
    const parsedRows = filtered.map(parseRow);
    setParsed(parsedRows);
    setMissingCols(detectMissingColumns(filtered));
  }

  async function handleImport() {
    const validos = parsed.filter((p) => p._errors.length === 0);
    if (validos.length === 0) {
      toast.error("Sem linhas válidas para importar");
      return;
    }
    setImporting(true);

    // Chave de identificação do pedido: numero + produto_codigo (unicidade natural do PP)
    const chaveOf = (r: { numero: string | null; produto_codigo: string | null }) => `${r.numero ?? "_"}__${r.produto_codigo ?? "_"}`;
    const numeros = Array.from(new Set(validos.map((p) => p.numero).filter((n): n is string => !!n)));

    // Carregar existentes (campos relevantes para decidir update)
    let existentes: Array<{ id: string; numero: string | null; produto_codigo: string | null; stock_existente: number | null; reservas_existentes: number | null; consumos_6m: number | null; qtd_pendente_pp: number | null; qtd_total_pp: number | null; stock_status: "ok" | "pendente" | null }> = [];
    if (numeros.length > 0) {
      const { data } = await supabase
        .from("pedidos_producao")
        .select("id, numero, produto_codigo, stock_existente, reservas_existentes, consumos_6m, qtd_pendente_pp, qtd_total_pp, stock_status")
        .in("numero", numeros);
      existentes = (data ?? []) as typeof existentes;
    }
    const existentesMap = new Map(existentes.map((e) => [chaveOf(e), e]));

    const novos: Parsed[] = [];
    const paraAtualizar: Array<{ id: string; p: Parsed; diffs: string[] }> = [];
    let iguais = 0;

    for (const p of validos) {
      const existente = existentesMap.get(chaveOf(p));
      if (!existente) { novos.push(p); continue; }

      // Campos a comparar e atualizar se diferentes
      const diffs: string[] = [];
      if ((existente.stock_existente ?? null) !== (p.stock_existente ?? null)) diffs.push("stock");
      if ((existente.reservas_existentes ?? null) !== (p.reservas_existentes ?? null)) diffs.push("reservas");
      if ((existente.consumos_6m ?? null) !== (p.consumos_6m ?? null)) diffs.push("consumos");
      if ((existente.qtd_pendente_pp ?? null) !== (p.qtd_pendente_pp ?? null)) diffs.push("pendente");
      if ((existente.qtd_total_pp ?? null) !== (p.qtd_total_pp ?? null)) diffs.push("qtd_pp");
      if ((existente.stock_status ?? null) !== (p.stock_status ?? null)) diffs.push("stock_status");

      if (diffs.length === 0) { iguais++; continue; }
      paraAtualizar.push({ id: existente.id, p, diffs });
    }

    // Inserir novos
    let insertError: string | null = null;
    if (novos.length > 0) {
      const payload = novos.map((p) => ({
        numero: p.numero,
        ficha_producao: p.ficha_producao,
        produto_codigo: p.produto_codigo,
        produto_nome: p.produto_nome,
        cliente: p.cliente,
        categoria: p.categoria,
        tipo_linha: p.tipo_linha,
        quantidade_alvo: p.quantidade_alvo,
        quantidade_por_caixa: p.quantidade_por_caixa,
        consumos_6m: p.consumos_6m,
        qtd_pendente_pp: p.qtd_pendente_pp,
        qtd_total_pp: p.qtd_total_pp,
        stock_existente: p.stock_existente,
        reservas_existentes: p.reservas_existentes,
        stock_status: p.stock_status,
        estado: p.estado,
        prioridade: p.prioridade,
        inicio_previsto: p.inicio_previsto,
        fim_previsto: p.fim_previsto,
        notas: p.notas,
      }));
      const { error } = await supabase.from("pedidos_producao").insert(payload);
      if (error) insertError = error.message;
    }

    // Atualizar stock/reservas/consumos dos existentes
    let atualizados = 0;
    let updateError: string | null = null;
    for (const u of paraAtualizar) {
      const { error } = await supabase.from("pedidos_producao").update({
        stock_existente: u.p.stock_existente,
        reservas_existentes: u.p.reservas_existentes,
        consumos_6m: u.p.consumos_6m,
        qtd_pendente_pp: u.p.qtd_pendente_pp,
        qtd_total_pp: u.p.qtd_total_pp,
        stock_status: u.p.stock_status,
      }).eq("id", u.id);
      if (error) { updateError = error.message; continue; }
      atualizados++;
    }

    // Guardar produtos na memória de produtos (upsert por referencia)
    const produtosParaSalvar = validos
      .filter((p) => p.produto_codigo)
      .map((p) => ({
        referencia: p.produto_codigo!,
        descricao: p.produto_nome,
        tipo: null as string | null,
        tipo_caixa: null as string | null,
        qtd_por_caixa: p.quantidade_por_caixa,
      }));
    if (produtosParaSalvar.length > 0) {
      // Upsert: actualiza descricao e qtd_por_caixa se referencia já existe; não sobrescreve tipo/tipo_caixa
      await supabase.from("produtos").upsert(
        produtosParaSalvar,
        { onConflict: "referencia", ignoreDuplicates: false }
      );
    }

    setImporting(false);

    if (insertError) { toast.error(`Erro a importar novos: ${insertError}`); return; }
    if (updateError) { toast.error(`Erro a atualizar: ${updateError}`); }

    const partes: string[] = [];
    if (novos.length > 0) partes.push(`${novos.length} novo${novos.length > 1 ? "s" : ""}`);
    if (atualizados > 0) partes.push(`${atualizados} atualizado${atualizados > 1 ? "s" : ""}`);
    if (iguais > 0) partes.push(`${iguais} sem alterações`);
    if (partes.length === 0) partes.push("Nada a importar");
    if (produtosParaSalvar.length > 0) partes.push(`${produtosParaSalvar.length} produtos gravados`);
    toast.success(partes.join(" · "));
    onImported?.();
    onClose();
  }

  const validas = parsed.filter((p) => p._errors.length === 0).length;
  const invalidas = parsed.filter((p) => p._errors.length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Importar Pedidos de Produção</h2>
            <p className="text-sm font-bold text-slate-500">Carrega um Excel — cria pedidos (as OPs por zona são criadas depois pelos operadores)</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!file && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-16 text-center transition-colors hover:border-slate-400 hover:bg-slate-100"
            >
              <div className="mb-3 text-6xl">📄</div>
              <p className="text-xl font-black text-slate-700">Clica para escolher ficheiro Excel</p>
              <p className="mt-2 text-sm font-bold text-slate-500">Suporta o Excel PHC:</p>
              <p className="mt-1 text-xs font-bold text-slate-400">
                Referência · Designação · Fp · Pp · Qtd_ped · Pendente · Pedido · Stock · Reservas · Stockcp · Tipo · Cliente · Deadline · Comercial
              </p>
              <p className="mt-1 text-[11px] italic text-slate-400">
                Categoria e Prioridade são inferidas automaticamente. Stockcp (SIM/NÃO) indica se há todos os componentes para produzir.
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {file && (
            <>
              <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div>
                  <p className="text-sm font-bold text-slate-600">📄 {file.name}</p>
                  <p className="text-xs font-bold text-slate-400">
                    {parsed.length} linhas · <span className="text-emerald-600">{validas} válidas</span>
                    {invalidas > 0 && <> · <span className="text-red-600">{invalidas} com erros</span></>}
                  </p>
                </div>
                <button
                  onClick={() => { setFile(null); setParsed([]); setMissingCols([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Trocar
                </button>
              </div>

              {missingCols.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  ⚠ Colunas em falta no Excel: <span className="font-extrabold">{missingCols.join(", ")}</span>.
                  Os pedidos serão importados com valores por defeito — podes editar depois.
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-10 px-2 py-2 text-left">#</th>
                      <th className="w-16 px-2 py-2 text-left">Nº PP</th>
                      <th className="w-16 px-2 py-2 text-left">Ref</th>
                      <th className="px-2 py-2 text-left">Produto</th>
                      <th className="w-20 px-2 py-2 text-left">Tipo/Cat</th>
                      <th className="w-14 px-2 py-2 text-right">Stock</th>
                      <th className="w-14 px-2 py-2 text-right">Reserv.</th>
                      <th className="w-14 px-2 py-2 text-right">Pedido</th>
                      <th className="w-14 px-2 py-2 text-right">Pend.</th>
                      <th className="w-20 px-2 py-2 text-center">Linha</th>
                    </tr>
                  </thead>
                </table>
                <div className="max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {parsed.map((p) => (
                        <tr
                          key={p._row}
                          className={cn(
                            "border-b border-slate-100",
                            p._errors.length > 0 ? "bg-red-50" : "hover:bg-slate-50"
                          )}
                        >
                          <td className="w-10 px-2 py-1.5 text-slate-400">{p._row}</td>
                          <td className="w-16 px-2 py-1.5 font-mono font-bold text-slate-700">{p.numero ?? "—"}</td>
                          <td className="w-16 px-2 py-1.5 font-mono font-bold text-slate-900">{p.produto_codigo ?? "—"}</td>
                          <td className="px-2 py-1.5 font-bold text-slate-700 truncate max-w-xs">{p.produto_nome || "—"}</td>
                          <td className="w-20 px-2 py-1.5 text-[10px]">
                            {p.tipo_linha && <span className="rounded bg-slate-100 px-1 font-bold text-slate-700 capitalize">{p.tipo_linha === "termoformadora" ? "Termo" : p.tipo_linha}</span>}
                            {p.categoria && <span className="ml-1 rounded bg-sky-100 px-1 font-bold text-sky-700 capitalize">{p.categoria}</span>}
                            {!p.tipo_linha && !p.categoria && <span className="text-slate-400">—</span>}
                          </td>
                          <td className="w-14 px-2 py-1.5 text-right font-bold text-slate-700">{p.stock_existente ?? "—"}</td>
                          <td className="w-14 px-2 py-1.5 text-right text-slate-500">{p.reservas_existentes ?? "—"}</td>
                          <td className="w-14 px-2 py-1.5 text-right font-bold text-slate-900">{p.quantidade_alvo}</td>
                          <td className="w-14 px-2 py-1.5 text-right text-slate-600">{p.qtd_pendente_pp ?? "—"}</td>
                          <td className="w-20 px-2 py-1.5 text-center">
                            {p._errors.length > 0 ? (
                              <span title={p._errors.join(", ")} className="rounded bg-red-200 px-1.5 py-0.5 font-extrabold text-red-800">❌ Erro</span>
                            ) : (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-extrabold text-emerald-700">✓ OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {invalidas > 0 && (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs">
                  <p className="font-extrabold text-red-700">Linhas com erros não serão importadas:</p>
                  <ul className="mt-1 list-disc pl-5 text-red-600">
                    {parsed.filter((p) => p._errors.length > 0).slice(0, 5).map((p) => (
                      <li key={p._row}>Linha {p._row}: {p._errors.join(", ")}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-6 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={importing || validas === 0}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {importing ? "A importar..." : validas > 0 ? `Importar ${validas} pedido${validas > 1 ? "s" : ""}` : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}
