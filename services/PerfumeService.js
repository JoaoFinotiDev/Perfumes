/**
 * services/PerfumeService.js
 * Regras do catálogo: listar, buscar e criar anúncios (com validação).
 */
const { ErroDeValidacao } = require('../utils/erros');
const v = require('../utils/validacao');

// Ordenações aceitas na vitrine (as mesmas chaves do PerfumeRepository).
const ORDENS_VALIDAS = ['nome', 'menor-preco', 'maior-preco'];

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

  /** Lista o catálogo. `busca` filtra por nome ou marca. */
  listar(busca = '') {
    return this.perfumes.listar(String(busca).trim().slice(0, 80));
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
      this.perfumes.listar(busca, { marca, ordem }),
      this.perfumes.listarMarcas()
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

  /**
   * Cria um anúncio. Valida tudo no servidor.
   * @param {object} dados campos do formulário
   * @param {number} vendedorId quem está anunciando
   */
  async criar(dados, vendedorId) {
    const perfume = {
      nome: v.texto(dados.nome, 'Nome', { min: 2, max: 120 }),
      marca: v.texto(dados.marca, 'Marca', { min: 2, max: 80 }),
      preco: v.preco(dados.preco, 'Preço'),
      estoque: v.inteiro(dados.estoque, 'Estoque'),
      descricao: v.texto(dados.descricao, 'Descrição', { max: 1000, opcional: true }),
      codigoBarras: v.codigoDeBarras(dados.codigo_barras),
      fotoUrl: v.urlOpcional(dados.foto_url, 'Foto'),
      vendedorId
    };
    try {
      return await this.perfumes.criar(perfume);
    } catch (erro) {
      if (erro.code === 'ER_DUP_ENTRY') throw new ErroDeValidacao('Já existe um produto com esse código de barras.');
      throw erro;
    }
  }
}

module.exports = PerfumeService;
