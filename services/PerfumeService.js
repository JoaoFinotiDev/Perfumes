/**
 * services/PerfumeService.js
 * Consultas COMUNS do catálogo: listar, buscar por id e por código de barras.
 * É a classe base de dois serviços com responsabilidades separadas (SOLID: responsabilidade única):
 *   - VitrineService: o que o comprador vê (cards, página do produto, listas de busca);
 *   - GestaoProdutosService: o que Vendedor e Admin fazem (criar, editar, estoque, variações).
 * O carrinho e a tela "Abrir venda" só precisam destas consultas, então recebem esta classe.
 */

/** Tamanho máximo do texto de busca (o resto é cortado). */
const TAMANHO_BUSCA = 80;

/** Apara os espaços e limita o tamanho do texto de busca que veio da URL ou do formulário. */
function limparBusca(texto) {
  return String(texto || '').trim().slice(0, TAMANHO_BUSCA);
}

class PerfumeService {
  /** @param {PerfumeRepository} perfumes repositório (o único que fala SQL sobre produtos) */
  constructor(perfumes) {
    this.perfumes = perfumes;
  }

  /**
   * Lista o catálogo. `busca` filtra por nome, marca ou SKU.
   * Por padrão só devolve produtos visíveis; quem gerencia produtos (e a tela "Abrir venda")
   * pede `incluirOcultos: true`. Esconder é decisão de quem chama; o padrão é o mais seguro.
   */
  listar(busca = '', { incluirOcultos = false } = {}) {
    return this.perfumes.listar(limparBusca(busca), { apenasVisiveis: !incluirOcultos });
  }

  /** Busca por id. Devolve null (sem consultar o banco) se o id não for um inteiro positivo. */
  buscarPorId(id) {
    const numero = Number(id);
    // Id que não é inteiro positivo não existe: vira "Produto não encontrado".
    if (!Number.isInteger(numero) || numero <= 0) return null;
    return this.perfumes.buscarPorId(numero);
  }

  /** Busca pelo código de barras SOMENTE no banco local (ou null). Nenhuma API externa aqui. */
  buscarPorCodigo(codigo) {
    return this.perfumes.buscarPorCodigo(String(codigo || '').trim());
  }
}

PerfumeService.limparBusca = limparBusca;

module.exports = PerfumeService;
