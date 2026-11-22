/**
 * services/CarrinhoService.js
 * Monta e atualiza carrinhos guardados na sessão.
 * Serve para dois carrinhos: o do site ('carrinho') e o da tela de venda ('venda').
 * Na sessão fica só { idDoPerfume: quantidade }; os preços e o estoque
 * são sempre lidos do banco (o usuário não consegue forçar um preço).
 */
const Carrinho = require('../domain/Carrinho');
const { ErroDeValidacao } = require('../utils/erros');

class CarrinhoService {
  /** @param {PerfumeService} perfumeService */
  constructor(perfumeService) {
    this.perfumes = perfumeService;
  }

  /** Reconstrói o Carrinho a partir da sessão (ignora itens que sumiram do banco). */
  async carregar(sessao, chave) {
    const carrinho = new Carrinho();
    const guardado = sessao[chave] || {};
    for (const [id, quantidade] of Object.entries(guardado)) {
      const perfume = await this.perfumes.buscarPorId(id);
      const qtd = perfume ? Math.min(quantidade, perfume.estoque) : 0;
      if (qtd > 0) carrinho.adicionar(perfume, qtd);
    }
    return carrinho;
  }

  /** Adiciona 1 unidade do perfume (por id) e salva na sessão. */
  async adicionar(sessao, chave, perfumeId) {
    const perfume = await this.perfumes.buscarPorId(perfumeId);
    if (!perfume) throw new ErroDeValidacao('Produto não encontrado.');
    await this.adicionarPerfume(sessao, chave, perfume);
  }

  /** Adiciona 1 unidade de um perfume já carregado. */
  async adicionarPerfume(sessao, chave, perfume) {
    const carrinho = await this.carregar(sessao, chave);
    carrinho.adicionar(perfume, 1); // lança erro se passar do estoque
    sessao[chave] = carrinho.paraSessao();
  }

  /** Remove um perfume do carrinho. */
  async remover(sessao, chave, perfumeId) {
    const carrinho = await this.carregar(sessao, chave);
    carrinho.remover(Number(perfumeId));
    sessao[chave] = carrinho.paraSessao();
  }

  /** Esvazia o carrinho. */
  limpar(sessao, chave) {
    delete sessao[chave];
  }
}

module.exports = CarrinhoService;
