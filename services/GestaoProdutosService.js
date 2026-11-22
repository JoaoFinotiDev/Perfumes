/**
 * services/GestaoProdutosService.js
 * O que Vendedor e Admin fazem com os produtos: criar anúncio, editar, estoque rápido,
 * mostrar/ocultar na vitrine e cuidar das variações. Valida TUDO no servidor.
 * A permissão é perguntada ao usuário (Usuario.podeGerenciar), num lugar só: buscarParaGestao.
 * Herda de PerfumeService as consultas comuns (listar, buscarPorId, buscarPorCodigo).
 */
const PerfumeService = require('./PerfumeService');
const { ErroDeValidacao, ErroDePermissao } = require('../utils/erros');
const v = require('../utils/validacao');
const Perfume = require('../domain/Perfume');

// Tamanho máximo da descrição (a coluna é TEXT). 5000 cabe as descrições importadas da Mawwal (até ~2500).
const LIMITE_DESCRICAO = 5000;

class GestaoProdutosService extends PerfumeService {
  /** Valida os campos do formulário (criar e editar usam as MESMAS regras). Devolve os dados limpos. */
  _validar(dados) {
    return {
      nome: v.texto(dados.nome, 'Nome', { min: 2, max: 120 }),
      marca: v.texto(dados.marca, 'Marca', { min: 2, max: 80 }),
      preco: v.preco(dados.preco, 'Preço'),
      estoque: v.inteiro(dados.estoque, 'Estoque'),
      descricao: v.texto(dados.descricao, 'Descrição', { max: LIMITE_DESCRICAO, opcional: true }),
      codigoBarras: v.codigoDeBarras(dados.codigo_barras),
      fotoUrl: v.urlOpcional(dados.foto_url, 'Foto'),
      sku: v.texto(dados.sku, 'SKU', { max: 40, opcional: true }),
      // Pontos só existem para a marca que aceita (Perfume.aceitaPontos). Para as outras o valor
      // enviado é IGNORADO e grava NULL; se a marca mudar de Queen para outra, os pontos somem.
      pontos: Perfume.aceitaPontos(dados.marca) ? this._pontos(dados.pontos) : null
    };
  }

  /** Pontos: vazio vira null; senão precisa ser um inteiro maior ou igual a 0. */
  _pontos(valor) {
    return String(valor === undefined || valor === null ? '' : valor).trim() === '' ? null : v.inteiro(valor, 'Pontos');
  }

  /** Traduz o erro de chave repetida do banco na mensagem certa (SKU ou código de barras). */
  _erroDeDuplicado(erro) {
    return new ErroDeValidacao(/sku/i.test(erro.sqlMessage || '')
      ? 'Já existe um produto com esse SKU.'
      : 'Já existe um produto com esse código de barras.');
  }

  /**
   * Roda uma gravação e troca "chave repetida" do banco (ER_DUP_ENTRY) pela mensagem amigável.
   * Criar e editar usavam o mesmo try/catch; agora ele mora aqui.
   */
  async _gravarSemDuplicar(gravar) {
    try {
      return await gravar();
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') throw this._erroDeDuplicado(erro);
      throw erro;
    }
  }

  /**
   * Cria um anúncio. Valida tudo no servidor.
   * @param {object} dados campos do formulário
   * @param {number} vendedorId quem está anunciando
   * @returns {Promise<number>} id do produto criado
   */
  async criar(dados, vendedorId) { // async: um dado inválido vira promise rejeitada (como os outros métodos)
    const perfume = { ...this._validar(dados), vendedorId };
    return this._gravarSemDuplicar(() => this.perfumes.criar(perfume));
  }

  /**
   * Carrega um produto para gerenciar (editar, ocultar, estoque, variações). Devolve null se não existe.
   * Lança ErroDePermissao se o usuário não pode gerenciar (a regra mora em Usuario.podeGerenciar).
   */
  async buscarParaGestao(id, usuario) {
    const produto = await this.buscarPorId(id);
    if (!usuario || !usuario.podeGerenciar(produto)) throw new ErroDePermissao();
    return produto;
  }

  /**
   * Edita um produto. Mesmas validações do cadastro, e o código de barras e o SKU continuam únicos.
   * @param {number} id produto a editar
   * @param {object} dados campos do formulário (visivel vem de uma caixa de marcar: "on" = marcada)
   * @param {Usuario} usuario quem está editando
   * @returns {Promise<boolean>} false se o produto não existe
   */
  async atualizar(id, dados, usuario) {
    const produto = await this.buscarParaGestao(id, usuario);
    if (!produto) return false;
    // Produto COM variações: preço e estoque vêm das variações (sincronizados), então o formulário não os altera.
    const base = produto.temVariacoes() ? { ...dados, preco: produto.preco, estoque: produto.estoque } : dados;
    const novo = { ...this._validar(base), visivel: dados.visivel === 'on' };
    // Código ou SKU repetido em OUTRO produto é erro (o próprio produto pode manter os seus).
    if (novo.codigoBarras) {
      const dono = await this.perfumes.buscarPorCodigo(novo.codigoBarras);
      if (dono && dono.id !== produto.id) throw new ErroDeValidacao('Já existe um produto com esse código de barras.');
    }
    if (novo.sku) {
      const dono = await this.perfumes.buscarPorSku(novo.sku);
      if (dono && dono.id !== produto.id) throw new ErroDeValidacao('Já existe um produto com esse SKU.');
    }
    // Se outra pessoa gravar o mesmo código no meio tempo, a trava UNIQUE do banco avisa (vira a mesma mensagem).
    await this._gravarSemDuplicar(() => this.perfumes.atualizar(produto.id, novo));
    return true;
  }

