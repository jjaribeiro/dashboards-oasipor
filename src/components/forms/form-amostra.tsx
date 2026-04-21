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
import type { Amostra } from "@/lib/types";

interface FormAmostraProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Amostra | null;
}

export function FormAmostra({ open, onOpenChange, editItem }: FormAmostraProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const data = {
      numero_dossier: (form.get("numero_dossier") as string) || null,
      nome_procedimento: (form.get("nome_procedimento") as string) || null,
      cliente: form.get("cliente") as string,
      numero_cliente: (form.get("numero_cliente") as string) || null,
      descricao: form.get("descricao") as string,
      data_expedicao: (form.get("data_expedicao") as string) || null,
      estado: (form.get("estado") as string) || null,
      vendedor: (form.get("vendedor") as string) || null,
      responsavel: (form.get("responsavel") as string) || null,
      zona: (form.get("zona") as string) || null,
      notas: (form.get("notas") as string) || null,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from("amostras").update(data).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("amostras").insert(data));
    }

    setLoading(false);
    if (error) {
      toast.error("Erro ao guardar amostra");
      return;
    }
    notifyMutation("amostras");
    toast.success(editItem ? "Amostra atualizada" : "Amostra adicionada");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Amostra" : "Nova Amostra"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numero_dossier">Dossier Interno Nº</Label>
              <Input id="numero_dossier" name="numero_dossier" defaultValue={editItem?.numero_dossier ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="nome_procedimento">Procedimento Nº</Label>
              <Input id="nome_procedimento" name="nome_procedimento" defaultValue={editItem?.nome_procedimento ?? ""} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="cliente">Cliente *</Label>
            <Input id="cliente" name="cliente" required defaultValue={editItem?.cliente} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numero_cliente">N.º Cliente</Label>
              <Input id="numero_cliente" name="numero_cliente" defaultValue={editItem?.numero_cliente ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="vendedor">Vendedor</Label>
              <Input id="vendedor" name="vendedor" defaultValue={editItem?.vendedor ?? ""} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="descricao">Descrição *</Label>
            <Input id="descricao" name="descricao" required defaultValue={editItem?.descricao} className="mt-1" />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="data_expedicao">Data-Limite Expedição</Label>
              <Input id="data_expedicao" name="data_expedicao" type="date" defaultValue={editItem?.data_expedicao ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="estado">Estado</Label>
              <Input id="estado" name="estado" placeholder="ex: Por expedir" defaultValue={editItem?.estado ?? ""} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="zona">Zona</Label>
            <Input id="zona" name="zona" defaultValue={editItem?.zona ?? ""} className="mt-1" />
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
