"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { ZONAS_OP, TIPO_LINHA_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { OrdemProducao, Produto } from "@/lib/types";

interface FormOPProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: OrdemProducao | null;
  defaultZona?: string;
  /** Modo painel: apenas edita Qtd Feita / Estado / Notas. Restante é read-only. */
  painelMode?: boolean;
  /** Navegação entre OPs da lista */
  onPrev?: () => void;
  onNext?: () => void;
  navInfo?: { current: number; total: number };
}

/** Mapeia zona do form + tipo_linha → zona_id real no DB */
function resolveZonaId(formZona: string, tipoLinha: string | null): string {
  if (formZona === "sl2_linhas") {
    if (tipoLinha === "termoformadora") return "sl2_termo";
    return "sl2_manual";
  }
  return formZona;
}

/** Zona do form a partir do zona_id real */
function formZonaFromId(zonaId: string): string {
  if (zonaId === "sl2_manual" || zonaId === "sl2_termo") return "sl2_linhas";
  return zonaId;
}

export function FormOP({ open, onOpenChange, editItem, defaultZona, painelMode = false, onPrev, onNext, navInfo }: FormOPProps) {
  const [loading, setLoading] = useState(false);
  const [selectedZona, setSelectedZona] = useState(
    editItem ? formZonaFromId(editItem.zona_id) : (defaultZona ? formZonaFromId(defaultZona) : "")
  );

  // Autocomplete de produtos
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [refValue, setRefValue] = useState(editItem?.produto_codigo ?? "");
  const [nomeValue, setNomeValue] = useState(editItem?.produto_nome ?? "");
  const [suggestions, setSuggestions] = useState<Produto[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("produtos").select("*").order("referencia").then(({ data }) => {
      if (data) setProdutos(data as Produto[]);
    });
  }, []);

  function handleRefChange(val: string) {
    setRefValue(val);
    if (val.trim().length >= 1) {
      const matches = produtos.filter((p) =>
        p.referencia.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 8);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }

  function selectProduto(p: Produto) {
    setRefValue(p.referencia);
    setNomeValue(p.descricao);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    // Modo painel: apenas atualiza estado / notas (quantidade_atual é gerida no painel do operador)
    if (painelMode && editItem) {
      const patch = {
        estado: form.get("estado") as string,
        notas: (form.get("notas") as string) || null,
      };
      const { error } = await supabase.from("ordens_producao").update(patch).eq("id", editItem.id);
      setLoading(false);
      if (error) { console.error("save painel", error); toast.error(`Erro ao guardar: ${error.message}`); return; }
      toast.success("OP atualizada");
      onOpenChange(false);
      return;
    }

    // selects disabled não submetem via FormData — usar estado + editItem
    const formZona = selectedZona || (editItem ? formZonaFromId(editItem.zona_id) : "");
    const tipoLinha = (form.get("tipo_linha") as string) || editItem?.tipo_linha || null;
    const zonaId = resolveZonaId(formZona, tipoLinha);
    if (!zonaId) { setLoading(false); toast.error("Zona em falta"); return; }

    const data = {
      numero: (form.get("numero") as string) || null,
      zona_id: zonaId,
      produto_codigo: refValue.trim() || null,
      produto_nome: nomeValue.trim(),
      lote: (form.get("lote") as string) || null,
      cliente: (form.get("cliente") as string) || null,
      categoria: (form.get("categoria") as string) || null,
      quantidade_alvo: Number(form.get("quantidade_alvo") || 0),
      // quantidade_atual não é editável aqui — preserva valor existente ou 0 em novas OPs
      quantidade_atual: editItem?.quantidade_atual ?? 0,
      estado: form.get("estado") as string,
      prioridade: form.get("prioridade") as string,
      tipo_linha: tipoLinha,
      inicio_previsto: (form.get("inicio_previsto") as string) || null,
      fim_previsto: (form.get("fim_previsto") as string) || null,
      responsavel: (form.get("responsavel") as string) || null,
      notas: (form.get("notas") as string) || null,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from("ordens_producao").update(data).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("ordens_producao").insert({ ...data, inicio: data.estado === "em_curso" ? new Date().toISOString() : null }));
    }

    setLoading(false);
    if (error) {
      console.error("save op", error, data);
      toast.error(`Erro ao guardar OP: ${error.message}`);
      return;
    }
    toast.success(editItem ? "OP atualizada" : "OP criada");
    onOpenChange(false);
  }

  const defaultInicioPrev = editItem?.inicio_previsto
    ? new Date(editItem.inicio_previsto).toISOString().slice(0, 16)
    : "";
  const defaultFim = editItem?.fim_previsto
    ? new Date(editItem.fim_previsto).toISOString().slice(0, 16)
    : "";

  async function concluir() {
    if (!editItem) return;
    if (!confirm(`Concluir a OP "${editItem.produto_nome}"? Tens mesmo a certeza?`)) return;
    const { error } = await supabase
      .from("ordens_producao")
      .update({ estado: "concluida", fim_real: new Date().toISOString() })
      .eq("id", editItem.id);
    if (error) toast.error("Erro ao concluir");
    else {
      toast.success("OP concluída");
      onOpenChange(false);
    }
  }

  async function apagar() {
    if (!editItem) return;
    if (!confirm(`Apagar a OP "${editItem.produto_nome}"? Tens mesmo a certeza? Esta acção é irreversível.`)) return;
    const { error } = await supabase.from("ordens_producao").delete().eq("id", editItem.id);
    if (error) toast.error("Erro ao apagar OP");
    else {
      toast.success("OP apagada");
      onOpenChange(false);
    }
  }

  // Modo painel: render reduzido
  if (painelMode && editItem) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-200 bg-white text-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atualizar OP</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Info read-only */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center gap-2">
                {editItem.produto_codigo && (
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-extrabold text-white">
                    {editItem.produto_codigo}
                  </span>
                )}
                <span className="font-extrabold text-slate-900">{editItem.produto_nome}</span>
              </div>
              <div className="mt-1 text-xs font-bold text-slate-500">
                {editItem.cliente ?? "—"}
                {editItem.lote && <span className="ml-2 rounded bg-sky-100 px-1 text-sky-700">L {editItem.lote}</span>}
              </div>
              <div className="mt-1 text-[11px] font-bold text-slate-400">
                Alvo: {editItem.quantidade_alvo} un · Zona: {editItem.zona_id}
              </div>
              <p className="mt-2 text-[10px] font-bold text-slate-400">
                Alterações estruturais (produto, zona, datas, prioridade) apenas em Planeamento.
              </p>
            </div>

            <div>
              <Label htmlFor="quantidade_atual">Qtd Feita</Label>
              <Input
                id="quantidade_atual"
                name="quantidade_atual"
                type="number"
                min={0}
                defaultValue={editItem.quantidade_atual ?? 0}
                className="mt-1 bg-slate-100 text-slate-600"
                readOnly
                disabled
                title="A quantidade feita é atualizada no painel do operador"
              />
              <p className="mt-0.5 text-[10px] font-bold text-slate-400">Atualizada no painel do operador</p>
            </div>

            <div>
              <Label htmlFor="estado">Estado</Label>
              <Select name="estado" defaultValue={editItem.estado ?? "planeada"}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planeada">Planeada</SelectItem>
                  <SelectItem value="em_curso">Em Curso</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" name="notas" rows={2} defaultValue={editItem.notas ?? ""} className="mt-1" />
            </div>

            <div className="mt-2 flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "A guardar..." : "Guardar"}
              </Button>
              {editItem.estado !== "concluida" && (
                <Button type="button" variant="secondary" onClick={concluir} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                  ✓ Concluir
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-200 bg-white text-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Ordem de Produção" : "Nova Ordem de Produção"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numero">Nº OP</Label>
              <Input id="numero" name="numero" defaultValue={editItem?.numero ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="zona_id">Zona</Label>
              <select
                id="zona_id"
                name="zona_id"
                value={selectedZona}
                disabled
                className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
              >
                <option value="">—</option>
                {ZONAS_OP.map((z) => (
                  <option key={z.id} value={z.id}>{z.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tipo: auto (derivado do produto/pedido) */}
          <div>
            <Label htmlFor="tipo_linha">Tipo (auto)</Label>
            <select
              id="tipo_linha"
              name="tipo_linha"
              defaultValue={editItem?.tipo_linha ?? ""}
              disabled
              className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
            >
              <option value="">— Nenhum —</option>
              {TIPO_LINHA_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          {/* Ref com autocomplete + Nome do produto */}
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div className="relative">
              <Label htmlFor="produto_codigo">Ref / Código</Label>
              <Input
                id="produto_codigo"
                value={refValue}
                onChange={(e) => handleRefChange(e.target.value)}
                onFocus={() => { if (refValue.trim().length >= 1) handleRefChange(refValue); }}
                onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); }}
                className="mt-1 font-mono"
                placeholder="ex: 213112"
                autoComplete="off"
              />
              {showSuggestions && (
                <div ref={suggestionsRef} className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                  {suggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => selectProduto(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
                    >
                      <span className="font-mono font-bold text-slate-900">{p.referencia}</span>
                      <span className="truncate text-slate-500">{p.descricao}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="produto_nome">Produto *</Label>
              <Input
                id="produto_nome"
                value={nomeValue}
                onChange={(e) => setNomeValue(e.target.value)}
                required
                className="mt-1"
                placeholder="ex: Campo cirúrgico 75×90"
              />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div>
              <Label htmlFor="cliente">Cliente</Label>
              <Input id="cliente" name="cliente" defaultValue={editItem?.cliente ?? ""} className="mt-1" placeholder="ex: ULS Alto Ave" />
            </div>
            <div>
              <Label htmlFor="lote">Lote</Label>
              <Input id="lote" name="lote" defaultValue={editItem?.lote ?? ""} className="mt-1" placeholder="ex: A" />
            </div>
          </div>
          <div>
            <Label htmlFor="categoria">Categoria</Label>
            <select
              id="categoria"
              name="categoria"
              defaultValue={editItem?.categoria ?? ""}
              className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">— Nenhum —</option>
              <option value="campo">Campo Cirúrgico</option>
              <option value="trouxa">Trouxa</option>
              <option value="pack">Pack</option>
              <option value="outros">Outros</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantidade_atual">Qtd Feita</Label>
              <Input
                id="quantidade_atual"
                name="quantidade_atual"
                type="number"
                min={0}
                defaultValue={editItem?.quantidade_atual ?? 0}
                className="mt-1 bg-slate-100 text-slate-600"
                readOnly
                disabled
                title="A quantidade feita é atualizada no painel do operador"
              />
              <p className="mt-0.5 text-[10px] font-bold text-slate-400">Atualizada no painel do operador</p>
            </div>
            <div>
              <Label htmlFor="quantidade_alvo">Qtd Alvo</Label>
              <Input id="quantidade_alvo" name="quantidade_alvo" type="number" min={0} defaultValue={editItem?.quantidade_alvo ?? 0} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="estado">Estado</Label>
              <Select name="estado" defaultValue={editItem?.estado ?? "planeada"}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planeada">Planeada</SelectItem>
                  <SelectItem value="em_curso">Em Curso</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select name="prioridade" defaultValue={editItem?.prioridade ?? "normal"}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inicio_previsto">Início Previsto</Label>
              <Input id="inicio_previsto" name="inicio_previsto" type="datetime-local" defaultValue={defaultInicioPrev} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="fim_previsto">Fim Previsto</Label>
              <Input id="fim_previsto" name="fim_previsto" type="datetime-local" defaultValue={defaultFim} className="mt-1" />
            </div>
          </div>
          <input type="hidden" name="responsavel" value={editItem?.responsavel ?? ""} />
          <div>
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" rows={2} defaultValue={editItem?.notas ?? ""} className="mt-1" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "A guardar..." : editItem ? "Guardar" : "Adicionar"}
            </Button>
            {editItem && editItem.estado !== "concluida" && (
              <Button type="button" variant="secondary" onClick={concluir} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                ✓ Concluir
              </Button>
            )}
            {editItem && (
              <Button type="button" variant="secondary" onClick={apagar} className="bg-red-100 text-red-700 hover:bg-red-200">
                Apagar
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
