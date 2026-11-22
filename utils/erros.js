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

module.exports = { ErroDeValidacao };