  /**
   * Troca SÓ o estoque (atalho da lista "Gerenciar produtos", sem abrir a edição).
   * Valida no servidor: inteiro maior ou igual a 0 (senão ErroDeValidacao, que vira 400).
   * @param {number} id produto
   * @param {*} valor texto vindo do formulário (não confiável)
   * @param {Usuario} usuario quem está mexendo (precisa de podeGerenciar)
   * @returns {Promise<boolean>} false se o produto não existe
   */
  async atualizarEstoque(id, valor, usuario) {
    const produto = await this.buscarParaGestao(id, usuario);
    if (!produto) return false;
    if (produto.temVariacoes()) {
      throw new ErroDeValidacao('Este produto tem variações: edite o estoque de cada variação na tela de edição.');
    }
    await this.perfumes.atualizarEstoque(produto.id, v.inteiro(valor, 'Estoque'));
    return true;
  }

  /**
   * Mostra ou oculta o produto na vitrine. `visivel` vem do formulário ("1" mostra, outro valor oculta).
   * @returns {Promise<boolean>} false se o produto não existe
   */
  async definirVisibilidade(id, visivel, usuario) {
    const produto = await this.buscarParaGestao(id, usuario);
    if (!produto) return false;
    await this.perfumes.definirVisivel(produto.id, String(visivel) === '1');
    return true;
  }

  // ---------- Variações ----------

  /** Dados do formulário de variação (descrição, preço, estoque, ativa), validados. */
  _validarVariacao(dados) {
    return {
      descricao: v.texto(dados.descricao, 'Descrição da variação', { min: 1, max: 80 }),
      preco: v.preco(dados.preco, 'Preço da variação'),
      estoque: v.inteiro(dados.estoque, 'Estoque da variação'),
      ativo: dados.ativo === 'on'
    };
  }

  /**
   * Acha a variação `variacaoId` DENTRO do produto (ativa ou não). Se ela for de outro produto, devolve null
   * (o controller responde 404): assim ninguém mexe na variação de um produto pelo endereço de outro.
   */
  _variacaoDoProduto(produto, variacaoId) {
    return produto.variacoes.find((x) => x.id === Number(variacaoId)) || null;
  }

  /**
   * Roda uma mudança em variação e depois ressincroniza o produto
   * (perfumes.preco = menor preço ativo, perfumes.estoque = soma das ativas).
   * `mudar` devolve false quando não achou a variação; aí não sincroniza.
   * @returns {Promise<boolean>} false se o produto não existe ou a variação não foi achada
   */
  async _mudarVariacao(id, usuario, mudar) {
    const produto = await this.buscarParaGestao(id, usuario);
    if (!produto) return false;
    const achou = await mudar(produto);
    if (achou) await this.perfumes.sincronizarComVariacoes(produto.id);
    return Boolean(achou);
  }

  /** Adiciona uma variação ao produto (já nasce ativa). */
  adicionarVariacao(id, dados, usuario) {
    return this._mudarVariacao(id, usuario, async (produto) => {
      await this.perfumes.criarVariacao(produto.id, this._validarVariacao({ ...dados, ativo: 'on' }));
      return true;
    });
  }

  /** Edita uma variação (descrição, preço, estoque, ativa). */
  atualizarVariacao(id, variacaoId, dados, usuario) {
    return this._mudarVariacao(id, usuario,
      (produto) => this.perfumes.atualizarVariacao(produto.id, Number(variacaoId), this._validarVariacao(dados)));
  }

  /** Remove uma variação. */
  removerVariacao(id, variacaoId, usuario) {
    return this._mudarVariacao(id, usuario, (produto) => this.perfumes.removerVariacao(produto.id, Number(variacaoId)));
  }

  /**
   * Troca SÓ o estoque de uma variação (atalho da lista "Gerenciar produtos").
   * Valida no servidor: inteiro maior ou igual a 0. Variação de outro produto: false (404).
   */
  atualizarEstoqueVariacao(id, variacaoId, valor, usuario) {
    return this._mudarVariacao(id, usuario, async (produto) => {
      if (!this._variacaoDoProduto(produto, variacaoId)) return false;
      const estoque = v.inteiro(valor, 'Estoque da variação');
      await this.perfumes.atualizarEstoqueVariacao(produto.id, Number(variacaoId), estoque);
      return true;
    });
  }

  /**
   * Liga ou desliga uma variação. `ativo` vem do formulário ("1" liga, outro valor desliga).
   * Variação inativa some da vitrine, da página do produto e de "Abrir venda" (Perfume.variacoesAtivas),
   * mas continua listada em "Gerenciar produtos" para poder ser ligada de novo.
   */
  definirVariacaoAtiva(id, variacaoId, ativo, usuario) {
    return this._mudarVariacao(id, usuario, async (produto) => {
      if (!this._variacaoDoProduto(produto, variacaoId)) return false;
      await this.perfumes.definirVariacaoAtiva(produto.id, Number(variacaoId), String(ativo) === '1');
      return true;
    });
  }
}

module.exports = GestaoProdutosService;
