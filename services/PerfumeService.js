/**
 * services/PerfumeService.js
 * Regras do catálogo: listar, buscar e criar anúncios (com validação).
 */
const { ErroDeValidacao, ErroDePermissao } = require('../utils/erros');
const v = require('../utils/validacao');
const moeda = require('../utils/moeda');
const Perfume = require('../domain/Perfume');

// Máximo de produtos na lista suspensa de busca (o resto aparece ao digitar mais letras).
const LIMITE_LISTA = 50;

// Ordenações aceitas na vitrine (as mesmas chaves do PerfumeRepository).
const ORDENS_VALIDAS = ['nome', 'menor-preco', 'maior-preco'];

// Tamanho máximo da descrição (a coluna é TEXT). 5000 cabe as descrições importadas da Mawwal (até ~2500).
const LIMITE_DESCRICAO = 5000;

/**
 * Só deixa passar endereço http/https (evita "javascript:" dentro do src da imagem).
 * Devolve o endereço ou null (a view então mostra o placeholder).
 */
function urlDeImagemSegura(valor) {
  if (!valor) return null;
  try {
    const u = new URL(String(valor));
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch (e) {
    return null;
  }
}

class PerfumeService {
  /** @param {PerfumeRepository} perfumes */
  constructor(perfumes) {
    this.perfumes = perfumes;
  }

  /**
   * Lista o catálogo. `busca` filtra por nome ou marca.
   * Por padrão só devolve produtos visíveis; quem gerencia produtos (e a tela "Abrir venda")
   * pede `incluirOcultos: true`. Esconder é decisão de quem chama, o padrão é o mais seguro.
   */
  listar(busca = '', { incluirOcultos = false } = {}) {
    return this.perfumes.listar(String(busca).trim().slice(0, 80), { apenasVisiveis: !incluirOcultos });
  }

  /**
   * Monta os dados da vitrine (cards). Toda a conta fica aqui; a view só mostra.
   * @param {{busca?: string, marca?: string, ordem?: string}} filtros vindos da URL (não confiáveis)
   * @param {object|null} usuario quem está logado (o desconto vem da estratégia dele)
   * @returns {Promise<{cards: object[], marcas: string[], busca: string, marca: string, ordem: string}>}
   */
  async vitrine(filtros = {}, usuario = null) {
    const busca = String(filtros.busca || '').trim().slice(0, 80);
    const marca = String(filtros.marca || '').trim().slice(0, 80);
    // Ordem fora da lista vira "nome" (a mesma lista fechada existe no repositório).
    const ordem = ORDENS_VALIDAS.includes(filtros.ordem) ? filtros.ordem : 'nome';
    const [perfumes, marcas] = await Promise.all([
      // A vitrine só mostra produtos que o Vendedor deixou visíveis (inclusive nas marcas do filtro).
      this.perfumes.listar(busca, { marca, ordem, apenasVisiveis: true }),
      this.perfumes.listarMarcas({ apenasVisiveis: true })
    ]);
    // Percentual de desconto de quem compra, ex.: 5. Zero para visitante, vendedor e admin.
    const percentual = usuario ? Math.round(usuario.estrategiaDesconto().percentual() * 100) : 0;
    const cards = perfumes.map((p) => this._cartao(p, usuario, percentual));
    return { cards, marcas, busca, marca, ordem };
  }

  /**
   * Dados de um produto prontos para a view (card da vitrine e página do produto), sem conta na view.
   * Com variações: o preço é o MENOR ("a partir de"), o estoque é a SOMA e `opcoes` conta as variações ativas.
   * Pontos só vêm preenchidos para a marca que aceita (a regra está em Perfume, não aqui).
   */
  _cartao(p, usuario, percentual) {
    const precoFinal = p.precoPara(usuario);
    const preco = p.precoBase();
    const estoque = Math.max(0, p.estoqueDe()); // nunca negativo: se vier algo estranho do banco, mostra 0
    return {
      id: p.id,
      nome: p.nome,
      marca: p.marca,
      sku: p.sku,
      pontos: p.pontos,
      fotoUrl: urlDeImagemSegura(p.fotoUrl),
      preco,
      precoFinal,
      temDesconto: precoFinal < preco,
      percentual,
      temVariacoes: p.temVariacoes(),
      opcoes: p.variacoesAtivas.length,
      // Opções do seletor. O desconto do Cliente vale igual na variação (precoFinal já vem calculado).
      variacoes: p.variacoesAtivas.map((x) => ({
        id: x.id,
        descricao: x.descricao,
        preco: x.preco,
        precoFinal: p.precoPara(usuario, x),
        estoque: Math.max(0, x.estoque),
        esgotada: x.estoque <= 0
      })),
      estoque,
      esgotado: estoque <= 0
    };
  }

  /**
   * Dados enxutos para a lista suspensa de busca (JSON). Devolve no máximo LIMITE_LISTA produtos,
   * já com o preço formatado, para o navegador só mostrar. Só inclui ocultos se o chamador pedir
   * (quem chama é responsável por checar a permissão; veja CatalogoController.buscarJson).
   * @param {string} busca texto digitado (nome ou marca; maiúsculas e acentos não importam: collation do banco)
   * @param {{incluirOcultos?: boolean}} opcoes
   * @param {object|null} usuario quem está logado (o preço vem da estratégia dele)
   */
  async buscarParaLista(busca = '', { incluirOcultos = false } = {}, usuario = null) {
    const perfumes = await this.perfumes.listar(String(busca).trim().slice(0, 80), {
      apenasVisiveis: !incluirOcultos, limite: LIMITE_LISTA
    });
    return perfumes.map((p) => ({
      id: p.id,
      nome: p.nome,
      marca: p.marca,
      sku: p.sku,
      temVariacoes: p.temVariacoes(),
      // Com variações o preço varia: mostra "a partir de" (o menor).
      precoTexto: (p.temVariacoes() ? 'a partir de ' : '') + moeda(p.precoPara(usuario)),
      fotoUrl: urlDeImagemSegura(p.fotoUrl)
    }));
  }

  /** Busca por id (ou null). */
  buscarPorId(id) {
    const numero = Number(id);
    // Id que nao e inteiro positivo nao existe: devolve null (vira "Produto nao encontrado").
    if (!Number.isInteger(numero) || numero <= 0) return null;
    return this.perfumes.buscarPorId(numero);
  }

  /** Busca pelo código de barras SOMENTE no banco local (ou null). */
  buscarPorCodigo(codigo) {
    return this.perfumes.buscarPorCodigo(String(codigo || '').trim());
  }

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
   * Cria um anúncio. Valida tudo no servidor.
   * @param {object} dados campos do formulário
   * @param {number} vendedorId quem está anunciando
   */
  async criar(dados, vendedorId) {
    const perfume = { ...this._validar(dados), vendedorId };
    try {
      return await this.perfumes.criar(perfume);
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') throw this._erroDeDuplicado(erro);
      throw erro;
    }
  }

  /**
   * Carrega um produto para gerenciar (editar ou ocultar). Devolve null se não existe.
   * Lança ErroDePermissao se o usuário não pode gerenciar (a regra mora em Usuario.podeGerenciar).
   */
  async buscarParaGestao(id, usuario) {
    const produto = await this.buscarPorId(id);
    if (!usuario || !usuario.podeGerenciar(produto)) throw new ErroDePermissao();
    return produto;
  }

  /**
   * Edita um produto. Mesmas validações do cadastro, e o código de barras continua único.
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
    try {
      await this.perfumes.atualizar(produto.id, novo);
    } catch (erro) { // outra pessoa gravou o mesmo código no meio tempo: a trava UNIQUE do banco avisa
      if (erro.code === 'ER_DUP_ENTRY') throw this._erroDeDuplicado(erro);
      throw erro;
    }
    return true;
  }

  /**
   * Dados da página do produto (GET /produto/:id). Devolve null se não existe OU se está oculto
   * e quem pede não gerencia produtos (visitante e Cliente só veem os visíveis).
   * @returns {Promise<object|null>} o cartão do produto (com a lista de variações ativas) + descrição
   */
  async paginaDoProduto(id, usuario) {
    const p = await this.buscarPorId(id);
    if (!p || (!p.visivel && !(usuario && usuario.podeGerenciar(p)))) return null;
    const percentual = usuario ? Math.round(usuario.estrategiaDesconto().percentual() * 100) : 0;
    return {
      ...this._cartao(p, usuario, percentual),
      descricao: p.descricao || '',
      visivel: p.visivel
    };
  }

  /** Dados do formulário de variação (descrição, preço, estoque, ativa), validados. */
  _validarVariacao(dados) {
    return {
      descricao: v.texto(dados.descricao, 'Descrição da variação', { min: 1, max: 80 }),
      preco: v.preco(dados.preco, 'Preço da variação'),
      estoque: v.inteiro(dados.estoque, 'Estoque da variação'),
      ativo: dados.ativo === 'on'
    };
  }

  /** Adiciona uma variação ao produto e sincroniza preço/estoque do produto. @returns {Promise<boolean>} false se o produto não existe */
  async adicionarVariacao(id, dados, usuario) {
    const produto = await this.buscarParaGestao(id, usuario);
    if (!produto) return false;
    await this.perfumes.criarVariacao(produto.id, this._validarVariacao({ ...dados, ativo: 'on' }));
    await this.perfumes.sincronizarComVariacoes(produto.id);
    return true;
  }

  /** Edita uma variação (descrição, preço, estoque, ativa) e sincroniza. @returns {Promise<boolean>} false se produto ou variação não existem */
  async atualizarVariacao(id, variacaoId, dados, usuario) {
    const produto = await this.buscarParaGestao(id, usuario);
    if (!produto) return false;
    const achou = await this.perfumes.atualizarVariacao(produto.id, Number(variacaoId), this._validarVariacao(dados));
    if (achou) await this.perfumes.sincronizarComVariacoes(produto.id);
    return achou;
  }

  /** Remove uma variação e sincroniza. @returns {Promise<boolean>} false se produto ou variação não existem */
  async removerVariacao(id, variacaoId, usuario) {
    const produto = await this.buscarParaGestao(id, usuario);
    if (!produto) return false;
    const achou = await this.perfumes.removerVariacao(produto.id, Number(variacaoId));
    if (achou) await this.perfumes.sincronizarComVariacoes(produto.id);
    return achou;
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
}

module.exports = PerfumeService;
