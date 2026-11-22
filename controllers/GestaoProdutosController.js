/**
 * controllers/GestaoProdutosController.js
 * Telas do Vendedor (e do Admin) para gerenciar produtos: lista, edição e mostrar/ocultar na vitrine.
 * O controller só lida com HTTP; as regras (validação, permissão, código único) ficam no GestaoProdutosService.
 * NENHUMA API externa é chamada aqui: a edição usa só o banco local.
 */
const { ErroDeValidacao, ErroDePermissao } = require('../utils/erros');
const { limparBusca } = require('../services/PerfumeService');

class GestaoProdutosController {
  /** @param {GestaoProdutosService} gestaoService regras de gestão de produtos (recebido pelo container.js) */
  constructor(gestaoService) {
    this.perfumes = gestaoService;
  }

  /** GET /vendedor/produtos: lista TODOS os produtos (inclusive ocultos), com busca por nome ou marca. */
  async listar(req, res) {
    await this._mostrarLista(req, res, null);
  }

  /** Monta a tela da lista (com uma mensagem de erro opcional, usada quando o estoque é inválido). */
  async _mostrarLista(req, res, erro) {
    const busca = limparBusca((req.body && req.body.q) || req.query.q);
    const perfumes = await this.perfumes.listar(busca, { incluirOcultos: true });
    // "aberto" = id do produto cujas variações voltam expandidas (depois de mexer numa delas).
    const aberto = Number((req.body && req.body.aberto) || req.query.aberto) || 0;
    res.render('produtos', { perfumes, busca, erro, aberto });
  }

  /**
   * Volta para a lista na MESMA busca e na linha do produto (âncora #produto-<id>).
   * Com `abrir`, a linha volta com as variações expandidas (?aberto=<id>).
   */
  _voltarParaLista(req, res, id, abrir = false) {
    const params = new URLSearchParams(); // codifica o texto da busca (não quebra o endereço)
    const q = limparBusca(req.body.q);
    if (q) params.set('q', q);
    if (abrir) params.set('aberto', String(Number(id)));
    const texto = params.toString();
    res.redirect(`/vendedor/produtos${texto ? '?' + texto : ''}#produto-${Number(id)}`);
  }

  /**
   * POST /vendedor/produtos/:id/variacoes/:variacaoId/estoque: troca só o estoque da variação.
   * Valor inválido (não inteiro ou negativo) mostra a lista com o erro (400); variação de outro produto: 404.
   */
  async definirEstoqueVariacao(req, res) {
    await this._proteger(res, async () => {
      try {
        const achou = await this.perfumes.atualizarEstoqueVariacao(
          req.params.id, req.params.variacaoId, req.body.estoque, req.usuario);
        if (!achou) return this._naoEncontrado(res);
        req.session.aviso = 'Estoque atualizado';
        this._voltarParaLista(req, res, req.params.id, true);
      } catch (erro) {
        if (!(erro instanceof ErroDeValidacao)) throw erro;
        res.status(400);
        await this._mostrarLista(req, res, erro.message);
      }
    });
  }

  /** POST /vendedor/produtos/:id/variacoes/:variacaoId/ativo: liga ("1") ou desliga a variação. */
  async definirAtivoVariacao(req, res) {
    await this._proteger(res, async () => {
      const achou = await this.perfumes.definirVariacaoAtiva(
        req.params.id, req.params.variacaoId, req.body.ativo, req.usuario);
      if (!achou) return this._naoEncontrado(res);
      req.session.aviso = String(req.body.ativo) === '1' ? 'Variação ativada' : 'Variação desativada';
      this._voltarParaLista(req, res, req.params.id, true);
    });
  }

  /**
   * POST /vendedor/produtos/:id/estoque: troca só o estoque, sem abrir a edição.
   * Valor inválido (não inteiro ou negativo) mostra a lista de novo com o erro e status 400.
   */
  async definirEstoque(req, res) {
    await this._proteger(res, async () => {
      try {
        const achou = await this.perfumes.atualizarEstoque(req.params.id, req.body.estoque, req.usuario);
        if (!achou) return this._naoEncontrado(res);
        req.session.aviso = 'Estoque atualizado';
        this._voltarParaLista(req, res, req.params.id);
      } catch (erro) {
        if (!(erro instanceof ErroDeValidacao)) throw erro;
        res.status(400);
        await this._mostrarLista(req, res, erro.message);
      }
    });
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
      this._voltarParaLista(req, res, req.params.id); // mesma busca, na linha do produto
    });
  }

  /** POST /vendedor/produtos/:id/variacoes: adiciona uma variação (descrição, preço, estoque). */
  async adicionarVariacao(req, res) {
    await this._acaoDeVariacao(req, res, 'Variação adicionada.',
      () => this.perfumes.adicionarVariacao(req.params.id, req.body, req.usuario));
  }

  /** POST /vendedor/produtos/:id/variacoes/:variacaoId: edita descrição, preço, estoque e "ativa". */
  async atualizarVariacao(req, res) {
    await this._acaoDeVariacao(req, res, 'Variação atualizada.',
      () => this.perfumes.atualizarVariacao(req.params.id, req.params.variacaoId, req.body, req.usuario));
  }

  /** POST /vendedor/produtos/:id/variacoes/:variacaoId/remover: apaga a variação. */
  async removerVariacao(req, res) {
    await this._acaoDeVariacao(req, res, 'Variação removida.',
      () => this.perfumes.removerVariacao(req.params.id, req.params.variacaoId, req.usuario));
  }

  /**
   * Roda uma ação sobre variações: sucesso volta para a edição com um aviso; dado inválido mostra a edição
   * de novo com o erro (400); produto ou variação inexistente é 404; sem permissão é 403.
   */
  async _acaoDeVariacao(req, res, aviso, acao) {
    await this._proteger(res, async () => {
      try {
        if (!(await acao())) return this._naoEncontrado(res);
        req.session.aviso = aviso;
        res.redirect(`/vendedor/produtos/${Number(req.params.id)}/editar`);
      } catch (erro) {
        if (!(erro instanceof ErroDeValidacao)) throw erro;
        const produto = await this.perfumes.buscarParaGestao(req.params.id, req.usuario);
        res.status(400).render('produto-editar', { produto, form: this._formDoProduto(produto), erro: erro.message });
      }
    });
  }

  /** Dados do produto no formato dos campos do formulário (nomes iguais aos do HTML). */
  _formDoProduto(p) {
    return {
      nome: p.nome, marca: p.marca, preco: p.preco, estoque: p.estoque, descricao: p.descricao || '',
      codigo_barras: p.codigoBarras || '', foto_url: p.fotoUrl || '', visivel: p.visivel,
      sku: p.sku || '', pontos: p.pontos === null ? '' : p.pontos
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
