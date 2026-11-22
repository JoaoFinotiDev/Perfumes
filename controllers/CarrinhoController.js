/**
 * controllers/CarrinhoController.js
 * Carrinho do site (guardado na sessão). Pagamento SIMULADO.
 * Qualquer visitante pode montar o carrinho; só o Cliente logado finaliza.
 * O controller só cuida do HTTP (ler o pedido, chamar o service, responder).
 */
const { FORMAS_DE_PAGAMENTO } = require('../domain/Venda');
const { ErroDeValidacao } = require('../utils/erros');

const CHAVE = 'carrinho'; // nome do carrinho na sessão (a tela de venda usa outro nome)

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

  /** POST /carrinho/adicionar: põe 1 unidade no carrinho. Se der erro, avisa no catálogo. */
  async adicionar(req, res) {
    try {
      await this.carrinhos.adicionar(req.session, CHAVE, Number(req.body.perfumeId));
      res.redirect('/carrinho');
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro; // erro inesperado vai para o app.js
      req.session.aviso = erro.message;
      res.redirect('/itens');
    }
  }

  /** POST /carrinho/remover: tira o produto do carrinho. */
  async remover(req, res) {
    await this.carrinhos.remover(req.session, CHAVE, req.body.perfumeId);
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
      res.redirect('/itens');
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
      carrinho,
      resumo: this.carrinhos.resumir(carrinho, req.usuario),
      podeFinalizar: Boolean(req.usuario && req.usuario.podeComprar()),
      formas: FORMAS_DE_PAGAMENTO,
      erro
    });
  }
}

module.exports = CarrinhoController;
