/**
 * controllers/GestaoProdutosController.js
 * Telas do Vendedor (e do Admin) para gerenciar produtos: lista, edição e mostrar/ocultar na vitrine.
 * O controller só lida com HTTP; as regras (validação, permissão, código único) ficam no PerfumeService.
 * NENHUMA API externa é chamada aqui: a edição usa só o banco local.
 */
const { ErroDeValidacao, ErroDePermissao } = require('../utils/erros');

class GestaoProdutosController {
  /** @param {PerfumeService} perfumeService regras do catálogo (recebido pelo container.js) */
  constructor(perfumeService) {
    this.perfumes = perfumeService;
  }

  /** GET /vendedor/produtos: lista TODOS os produtos (inclusive ocultos), com busca por nome ou marca. */
  async listar(req, res) {
    const busca = String(req.query.q || '').trim().slice(0, 80);
    const perfumes = await this.perfumes.listar(busca, { incluirOcultos: true });
    res.render('produtos', { perfumes, busca });
  }

  /** GET /vendedor/produtos/:id/editar: mostra o formulário já preenchido com o produto. */
  async formEditar(req, res) {
    await this._proteger(res, async () => {
      const produto = await this.perfumes.buscarParaGestao(req.params.id, req.usuario);
      if (!produto) return this._naoEncontrado(res);
      res.render('produto-editar', { produto, form: this._formDoProduto(produto), erro: null });
    });
  }

  /** POST /vendedor/produtos/:id/editar: valida e grava. Dado inválido volta ao formulário com erro 400. */
  async salvar(req, res) {
    await this._proteger(res, async () => {
      try {
        const achou = await this.perfumes.atualizar(req.params.id, req.body, req.usuario);
        if (!achou) return this._naoEncontrado(res);
        req.session.aviso = 'Produto atualizado.';
        res.redirect('/vendedor/produtos');
      } catch (erro) {
        if (!(erro instanceof ErroDeValidacao)) throw erro;
        // Mostra o formulário de novo, com o que a pessoa digitou (o produto só serve para o título e o id).
        const produto = await this.perfumes.buscarParaGestao(req.params.id, req.usuario);
        res.status(400).render('produto-editar', {
          produto, form: { ...req.body, visivel: req.body.visivel === 'on' }, erro: erro.message
        });
      }
    });
  }

  /** POST /vendedor/produtos/:id/visibilidade: mostra ou oculta na vitrine (POST, nunca GET). */
  async definirVisibilidade(req, res) {
    await this._proteger(res, async () => {
      const achou = await this.perfumes.definirVisibilidade(req.params.id, req.body.visivel, req.usuario);
      if (!achou) return this._naoEncontrado(res);
      req.session.aviso = String(req.body.visivel) === '1' ? 'Produto agora aparece na vitrine.' : 'Produto ocultado da vitrine.';
      // Volta para a mesma busca (o texto é codificado para não quebrar o endereço).
      const q = String(req.body.q || '').trim().slice(0, 80);
      res.redirect('/vendedor/produtos' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    });
  }

  /** Dados do produto no formato dos campos do formulário (nomes iguais aos do HTML). */
  _formDoProduto(p) {
    return {
      nome: p.nome, marca: p.marca, preco: p.preco, estoque: p.estoque, descricao: p.descricao || '',
      codigo_barras: p.codigoBarras || '', foto_url: p.fotoUrl || '', visivel: p.visivel
    };
  }

  /** Roda uma ação e transforma "sem permissão" em página 403 (os outros erros seguem para o app.js). */
  async _proteger(res, acao) {
    try {
      await acao();
    } catch (erro) {
      if (!(erro instanceof ErroDePermissao)) throw erro;
      res.status(403).render('erro', { titulo: 'Acesso negado', mensagem: erro.message });
    }
  }

  _naoEncontrado(res) {
    res.status(404).render('erro', { titulo: 'Produto não encontrado', mensagem: 'Esse produto não existe.' });
  }
}

module.exports = GestaoProdutosController;
