/**
 * controllers/VendaController.js
 * Tela "Abrir venda" do vendedor (ponto de venda).
 * A busca de produtos aqui é SOMENTE no banco local (nenhuma API externa).
 */
const { FORMAS_DE_PAGAMENTO } = require('../domain/Venda');
const { ErroDeValidacao } = require('../utils/erros');
const moeda = require('../utils/moeda');

const CHAVE = 'venda'; // nome do carrinho da venda na sessão
// No balcão o Vendedor vende também o que está oculto da vitrine (ocultar vale só para o site).
const BALCAO = { permitirOculto: true };

class VendaController {
  /**
   * @param {CarrinhoService} carrinhoService
   * @param {PerfumeService} perfumeService
   * @param {AuthService} authService para achar clientes
   * @param {VendaService} vendaService
   */
  constructor(carrinhoService, perfumeService, authService, vendaService) {
    this.carrinhos = carrinhoService;
    this.perfumes = perfumeService;
    this.auth = authService;
    this.vendas = vendaService;
  }

  /** GET /vendedor/venda: mostra a venda aberta, busca por nome/marca e o campo de código. */
  tela(req, res) {
    return this._renderizar(req, res, null);
  }

  /** Monta e mostra a tela de venda (com uma mensagem de erro opcional). */
  async _renderizar(req, res, erro) {
    const busca = String(req.query.q || '').trim();
    const carrinho = await this.carrinhos.carregar(req.session, CHAVE, BALCAO);
    const cliente = await this._clienteAtual(req);
    res.render('venda', {
      carrinho, cliente, busca, erro,
      // Subtotal, desconto e total saem prontos daqui; a view so mostra.
      resumo: this.carrinhos.resumir(carrinho, cliente),
      clientes: await this.auth.listarClientes(),
      resultados: busca ? await this.perfumes.listar(busca, { incluirOcultos: true }) : [],
      formas: FORMAS_DE_PAGAMENTO
    });
  }

  /** POST /vendedor/venda/cliente: escolhe o cliente (ou nenhum). */
  async definirCliente(req, res) {
    const id = Number(req.body.clienteId);
    const cliente = id ? await this.auth.buscarPorId(id) : null;
    if (cliente && cliente.papel === 'cliente') req.session.vendaClienteId = cliente.id;
    else delete req.session.vendaClienteId;
    res.redirect('/vendedor/venda');
  }

  /** POST /vendedor/venda/adicionar: adiciona um produto achado pela busca. */
  async adicionar(req, res) {
    await this._tentar(req, res, () =>
      // Produto com variações: a tela pede a variação (variacaoId) antes de adicionar.
      this.carrinhos.adicionar(req.session, CHAVE, Number(req.body.perfumeId),
        { ...BALCAO, variacaoId: req.body.variacaoId, quantidade: req.body.quantidade }));
  }

  /** POST /vendedor/venda/codigo: leitor de código de barras (age como teclado + Enter). */
  async bipar(req, res) {
    const perfume = await this.perfumes.buscarPorCodigo(req.body.codigo);
    if (!perfume) {
      req.session.aviso = 'Produto não encontrado';
      return res.redirect('/vendedor/venda');
    }
    await this._tentar(req, res, () => this.carrinhos.adicionarPerfume(req.session, CHAVE, perfume, BALCAO));
  }

  /** POST /vendedor/venda/remover */
  async remover(req, res) {
    await this.carrinhos.remover(req.session, CHAVE, req.body.perfumeId, { ...BALCAO, variacaoId: req.body.variacaoId });
    res.redirect('/vendedor/venda');
  }

  /** POST /vendedor/venda/finalizar: grava a venda, baixa o estoque e limpa a tela. */
  async finalizar(req, res) {
    try {
      const carrinho = await this.carrinhos.carregar(req.session, CHAVE, BALCAO);
      const venda = await this.vendas.finalizar({
        carrinho, cliente: await this._clienteAtual(req), vendedor: req.usuario, forma: req.body.forma
      });
      this.carrinhos.limpar(req.session, CHAVE);
      delete req.session.vendaClienteId;
      req.session.aviso = `Venda #${venda.id} finalizada. Total: ${moeda(venda.total)} (pagamento simulado).`; // mesmo formato das telas: R$ 12,50
      res.redirect('/vendedor/venda');
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      res.status(400);
      await this._renderizar(req, res, erro.message);
    }
  }

  /** Cliente escolhido para esta venda (ou null). */
  async _clienteAtual(req) {
    const id = req.session.vendaClienteId;
    return id ? this.auth.buscarPorId(id) : null;
  }

  /** Roda uma ação; se for erro de validação, vira aviso na tela. */
  async _tentar(req, res, acao) {
    try {
      await acao();
    } catch (erro) {
      if (!(erro instanceof ErroDeValidacao)) throw erro;
      req.session.aviso = erro.message;
    }
    res.redirect('/vendedor/venda');
  }
}

module.exports = VendaController;
