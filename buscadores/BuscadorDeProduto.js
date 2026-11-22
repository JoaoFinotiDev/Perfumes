/**
 * buscadores/BuscadorDeProduto.js
 * Contrato (interface) de quem sabe buscar dados de um produto pelo código de barras.
 * KodebarBuscador, OpenBeautyFactsBuscador e BuscadorEmCadeia seguem este contrato,
 * então qualquer um pode ser trocado por outro sem mudar quem os usa (SOLID: Liskov/Dependency Inversion).
 */
class BuscadorDeProduto {
  /**
   * Busca os dados do produto.
   * @param {string} codigo código de barras (só dígitos)
   * @returns {Promise<{nome:string, marca:string, descricao:string, foto:string}|null>}
   *          null quando não encontra ou quando a busca falha
   */
  async buscar(codigo) { // eslint-disable-line no-unused-vars
    throw new Error('Implemente buscar(codigo) na subclasse.');
  }
}

module.exports = BuscadorDeProduto;
