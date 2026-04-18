import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  differenceInDays,
  differenceInHours,
  isToday,
  isTomorrow,
  isPast,
  format,
} from "date-fns";
import { pt } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type UrgencyLevel = "overdue" | "today" | "soon" | "upcoming" | "none";

export function getUrgencyLevel(dateStr: string | null): UrgencyLevel {
  if (!dateStr) return "none";
  const date = new Date(dateStr);
  const now = new Date();

  if (isPast(date) && !isToday(date)) return "overdue";
  if (isToday(date)) return "today";
  if (isTomorrow(date) || differenceInDays(date, now) <= 3) return "soon";
  return "upcoming";
}

export function getUrgencyColor(level: UrgencyLevel): string {
  switch (level) {
    case "overdue":
      return "border-l-red-500 bg-red-50";
    case "today":
      return "border-l-orange-500 bg-orange-50";
    case "soon":
      return "border-l-yellow-500 bg-yellow-50";
    case "upcoming":
      return "border-l-emerald-500 bg-emerald-50";
    case "none":
      return "border-l-slate-300";
  }
}

export function getUrgencyBadgeColor(level: UrgencyLevel): string {
  switch (level) {
    case "overdue":
      return "bg-red-100 text-red-700 border-red-200";
    case "today":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "soon":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "upcoming":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "none":
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function formatDeadline(dateStr: string | null): string {
  if (!dateStr) return "Sem prazo";
  const date = new Date(dateStr);
  const now = new Date();

  if (isPast(date) && !isToday(date)) {
    const days = Math.abs(differenceInDays(date, now));
    if (days === 1) return "Atrasado 1 dia";
    return `Atrasado ${days} dias`;
  }
  if (isToday(date)) {
    const hours = differenceInHours(date, now);
    if (hours <= 0) return "Vence agora";
    return `Hoje, ${format(date, "HH:mm")}`;
  }
  if (isTomorrow(date)) return `Amanhã, ${format(date, "HH:mm")}`;

  const days = differenceInDays(date, now);
  if (days <= 7) return `Em ${days} dias`;

  return format(date, "d MMM", { locale: pt });
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return format(new Date(dateStr), "d MMM yyyy", { locale: pt });
}

/** Returns a "Dias para/atrasado X" label, e.g. "Faltam 3 dias", "Atrasado 2 dias", "Hoje". */
export function daysLabel(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  if (isToday(date)) return "Hoje";
  if (isPast(date)) {
    const days = Math.abs(differenceInDays(date, now));
    return days === 1 ? "Atrasado 1 dia" : `Atrasado ${days} dias`;
  }
  const days = differenceInDays(date, now) + 1;
  return days === 1 ? "Falta 1 dia" : `Faltam ${days} dias`;
}

export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "alta":
      return "border-l-red-500 bg-red-50";
    case "media":
      return "border-l-yellow-500 bg-yellow-50";
    case "baixa":
      return "border-l-emerald-500 bg-emerald-50";
    default:
      return "border-l-slate-300";
  }
}

/** Formata datetime curto para cards: "16 Abr 14:30" */
export function formatShortDateTime(dateStr: string | null): string {
  if (!dateStr) return "";
  return format(new Date(dateStr), "d MMM HH:mm", { locale: pt });
}

/** Formata duração em minutos como "5h 30m" ou "45m". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

/** Tempo restante até fim_previsto em minutos (pode ser negativo = em atraso). */
export function minutesUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return (new Date(dateStr).getTime() - Date.now()) / 60000;
}

/** Progresso 0..1 de um ciclo entre inicio e fim_previsto. */
export function cycleProgress(inicio: string | null, fimPrevisto: string | null): number {
  if (!inicio || !fimPrevisto) return 0;
  const start = new Date(inicio).getTime();
  const end = new Date(fimPrevisto).getTime();
  if (end <= start) return 1;
  const now = Date.now();
  const pct = (now - start) / (end - start);
  return Math.max(0, Math.min(1, pct));
}

/**
 * Prioridade efetiva em cascata: quando várias linhas partilham o mesmo pedido
 * (mesmo `numero`/PP), só a primeira mantém a prioridade original; as seguintes
 * descem um nível. Evita que todas as linhas do mesmo PP concorram na mesma
 * prioridade.
 */
export function computePrioridadeEfetiva<
  T extends { id: string; numero: string | null; prioridade: string }
>(pedidos: T[]): Map<string, "urgente" | "alta" | "normal" | "baixa" | "por_definir"> {
  const ordem = ["urgente", "alta", "normal", "baixa", "por_definir"] as const;
  const rank = (p: string) => Math.max(0, ordem.indexOf(p as typeof ordem[number]));
  const grupos = new Map<string, T[]>();
  for (const p of pedidos) {
    const key = p.numero ?? `__solo__${p.id}`;
    const arr = grupos.get(key) ?? [];
    arr.push(p);
    grupos.set(key, arr);
  }
  const out = new Map<string, typeof ordem[number]>();
  for (const arr of grupos.values()) {
    arr.sort((a, b) => a.id.localeCompare(b.id));
    arr.forEach((p, i) => {
      const baseIdx = rank(p.prioridade);
      const idx = Math.min(ordem.length - 1, baseIdx + i);
      out.set(p.id, ordem[idx]);
    });
  }
  return out;
}

export function getPriorityBadgeColor(priority: string): string {
  switch (priority) {
    case "alta":
      return "bg-red-100 text-red-700 border-red-200";
    case "media":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "baixa":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}
