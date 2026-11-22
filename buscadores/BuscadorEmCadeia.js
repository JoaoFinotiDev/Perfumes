/**
 * buscadores/BuscadorEmCadeia.js
 * Tenta vários buscadores na ordem. O primeiro que achar o produto vence.
 * Também é um BuscadorDeProduto, então quem usa não sabe que existe uma cadeia.
 */
const BuscadorDeProduto = require('./BuscadorDeProduto');

class BuscadorEmCadeia extends BuscadorDeProduto {
  /** @param {BuscadorDeProduto[]} buscadores em ordem de tentativa */
  constructor(buscadores) {
    super();
    this.buscadores = buscadores;
  }

  async buscar(codigo) {
    for (const buscador of this.buscadores) {
      try {
        const achado = await buscador.buscar(codigo);
        if (achado) return achado;
      } catch (erro) {
        // um buscador com defeito não impede o próximo de tentar
      }
    }
    return null; // ninguém achou: o formulário fica para digitar
  }
}

module.exports = BuscadorEmCadeia;
