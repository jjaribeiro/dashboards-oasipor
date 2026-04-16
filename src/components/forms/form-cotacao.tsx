"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { RESPONSAVEIS } from "@/lib/constants";
import { toast } from "sonner";
import type { Cotacao } from "@/lib/types";

interface FormCotacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Cotacao | null;
}

export function FormCotacao({ open, onOpenChange, editItem }: FormCotacaoProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const data = {
      numero_dossier: (form.get("numero_dossier") as string) || null,
      cliente: form.get("cliente") as string,
      descricao: form.get("descricao") as string,
      prazo: (form.get("prazo") as string) || null,
      valor: form.get("valor") ? Number(form.get("valor")) : null,
      estado: form.get("estado") as string,
      vendedor: (form.get("vendedor") as string) || null,
      responsavel: (form.get("responsavel") as string) || null,
      notas: (form.get("notas") as string) || null,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from("cotacoes").update(data).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("cotacoes").insert(data));
    }

    setLoading(false);
    if (error) {
      toast.error("Erro ao guardar cotação");
      return;
    }
    toast.success(editItem ? "Cotação atualizada" : "Cotação adicionada");
    onOpenChange(false);
  }

  const defaultPrazo = editItem?.prazo
    ? new Date(editItem.prazo).toISOString().slice(0, 16)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Cotação" : "Nova Cotação"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="numero_dossier">Dossier Interno Nº</Label>
            <Input id="numero_dossier" name="numero_dossier" defaultValue={editItem?.numero_dossier ?? ""} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cliente">Cliente *</Label>
            <Input id="cliente" name="cliente" required defaultValue={editItem?.cliente} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="descricao">Descrição *</Label>
            <Input id="descricao" name="descricao" required defaultValue={editItem?.descricao} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="prazo">Prazo</Label>
              <Input id="prazo" name="prazo" type="datetime-local" defaultValue={defaultPrazo} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="valor">Valor (EUR)</Label>
              <Input id="valor" name="valor" type="number" step="0.01" defaultValue={editItem?.valor ?? ""} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="estado">Estado</Label>
            <Select name="estado" defaultValue={editItem?.estado ?? "por_enviar"}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="por_enviar">Por Enviar</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="vendedor">Comercial</Label>
            <Input id="vendedor" name="vendedor" defaultValue={editItem?.vendedor ?? ""} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="responsavel">Responsável (Back Office)</Label>
            <select
              id="responsavel"
              name="responsavel"
              defaultValue={editItem?.responsavel ?? ""}
              className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">—</option>
              {RESPONSAVEIS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" rows={2} defaultValue={editItem?.notas ?? ""} className="mt-1" />
          </div>
          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "A guardar..." : editItem ? "Guardar" : "Adicionar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
