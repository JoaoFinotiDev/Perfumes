/**
 * domain/Variacao.js
 * Uma VARIAÇÃO de um produto (padrão marketplace): por exemplo, o tamanho "B" ou a cor "Ouro".
 * Cada variação tem o seu próprio preço e o seu próprio estoque.
 * Variações são OPCIONAIS: produto sem variação usa o preço e o estoque do próprio Perfume.
 */
class Variacao {
  /** @param {object} dados linha da tabela variações */
  constructor({ id, perfume_id, descricao, preco, estoque, ativo, ordem }) {
    this.id = id;
    this.perfumeId = perfume_id;
    this.descricao = descricao;
    this.preco = Number(preco);
    this.estoque = Number(estoque);
    // O MySQL devolve 1/0; sem a informação (variação nova) vale "ativa".
    this.ativo = ativo === undefined ? true : Boolean(ativo);
    this.ordem = ordem === undefined ? 0 : Number(ordem);
  }
  // O estoque da variação é conferido por Perfume.temEstoque(quantidade, variacao), num lugar só.
}

module.exports = Variacao;
