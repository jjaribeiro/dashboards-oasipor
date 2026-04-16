"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { ZONAS_OP, TIPO_LINHA_OPTIONS } from "@/lib/constants";
import { toast } from "sonner";
import type { OrdemProducao } from "@/lib/types";

interface FormOPProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: OrdemProducao | null;
  defaultZona?: string;
}

/** Mapeia zona do form + tipo_linha → zona_id real no DB */
function resolveZonaId(formZona: string, tipoLinha: string | null): string {
  if (formZona === "sl2_linhas") {
    if (tipoLinha === "termoformadora") return "sl2_termo";
    return "sl2_manual"; // assembling ou stock na linha
  }
  return formZona;
}

/** Zona do form a partir do zona_id real */
function formZonaFromId(zonaId: string): string {
  if (zonaId === "sl2_manual" || zonaId === "sl2_termo") return "sl2_linhas";
  return zonaId;
}

export function FormOP({ open, onOpenChange, editItem, defaultZona }: FormOPProps) {
  const [loading, setLoading] = useState(false);
  const [selectedZona, setSelectedZona] = useState(
    editItem ? formZonaFromId(editItem.zona_id) : (defaultZona ? formZonaFromId(defaultZona) : "")
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const formZona = form.get("zona_id") as string;
    const tipoLinha = (form.get("tipo_linha") as string) || null;
    const zonaId = resolveZonaId(formZona, tipoLinha);

    const data = {
      numero: (form.get("numero") as string) || null,
      zona_id: zonaId,
      produto_codigo: (form.get("produto_codigo") as string) || null,
      produto_nome: form.get("produto_nome") as string,
      cliente: (form.get("cliente") as string) || null,
      quantidade_alvo: Number(form.get("quantidade_alvo") || 0),
      quantidade_atual: Number(form.get("quantidade_atual") || 0),
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
      toast.error("Erro ao guardar OP");
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
    if (!confirm("Tem a certeza que quer apagar esta OP?")) return;
    const { error } = await supabase.from("ordens_producao").delete().eq("id", editItem.id);
    if (error) toast.error("Erro ao apagar OP");
    else {
      toast.success("OP apagada");
      onOpenChange(false);
    }
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
              <Label htmlFor="zona_id">Zona *</Label>
              <select
                id="zona_id"
                name="zona_id"
                required
                value={selectedZona}
                onChange={(e) => setSelectedZona(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">—</option>
                {ZONAS_OP.map((z) => (
                  <option key={z.id} value={z.id}>{z.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tipo: Assembling / Termoformadora / Stock */}
          <div>
            <Label htmlFor="tipo_linha">Tipo</Label>
            <select
              id="tipo_linha"
              name="tipo_linha"
              defaultValue={editItem?.tipo_linha ?? ""}
              className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">— Nenhum —</option>
              {TIPO_LINHA_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div>
              <Label htmlFor="produto_codigo">Ref / Código</Label>
              <Input id="produto_codigo" name="produto_codigo" defaultValue={editItem?.produto_codigo ?? ""} className="mt-1 font-mono" placeholder="ex: 213112" />
            </div>
            <div>
              <Label htmlFor="produto_nome">Produto *</Label>
              <Input id="produto_nome" name="produto_nome" required defaultValue={editItem?.produto_nome ?? ""} className="mt-1" placeholder="ex: Campo cirúrgico 75×90" />
            </div>
          </div>
          <div>
            <Label htmlFor="cliente">Cliente</Label>
            <Input id="cliente" name="cliente" defaultValue={editItem?.cliente ?? ""} className="mt-1" placeholder="ex: ULS Alto Ave" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantidade_atual">Qtd Feita</Label>
              <Input id="quantidade_atual" name="quantidade_atual" type="number" min={0} defaultValue={editItem?.quantidade_atual ?? 0} className="mt-1" />
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
          <div>
            <Label htmlFor="responsavel">Responsável</Label>
            <Input id="responsavel" name="responsavel" defaultValue={editItem?.responsavel ?? ""} className="mt-1" placeholder="ex: João Silva" />
          </div>
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
