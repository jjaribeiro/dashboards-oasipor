import type { PedidoProducao, ZonaId } from "./types";

function isCampo(p: PedidoProducao): boolean {
  return (
    p.categoria === "campo" ||
    p.tipo_linha === "campos" ||
    (p.produto_nome ?? "").toLowerCase().includes("campo")
  );
}

function temNE(p: PedidoProducao): boolean {
  const marcador = `${p.produto_nome ?? ""} ${p.produto_codigo ?? ""}`.toUpperCase();
  return /\bNE\b/.test(marcador);
}

/**
 * Rota de zonas por onde o pedido passa, pela ordem.
 * - Campo NE → SL1
 * - Campo sem NE → SL2 Termo → Embalamento
 * - Pack/Trouxa Manual → SASC Picking → SL2 Manual → Embalamento
 * - Pack/Trouxa Termo → SASC Picking → SL2 Termo → Embalamento
 */
export function rotaParaPedido(p: PedidoProducao): ZonaId[] {
  if (isCampo(p)) {
    return temNE(p) ? ["sl1_campos"] : ["sl2_termo", "sl2_embalamento"];
  }
  if (p.tipo_linha === "manual") {
    return ["sl2_picking", "sl2_manual", "sl2_embalamento"];
  }
  return ["sl2_picking", "sl2_termo", "sl2_embalamento"];
}

export function zonaInicialParaPedido(p: PedidoProducao): ZonaId {
  return rotaParaPedido(p)[0];
}
