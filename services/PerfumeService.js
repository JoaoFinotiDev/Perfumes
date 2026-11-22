/**
 * services/PerfumeService.js
 * Regras do catálogo: listar, buscar e criar anúncios (com validação).
 */
const { ErroDeValidacao, ErroDePermissao } = require('../utils/erros');
const v = require('../utils/validacao');

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
    const cards = perfumes.map((p) => {
      const precoFinal = p.precoPara(usuario);
      return {
        id: p.id,
        nome: p.nome,
        marca: p.marca,
        fotoUrl: urlDeImagemSegura(p.fotoUrl),
        preco: p.preco,
        precoFinal,
        temDesconto: precoFinal < p.preco,
        percentual,
        esgotado: p.estoque <= 0
      };
    });
    return { cards, marcas, busca, marca, ordem };
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
      fotoUrl: v.urlOpcional(dados.foto_url, 'Foto')
    };
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
      if (erro.code === 'ER_DUP_ENTRY') throw new ErroDeValidacao('Já existe um produto com esse código de barras.');
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
    const novo = { ...this._validar(dados), visivel: dados.visivel === 'on' };
    // Código repetido em OUTRO produto é erro (o próprio produto pode manter o seu código).
    if (novo.codigoBarras) {
      const dono = await this.perfumes.buscarPorCodigo(novo.codigoBarras);
      if (dono && dono.id !== produto.id) throw new ErroDeValidacao('Já existe um produto com esse código de barras.');
    }
    try {
      await this.perfumes.atualizar(produto.id, novo);
    } catch (erro) { // outra pessoa gravou o mesmo código no meio tempo: a trava UNIQUE do banco avisa
      if (erro.code === 'ER_DUP_ENTRY') throw new ErroDeValidacao('Já existe um produto com esse código de barras.');
      throw erro;
    }
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
