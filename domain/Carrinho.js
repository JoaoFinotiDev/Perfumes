/**
 * domain/Carrinho.js
 * Carrinho de compras (serve para o site e para a tela de venda do vendedor).
 * Guarda os itens (perfume + quantidade) e calcula os totais.
 */
const { SemDesconto, arredondar } = require('./Desconto');
const { ErroDeValidacao } = require('../utils/erros');

class Carrinho {
  constructor() {
    /** @type {Map<number, {perfume: object, quantidade: number}>} */
    this._itens = new Map();
  }

  /** Lista dos itens do carrinho. */
  get itens() {
    return [...this._itens.values()];
  }

  /** Carrinho vazio? */
  estaVazio() {
    return this._itens.size === 0;
  }

  /** Soma `quantidade` do perfume, sem passar do estoque. */
  adicionar(perfume, quantidade = 1) {
    const atual = this._itens.has(perfume.id) ? this._itens.get(perfume.id).quantidade : 0;
    const nova = atual + quantidade;
    if (!perfume.temEstoque(nova)) {
      throw new ErroDeValidacao(`Estoque insuficiente de "${perfume.nome}" (restam ${perfume.estoque}).`);
    }
    this._itens.set(perfume.id, { perfume, quantidade: nova });
  }

  /** Tira o perfume do carrinho. */
  remover(perfumeId) {
    this._itens.delete(perfumeId);
  }

  /** Soma a preço cheio, sem desconto. */
  subtotal() {
    return arredondar(this.itens.reduce((s, i) => s + i.perfume.preco * i.quantidade, 0));
  }

  /** Total com o desconto da estratégia (preço unitário com desconto x quantidade). */
  total(estrategia = new SemDesconto()) {
    return arredondar(
      this.itens.reduce((s, i) => s + estrategia.aplicar(i.perfume.preco) * i.quantidade, 0)
    );
  }

  /** Quanto foi descontado no total. */
  desconto(estrategia = new SemDesconto()) {
    return arredondar(this.subtotal() - this.total(estrategia));
  }

  /** Forma simples para guardar na sessão: { idDoPerfume: quantidade }. */
  paraSessao() {
    const dados = {};
    this._itens.forEach((item, id) => { dados[id] = item.quantidade; });
    return dados;
  }
}

module.exports = Carrinho;
