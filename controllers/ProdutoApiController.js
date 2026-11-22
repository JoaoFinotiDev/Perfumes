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

  /**
   * GET /api/produto-por-codigo/:codigo -> { encontrado, nome, marca, descricao, foto }
   * Código inválido: 400. Bases fora do ar (rede, limite): 503, e o navegador pode tentar de novo depois.
   */
  async porCodigo(req, res) {
    let codigo;
    try {
      codigo = v.codigoDeBarras(req.params.codigo, { opcional: false });
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      return res.status(400).json({ encontrado: false, erro: erro.message });
    }
    try {
      const achado = await this.buscador.buscar(codigo);
      res.json(achado ? { encontrado: true, ...achado } : { encontrado: false });
    } catch (erro) {
      // A busca FALHOU (não é "não achou"): nada foi guardado no cache, então a próxima tentativa pergunta de novo.
      console.error('Busca por código de barras indisponível:', erro.message);
      res.status(503).json({ encontrado: false, erro: 'Não foi possível buscar agora. Preencha à mão.' });
    }
  }
}

module.exports = ProdutoApiController;
