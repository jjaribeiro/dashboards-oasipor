"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { ZONA_LABEL, ZONAS_ORDEM } from "@/lib/constants";
import { toast } from "sonner";
import type { OrdemProducao } from "@/lib/types";

interface FormOPProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: OrdemProducao | null;
  defaultZona?: string;
}

export function FormOP({ open, onOpenChange, editItem, defaultZona }: FormOPProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const data = {
      numero: (form.get("numero") as string) || null,
      zona_id: form.get("zona_id") as string,
      produto_codigo: (form.get("produto_codigo") as string) || null,
      produto_nome: form.get("produto_nome") as string,
      cliente: (form.get("cliente") as string) || null,
      quantidade_alvo: Number(form.get("quantidade_alvo") || 0),
      quantidade_atual: Number(form.get("quantidade_atual") || 0),
      estado: form.get("estado") as string,
      prioridade: form.get("prioridade") as string,
      fim_previsto: (form.get("fim_previsto") as string) || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-md">
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
                defaultValue={editItem?.zona_id ?? defaultZona ?? ""}
                className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">—</option>
                {ZONAS_ORDEM.map((z) => (
                  <option key={z.id} value={z.id}>{ZONA_LABEL[z.id]}</option>
                ))}
              </select>
            </div>
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
          <div>
            <Label htmlFor="fim_previsto">Fim Previsto</Label>
            <Input id="fim_previsto" name="fim_previsto" type="datetime-local" defaultValue={defaultFim} className="mt-1" />
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
