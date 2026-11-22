/**
 * domain/Perfume.js
 * Classe de domínio do produto (perfume) anunciado na loja.
 */
const { SemDesconto } = require('./Desconto');

class Perfume {
  /** @param {object} dados linha da tabela perfumes */
  constructor({ id, nome, marca, preco, estoque, descricao, codigo_barras, foto_url, vendedor_id }) {
    this.id = id;
    this.nome = nome;
    this.marca = marca;
    this.preco = Number(preco);
    this.estoque = estoque;
    this.descricao = descricao;
    this.codigoBarras = codigo_barras;
    this.fotoUrl = foto_url;
    this.vendedorId = vendedor_id;
  }

  /**
   * Preço para quem está comprando. O desconto vem do próprio usuário.
   * Sem usuário (visitante ou venda sem cliente) paga o preço cheio.
   */
  precoPara(usuario) {
    const estrategia = usuario ? usuario.estrategiaDesconto() : new SemDesconto();
    return estrategia.aplicar(this.preco);
  }

  /** Há estoque suficiente para a quantidade pedida? */
  temEstoque(quantidade) {
    return this.estoque >= quantidade;
  }
}

module.exports = Perfume;
