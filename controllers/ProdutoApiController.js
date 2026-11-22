/**
 * controllers/ProdutoApiController.js
 * Endpoint usado pelo formulário de cadastro de produto para preencher
 * nome, marca e foto a partir do código de barras (Kodebar -> Open Beauty Facts).
 * Preço e estoque NUNCA vêm da API.
 */
const v = require('../utils/validacao');
const { ErroDeValidacao } = require('../utils/erros');

class ProdutoApiController {
  /** @param {BuscadorDeProduto} buscador normalmente o BuscadorEmCadeia */
  constructor(buscador) {
    this.buscador = buscador;
  }

  /** GET /api/produto-por-codigo/:codigo -> { encontrado, nome, marca, descricao, foto } */
  async porCodigo(req, res) {
    try {
      const codigo = v.codigoDeBarras(req.params.codigo, { opcional: false });
      const achado = await this.buscador.buscar(codigo);
      res.json(achado ? { encontrado: true, ...achado } : { encontrado: false });
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      res.status(400).json({ encontrado: false, erro: erro.message });
    }
  }
}

module.exports = ProdutoApiController;
