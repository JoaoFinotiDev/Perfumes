/**
 * services/PerfumeService.js
 * Regras do catálogo: listar, buscar e criar anúncios (com validação).
 */
const { ErroDeValidacao } = require('../utils/erros');
const v = require('../utils/validacao');

class PerfumeService {
  /** @param {PerfumeRepository} perfumes */
  constructor(perfumes) {
    this.perfumes = perfumes;
  }

  /** Lista o catálogo. `busca` filtra por nome ou marca. */
  listar(busca = '') {
    return this.perfumes.listar(String(busca).trim().slice(0, 80));
  }

  /** Busca por id (ou null). */
  buscarPorId(id) {
    return this.perfumes.buscarPorId(Number(id));
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
