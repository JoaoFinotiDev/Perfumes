/**
 * domain/Carrinho.js
 * Carrinho de compras (serve para o site e para a tela de venda do vendedor).
 * Guarda os itens (perfume + variação opcional + quantidade) e calcula os totais.
 */
const { SemDesconto, arredondar } = require('./Desconto');
const { ErroDeValidacao } = require('../utils/erros');

/**
 * Uma linha do carrinho. Se o produto tem variação, a linha é daquela variação
 * (o mesmo produto em duas variações vira duas linhas).
 */
class ItemDeCarrinho {
  /**
   * @param {Perfume} perfume
   * @param {Variacao|null} variacao null quando o produto não tem variações
   * @param {number} quantidade
   */
  constructor(perfume, variacao, quantidade) {
    this.perfume = perfume;
    this.variacao = variacao;
    this.quantidade = quantidade;
  }

  /** Chave da linha na sessão e nos formulários: "7" (sem variação) ou "7:12" (produto 7, variação 12). */
  get chave() {
    return Carrinho.chave(this.perfume.id, this.variacao ? this.variacao.id : null);
  }

  /** Nome mostrado nas telas: "Produto - Variação" ou só "Produto". */
  get nome() {
    return this.variacao ? `${this.perfume.nome} - ${this.variacao.descricao}` : this.perfume.nome;
  }

  /** Preço unitário cheio (sem desconto). */
  get preco() {
    return this.perfume.precoBase(this.variacao);
  }

  /** Preço unitário para o comprador (o desconto vem dele). */
  precoPara(usuario) {
    return this.perfume.precoPara(usuario, this.variacao);
  }

  /** Estoque disponível desta linha (da variação, se houver). */
  get estoque() {
    return this.perfume.estoqueDe(this.variacao);
  }
}

class Carrinho {
  constructor() {
    /** @type {Map<string, ItemDeCarrinho>} */
    this._itens = new Map();
  }

  /** Monta a chave de uma linha: id do produto, e ":idDaVariacao" quando houver. */
  static chave(perfumeId, variacaoId = null) {
    return variacaoId ? `${perfumeId}:${variacaoId}` : String(perfumeId);
  }

  /** Lista dos itens do carrinho. */
  get itens() {
    return [...this._itens.values()];
  }

  /** Carrinho vazio? */
  estaVazio() {
    return this._itens.size === 0;
  }

  /**
   * Soma `quantidade` do perfume (da variação escolhida), sem passar do estoque.
   * Produto com variações EXIGE uma variação; produto sem variações não aceita uma.
   */
  adicionar(perfume, quantidade = 1, variacao = null) {
    if (perfume.temVariacoes() && !variacao) {
      throw new ErroDeValidacao(`Escolha uma opção de "${perfume.nome}" antes de adicionar.`);
    }
    if (!perfume.temVariacoes() && variacao) variacao = null; // variação que deixou de existir é ignorada
    const chave = Carrinho.chave(perfume.id, variacao && variacao.id);
    const atual = this._itens.has(chave) ? this._itens.get(chave).quantidade : 0;
    const nova = atual + quantidade;
    const item = new ItemDeCarrinho(perfume, variacao, nova);
    if (!perfume.temEstoque(nova, variacao)) {
      // Mensagem clara: estoque zerado = "esgotada"; senão diz quantas unidades ainda existem.
      if (item.estoque <= 0) {
        throw new ErroDeValidacao(`Estoque insuficiente de "${item.nome}": ${variacao ? 'variação esgotada' : 'produto esgotado'}.`);
      }
      // Já tem unidades no carrinho: avisa quantas, para a pessoa entender por que não coube mais.
      if (atual > 0) {
        throw new ErroDeValidacao(`Você já tem ${atual} de "${item.nome}" no carrinho e só temos ${item.estoque} em estoque.`);
      }
      throw new ErroDeValidacao(`Estoque insuficiente de "${item.nome}": só temos ${item.estoque} em estoque.`);
    }
    this._itens.set(chave, item);
  }

  /**
   * TROCA a quantidade de uma linha que já está no carrinho (não soma). Nunca passa do estoque.
   * @param {string} chave a linha (veja Carrinho.chave)
   * @param {number} quantidade inteiro de 1 em diante (já validado pelo service)
   */
  definirQuantidade(chave, quantidade) {
    const item = this._itens.get(String(chave));
    if (!item) throw new ErroDeValidacao('Esse item não está mais no carrinho.');
    if (quantidade > item.estoque) {
      throw new ErroDeValidacao(`Só temos ${item.estoque} em estoque de "${item.nome}".`);
    }
    item.quantidade = quantidade;
  }

  /** Tira a linha do carrinho (pela chave: veja Carrinho.chave). */
  remover(chave) {
    this._itens.delete(String(chave));
  }

  /** Soma a preço cheio, sem desconto. */
  subtotal() {
    return arredondar(this.itens.reduce((s, i) => s + i.preco * i.quantidade, 0));
  }

  /** Total com o desconto da estratégia (preço unitário com desconto x quantidade). */
  total(estrategia = new SemDesconto()) {
    return arredondar(
      this.itens.reduce((s, i) => s + estrategia.aplicar(i.preco) * i.quantidade, 0)
    );
  }

  /** Quanto foi descontado no total. */
  desconto(estrategia = new SemDesconto()) {
    return arredondar(this.subtotal() - this.total(estrategia));
  }

  /** Forma simples para guardar na sessão: { chaveDaLinha: quantidade }. */
  paraSessao() {
    const dados = {};
    this._itens.forEach((item, chave) => { dados[chave] = item.quantidade; });
    return dados;
  }
}

module.exports = Carrinho;
