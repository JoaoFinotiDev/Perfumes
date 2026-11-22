/**
 * domain/Venda.js
 * Uma venda: itens do carrinho + cliente (opcional) + forma de pagamento.
 * O pagamento é apenas SIMULADO: nenhuma cobrança real é feita.
 */
const { ErroDeValidacao } = require('../utils/erros');

/** Formas de pagamento aceitas (valor gravado -> texto da tela). */
const FORMAS_DE_PAGAMENTO = {
  credito: 'Cartão de Crédito',
  debito: 'Débito',
  pix: 'Pix',
  dinheiro: 'Dinheiro'
};

class Venda {
  /**
   * @param {object} dados
   * @param {Carrinho} dados.carrinho itens vendidos
   * @param {Usuario|null} dados.cliente cliente (null = sem cliente, preço cheio)
   * @param {Usuario|null} dados.vendedor quem fez a venda (null = compra pelo site)
   * @param {string} dados.forma chave de FORMAS_DE_PAGAMENTO
   */
  constructor({ carrinho, cliente = null, vendedor = null, forma }) {
    if (carrinho.estaVazio()) throw new ErroDeValidacao('O carrinho está vazio.');
    if (!FORMAS_DE_PAGAMENTO[forma]) throw new ErroDeValidacao('Escolha uma forma de pagamento.');
    this.carrinho = carrinho;
    this.cliente = cliente;
    this.vendedor = vendedor;
    this.forma = forma;
    // O desconto vem do cliente (ou nenhum, se não houver cliente).
    const estrategia = cliente ? cliente.estrategiaDesconto() : undefined;
    this.subtotal = carrinho.subtotal();
    this.total = carrinho.total(estrategia);
    this.desconto = carrinho.desconto(estrategia);
  }

  /** Itens vendidos (os mesmos do carrinho). O VendaRepository grava um por um. */
  get itens() { return this.carrinho.itens; }
}

module.exports = { Venda, FORMAS_DE_PAGAMENTO };
