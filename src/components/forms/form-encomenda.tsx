"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { notifyMutation } from "@/hooks/use-realtime-table";
import { RESPONSAVEIS } from "@/lib/constants";
import { toast } from "sonner";
import type { Encomenda } from "@/lib/types";

interface FormEncomendaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Encomenda | null;
}

export function FormEncomenda({ open, onOpenChange, editItem }: FormEncomendaProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const data = {
      numero_dossier: (form.get("numero_dossier") as string) || null,
      cliente: form.get("cliente") as string,
      numero_encomenda: (form.get("numero_encomenda") as string) || null,
      valor: form.get("valor") ? Number(form.get("valor")) : null,
      data_encomenda: (form.get("data_encomenda") as string) || null,
      descricao_itens: (form.get("descricao_itens") as string) || null,
      estado: (form.get("estado") as string) || null,
      vendedor: (form.get("vendedor") as string) || null,
      responsavel: (form.get("responsavel") as string) || null,
      notas: (form.get("notas") as string) || null,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from("encomendas").update(data).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("encomendas").insert(data));
    }

    setLoading(false);
    if (error) {
      toast.error("Erro ao guardar encomenda");
      return;
    }
    notifyMutation("encomendas");
    toast.success(editItem ? "Encomenda atualizada" : "Encomenda adicionada");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Encomenda" : "Nova Encomenda"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="numero_dossier">N.º Dossier Oasipor</Label>
            <Input id="numero_dossier" name="numero_dossier" defaultValue={editItem?.numero_dossier ?? ""} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cliente">Cliente *</Label>
            <Input id="cliente" name="cliente" required defaultValue={editItem?.cliente} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numero_encomenda">N.º Encomenda Cliente</Label>
              <Input id="numero_encomenda" name="numero_encomenda" defaultValue={editItem?.numero_encomenda ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="valor">Valor (EUR)</Label>
              <Input id="valor" name="valor" type="number" step="0.01" defaultValue={editItem?.valor ?? ""} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="data_encomenda">Data-Limite</Label>
              <Input id="data_encomenda" name="data_encomenda" type="date" defaultValue={editItem?.data_encomenda ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="estado">Estado</Label>
              <Input id="estado" name="estado" placeholder="ex: Por validar" defaultValue={editItem?.estado ?? ""} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="descricao_itens">Descrição dos Itens</Label>
            <Textarea id="descricao_itens" name="descricao_itens" rows={2} defaultValue={editItem?.descricao_itens ?? ""} className="mt-1" />
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
