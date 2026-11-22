/**
 * utils/erros.js
 * Erro usado quando o dado enviado pelo usuário é inválido.
 * Os controllers mostram a mensagem na tela (não é um erro do servidor).
 */
class ErroDeValidacao extends Error {
  /** @param {string} mensagem texto amigável mostrado ao usuário */
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
  }
}

/** Erro do banco: um produto ficou sem estoque suficiente na hora de gravar a venda. */
class EstoqueInsuficienteError extends Error {
  /** @param {string} produto nome do produto sem estoque */
  constructor(produto) {
    super(`Estoque insuficiente de "${produto}".`);
    this.name = 'EstoqueInsuficienteError';
  }
}

module.exports = { ErroDeValidacao, EstoqueInsuficienteError };
