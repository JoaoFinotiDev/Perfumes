/**
 * controllers/CarrinhoController.js
 * Carrinho do site (guardado na sessão). Pagamento SIMULADO.
 * Qualquer visitante pode montar o carrinho; só o Cliente logado finaliza.
 */
const { FORMAS_DE_PAGAMENTO } = require('../domain/Venda');
const { ErroDeValidacao } = require('../utils/erros');

const CHAVE = 'carrinho'; // nome do carrinho na sessão

class CarrinhoController {
  /**
   * @param {CarrinhoService} carrinhoService
   * @param {VendaService} vendaService
   */
  constructor(carrinhoService, vendaService) {
    this.carrinhos = carrinhoService;
    this.vendas = vendaService;
  }

  /** GET /carrinho */
  async ver(req, res) {
    const carrinho = await this.carrinhos.carregar(req.session, CHAVE);
    res.render('carrinho', { carrinho, formas: FORMAS_DE_PAGAMENTO, erro: null });
  }

  /** POST /carrinho/adicionar */
  async adicionar(req, res) {
    try {
      await this.carrinhos.adicionar(req.session, CHAVE, Number(req.body.perfumeId));
      res.redirect('/carrinho');
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      req.session.aviso = erro.message;
      res.redirect('/itens');
    }
  }

  /** POST /carrinho/remover */
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
      const carrinho = await this.carrinhos.carregar(req.session, CHAVE);
      res.status(400).render('carrinho', { carrinho, formas: FORMAS_DE_PAGAMENTO, erro: erro.message });
    }
  }
}

module.exports = CarrinhoController;
