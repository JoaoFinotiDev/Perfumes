/**
 * controllers/CarrinhoController.js
 * Carrinho do site (guardado na sessão). Pagamento SIMULADO.
 * Todas as rotas daqui são só do Cliente (o middleware exigirCliente barra os outros em routes/index.js).
 * O controller só cuida do HTTP (ler o pedido, chamar o service, responder).
 */
const { FORMAS_DE_PAGAMENTO } = require('../domain/Venda');
const { ErroDeValidacao } = require('../utils/erros');

const { CARRINHOS } = require('../services/CarrinhoService');

const CHAVE = CARRINHOS.SITE; // nome do carrinho do site na sessão (a tela de venda usa outro)

class CarrinhoController {
  /**
   * Os services chegam prontos pelo construtor (container.js monta tudo).
   * Isso se chama injeção de dependência: a classe recebe o que precisa
   * em vez de criar sozinha, o que facilita trocar e testar.
   * @param {CarrinhoService} carrinhoService
   * @param {VendaService} vendaService
   */
  constructor(carrinhoService, vendaService) {
    this.carrinhos = carrinhoService;
    this.vendas = vendaService;
  }

  /** GET /carrinho: mostra o carrinho. */
  async ver(req, res) {
    await this._mostrar(req, res, null);
  }

  /**
   * POST /carrinho/adicionar: põe `quantidade` (padrão 1) do produto no carrinho, na variação escolhida
   * (campo variacaoId, obrigatório quando o produto tem variações). O servidor confere tudo de novo:
   * não confia no "max" do navegador. Se der erro, avisa na página do produto (ou na vitrine).
   */
  async adicionar(req, res) {
    try {
      await this.carrinhos.adicionar(req.session, CHAVE, Number(req.body.perfumeId), {
        variacaoId: req.body.variacaoId, quantidade: req.body.quantidade
      });
      res.redirect('/carrinho');
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro; // erro inesperado vai para o app.js
      req.session.aviso = erro.message;
      const id = Number(req.body.perfumeId);
      res.redirect(Number.isInteger(id) && id > 0 ? `/produto/${id}` : '/'); // volta onde dá para corrigir
    }
  }

  /** POST /carrinho/remover: tira a linha (produto + variação) do carrinho. */
  async remover(req, res) {
    await this.carrinhos.remover(req.session, CHAVE, req.body.perfumeId, { variacaoId: req.body.variacaoId });
    res.redirect('/carrinho');
  }

  /** POST /carrinho/finalizar: grava a venda (pagamento simulado) e baixa o estoque. */
  async finalizar(req, res) {
    try {
      const carrinho = await this.carrinhos.carregar(req.session, CHAVE);
      const venda = await this.vendas.finalizar({
        carrinho, cliente: req.usuario, vendedor: null, forma: req.body.forma
      });
      this.carrinhos.limpar(req.session, CHAVE);
      req.session.aviso = `Compra #${venda.id} confirmada (pagamento simulado).`;
      res.redirect('/');
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      res.status(400);
      await this._mostrar(req, res, erro.message); // mostra o carrinho de novo, com o erro
    }
  }

  /**
   * Monta a tela do carrinho. Os valores (subtotal, desconto, total) são
   * calculados aqui, e a view só os exibe.
   */
  async _mostrar(req, res, erro) {
    const carrinho = await this.carrinhos.carregar(req.session, CHAVE);
    res.render('carrinho', {
      resumo: this.carrinhos.resumir(carrinho, req.usuario),
      formas: FORMAS_DE_PAGAMENTO,
      erro
    });
  }
}

module.exports = CarrinhoController;
