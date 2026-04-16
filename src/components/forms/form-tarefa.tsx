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
import type { Tarefa } from "@/lib/types";

interface FormTarefaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Tarefa | null;
}

export function FormTarefa({ open, onOpenChange, editItem }: FormTarefaProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const data = {
      numero_dossier: (form.get("numero_dossier") as string) || null,
      nome_procedimento: (form.get("nome_procedimento") as string) || null,
      descricao: form.get("descricao") as string,
      cliente: (form.get("cliente") as string) || null,
      prioridade: form.get("prioridade") as string,
      data_hora: (form.get("data_hora") as string) || null,
      tipo: form.get("tipo") as string,
      vendedor: (form.get("vendedor") as string) || null,
      responsavel: (form.get("responsavel") as string) || null,
      notas: (form.get("notas") as string) || null,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from("tarefas").update(data).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("tarefas").insert(data));
    }

    setLoading(false);
    if (error) {
      toast.error("Erro ao guardar tarefa");
      return;
    }
    toast.success(editItem ? "Tarefa atualizada" : "Tarefa adicionada");
    onOpenChange(false);
  }

  const defaultDataHora = editItem?.data_hora
    ? new Date(editItem.data_hora).toISOString().slice(0, 16)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-white text-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
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
            <Label htmlFor="descricao">Descrição *</Label>
            <Input id="descricao" name="descricao" required defaultValue={editItem?.descricao} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cliente">Cliente</Label>
            <Input id="cliente" name="cliente" defaultValue={editItem?.cliente ?? ""} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tipo">Tipo</Label>
              <Select name="tipo" defaultValue={editItem?.tipo ?? "tarefa"}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tarefa">Tarefa</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                  <SelectItem value="follow_up_cotacao">Follow-up Cotação</SelectItem>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="reuniao_comercial">Reunião Comercial</SelectItem>
                  <SelectItem value="pedido_esclarecimento">Pedido de Esclarecimento</SelectItem>
                  <SelectItem value="pronuncia">Pronúncia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select name="prioridade" defaultValue={editItem?.prioridade ?? "media"}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="data_hora">Data-Limite</Label>
            <Input id="data_hora" name="data_hora" type="datetime-local" defaultValue={defaultDataHora} className="mt-1" />
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
