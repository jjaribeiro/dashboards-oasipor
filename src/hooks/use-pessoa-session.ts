"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Pessoa } from "@/lib/types";

const STORAGE_KEY = "oasipor_pessoa_session";
const ZONA_STORAGE_KEY = "oasipor_zona_session";

interface SessionData {
  pessoaId: string;
  pessoaNome: string;
  loggedAt: number;
}

interface ZonaSession {
  zonaId: string;
  pessoaId: string;
  pessoaNome: string;
  loggedAt: number;
}

function loadSession(): SessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

function saveSession(data: SessionData | null) {
  if (typeof window === "undefined") return;
  if (data) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  else sessionStorage.removeItem(STORAGE_KEY);
}

function loadZonaSessions(): Record<string, ZonaSession> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(ZONA_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ZonaSession>;
  } catch {
    return {};
  }
}

function saveZonaSessions(data: Record<string, ZonaSession>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ZONA_STORAGE_KEY, JSON.stringify(data));
}

export function usePessoaSession() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setLoaded(true);
  }, []);

  const login = useCallback(async (pin: string): Promise<Pessoa | null> => {
    const { data, error } = await supabase
      .from("pessoas")
      .select("*")
      .eq("pin", pin)
      .eq("ativo", true)
      .maybeSingle();
    if (error || !data) return null;
    const pessoa = data as Pessoa;
    const newSession: SessionData = {
      pessoaId: pessoa.id,
      pessoaNome: pessoa.nome,
      loggedAt: Date.now(),
    };
    saveSession(newSession);
    setSession(newSession);
    return pessoa;
  }, []);

  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
    // Limpar também sessões de zona
    sessionStorage.removeItem(ZONA_STORAGE_KEY);
  }, []);

  return { session, loaded, login, logout };
}

export function useZonaSession(zonaId: string) {
  const [zonaSession, setZonaSession] = useState<ZonaSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const all = loadZonaSessions();
    setZonaSession(all[zonaId] ?? null);
    setLoaded(true);
  }, [zonaId]);

  const loginZona = useCallback(async (pin: string): Promise<Pessoa | null> => {
    const { data, error } = await supabase
      .from("pessoas")
      .select("*")
      .eq("pin", pin)
      .eq("ativo", true)
      .maybeSingle();
    if (error || !data) return null;
    const pessoa = data as Pessoa;
    const all = loadZonaSessions();
    const newZonaSession: ZonaSession = {
      zonaId,
      pessoaId: pessoa.id,
      pessoaNome: pessoa.nome,
      loggedAt: Date.now(),
    };
    all[zonaId] = newZonaSession;
    saveZonaSessions(all);
    setZonaSession(newZonaSession);
    return pessoa;
  }, [zonaId]);

  const logoutZona = useCallback(() => {
    const all = loadZonaSessions();
    delete all[zonaId];
    saveZonaSessions(all);
    setZonaSession(null);
  }, [zonaId]);

  return { zonaSession, loaded, loginZona, logoutZona };
}

/**
 * Regista uma ação no audit_log
 */
export async function logAction(params: {
  pessoaId: string | null;
  pessoaNome: string | null;
  acao: string;
  alvoTabela?: string;
  alvoId?: string;
  zonaId?: string;
  detalhes?: Record<string, unknown>;
}) {
  try {
    await supabase.from("audit_log").insert({
      pessoa_id: params.pessoaId,
      pessoa_nome: params.pessoaNome,
      acao: params.acao,
      alvo_tabela: params.alvoTabela ?? null,
      alvo_id: params.alvoId ?? null,
      zona_id: params.zonaId ?? null,
      detalhes: params.detalhes ?? null,
    });
  } catch {
    // Silencioso — não bloquear operações se o audit falhar
  }
}
