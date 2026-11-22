/**
 * domain/Paginacao.js
 * Conta da paginação da vitrine: quantas páginas existem, de onde a página começa no banco (offset),
 * qual faixa aparece ("Mostrando 31-60") e quais números de página mostrar.
 * É uma classe pequena, sem banco e sem HTTP: recebe o total e o que veio da URL (não confiável)
 * e já devolve valores seguros. A view só mostra o que esta classe calcula.
 */

// Tamanhos de página aceitos (lista fixa). Qualquer outro valor da URL cai no primeiro (30).
const POR_PAGINA_PERMITIDOS = [30, 50, 100];
const POR_PAGINA_PADRAO = POR_PAGINA_PERMITIDOS[0];

// Quantas páginas aparecem de cada lado da página atual (6 -> 4 5 [6] 7 8).
const VIZINHAS = 2;

class Paginacao {
  /**
   * @param {number} total quantos produtos existem COM os filtros aplicados (o COUNT do banco)
   * @param {*} pagina página pedida na URL (qualquer coisa; inválida vira 1, grande demais vira a última)
   * @param {*} porPagina produtos por página pedidos na URL (fora de 30/50/100 vira 30)
   */
  constructor(total, pagina = 1, porPagina = POR_PAGINA_PADRAO) {
    this.total = Number.isInteger(total) && total > 0 ? total : 0;
    this.porPagina = Paginacao.lerPorPagina(porPagina);
    // Sempre existe pelo menos 1 página (vazia, quando não há produtos).
    this.totalPaginas = Math.max(1, Math.ceil(this.total / this.porPagina));
    // Número inválido (texto, 0, negativo, decimal) vira 1; maior que o total vai para a última.
    this.pagina = Math.min(Paginacao.lerPagina(pagina), this.totalPaginas);
  }

  /** Aceita só 30, 50 ou 100 (como número ou texto). Qualquer outra coisa vira 30. */
  static lerPorPagina(valor) {
    const numero = /^\d+$/.test(String(valor)) ? Number(valor) : NaN;
    return POR_PAGINA_PERMITIDOS.includes(numero) ? numero : POR_PAGINA_PADRAO;
  }

  /** Inteiro a partir de 1 (como número ou texto). Qualquer outra coisa vira 1. */
  static lerPagina(valor) {
    const texto = String(valor);
    if (!/^\d+$/.test(texto)) return 1;
    const numero = Number(texto);
    return numero >= 1 ? numero : 1;
  }

  /** Quantas linhas pular no banco (o OFFSET): a página 2 de 30 pula 30. */
  get offset() {
    return (this.pagina - 1) * this.porPagina;
  }

  /** Primeiro produto da página, contando de 1 (0 quando não há produtos). */
  get inicio() {
    return this.total === 0 ? 0 : this.offset + 1;
  }

  /** Último produto da página, contando de 1 (a última página pode ser parcial). */
  get fim() {
    return Math.min(this.offset + this.porPagina, this.total);
  }

  get temAnterior() {
    return this.pagina > 1;
  }

  get temProxima() {
    return this.pagina < this.totalPaginas;
  }

  /**
   * Números de página a mostrar, com `null` no lugar das reticências.
   * Ex.: página 6 de 21 -> [1, null, 4, 5, 6, 7, 8, null, 21].
   * Sempre aparecem a primeira, a última e as vizinhas da atual; um buraco de uma só página
   * mostra o próprio número (mais curto e mais claro que "...").
   */
  janela() {
    const numeros = new Set([1, this.totalPaginas]);
    for (let n = this.pagina - VIZINHAS; n <= this.pagina + VIZINHAS; n++) {
      if (n >= 1 && n <= this.totalPaginas) numeros.add(n);
    }
    const ordenados = [...numeros].sort((a, b) => a - b);
    const saida = [];
    ordenados.forEach((n, i) => {
      if (i > 0) {
        const anterior = ordenados[i - 1];
        if (n - anterior === 2) saida.push(anterior + 1); // buraco de 1 página: mostra o número
        else if (n - anterior > 2) saida.push(null); // buraco maior: reticências
      }
      saida.push(n);
    });
    return saida;
  }
}

Paginacao.POR_PAGINA_PERMITIDOS = POR_PAGINA_PERMITIDOS;
Paginacao.POR_PAGINA_PADRAO = POR_PAGINA_PADRAO;

module.exports = Paginacao;
