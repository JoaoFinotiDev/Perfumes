/**
 * services/CarrinhoService.js
 * Monta e atualiza carrinhos guardados na sessão.
 * Serve para dois carrinhos: o do site ('carrinho') e o da tela de venda ('venda').
 * Na sessão fica só { chaveDaLinha: quantidade }, onde a chave é "idDoProduto" ou
 * "idDoProduto:idDaVariacao" (veja Carrinho.chave); os preços e o estoque
 * são sempre lidos do banco (o usuário não consegue forçar um preço).
 */
const Carrinho = require('../domain/Carrinho');
const { SemDesconto } = require('../domain/Desconto');
const { ErroDeValidacao } = require('../utils/erros');

// Quantidade máxima por pedido de adição (trava de sanidade; o limite de verdade é o estoque).
const QUANTIDADE_MAXIMA = 100000;

class CarrinhoService {
  /** @param {PerfumeService} perfumeService */
  constructor(perfumeService) {
    this.perfumes = perfumeService;
  }

  /**
   * Reconstrói o Carrinho a partir da sessão (ignora itens que sumiram do banco).
   * Produto OCULTO da vitrine também é ignorado, a não ser que `permitirOculto` seja true
   * (só a tela "Abrir venda" do Vendedor usa isso: ocultar vale só para a vitrine).
   * Linha de variação que foi removida ou desativada também é ignorada.
   */
  async carregar(sessao, chave, { permitirOculto = false } = {}) {
    const carrinho = new Carrinho();
    const guardado = sessao[chave] || {};
    for (const [linha, quantidade] of Object.entries(guardado)) {
      const [id, variacaoId] = linha.split(':');
      const perfume = await this.perfumes.buscarPorId(id);
      if (!perfume || !(perfume.visivel || permitirOculto)) continue;
      const variacao = variacaoId ? perfume.variacaoPorId(variacaoId) : null;
      // Variação sumiu, ou o produto ganhou variações depois: a linha antiga não vale mais.
      if (perfume.temVariacoes() !== Boolean(variacao)) continue;
      const qtd = Math.min(quantidade, perfume.estoqueDe(variacao));
      if (qtd > 0) carrinho.adicionar(perfume, qtd, variacao);
    }
    return carrinho;
  }

  /**
   * Adiciona `opcoes.quantidade` (padrão 1) do produto e salva na sessão.
   * Produto oculto só entra com `opcoes.permitirOculto`; `opcoes.variacaoId` escolhe a variação.
   */
  async adicionar(sessao, chave, perfumeId, opcoes = {}) {
    const perfume = await this.perfumes.buscarPorId(perfumeId);
    if (!perfume || (!perfume.visivel && !opcoes.permitirOculto)) throw new ErroDeValidacao('Produto não encontrado.');
    await this.adicionarPerfume(sessao, chave, perfume, opcoes);
  }

  /** Adiciona um perfume já carregado (valida variação e quantidade; soma com o que já estava no carrinho). */
  async adicionarPerfume(sessao, chave, perfume, opcoes = {}) {
    const quantidade = this._quantidade(opcoes.quantidade);
    let variacao = null;
    if (perfume.temVariacoes()) {
      variacao = perfume.variacaoPorId(opcoes.variacaoId);
      if (!variacao) throw new ErroDeValidacao(`Escolha uma opção de "${perfume.nome}" antes de adicionar.`);
    }
    const carrinho = await this.carregar(sessao, chave, opcoes);
    carrinho.adicionar(perfume, quantidade, variacao); // lança erro se passar do estoque
    sessao[chave] = carrinho.paraSessao();
  }

  /** Valida a quantidade que veio do formulário: vazio vira 1; senão inteiro de 1 em diante. */
  _quantidade(valor) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return 1;
    const texto = String(valor).trim();
    if (!/^\d+$/.test(texto) || Number(texto) < 1 || Number(texto) > QUANTIDADE_MAXIMA) {
      throw new ErroDeValidacao('Quantidade: informe um número inteiro a partir de 1.');
    }
    return Number(texto);
  }

  /** Remove uma linha do carrinho (produto + variação opcional em `opcoes.variacaoId`). */
  async remover(sessao, chave, perfumeId, opcoes = {}) {
    const carrinho = await this.carregar(sessao, chave, opcoes);
    carrinho.remover(Carrinho.chave(Number(perfumeId), Number(opcoes.variacaoId) || null));
    sessao[chave] = carrinho.paraSessao();
  }

  /**
   * Calcula os valores que a tela mostra, para a view so exibir (sem fazer conta).
   * O desconto vem do comprador: cada papel tem a sua estrategia (Cliente 5%, os outros 0).
   * @param {Carrinho} carrinho carrinho ja carregado
   * @param {Usuario|null} comprador quem paga (null = preco cheio)
   * @returns {{subtotal:number, desconto:number, total:number, temDesconto:boolean}}
   */
  resumir(carrinho, comprador) {
    const estrategia = comprador ? comprador.estrategiaDesconto() : new SemDesconto();
    return {
      subtotal: carrinho.subtotal(),
      desconto: carrinho.desconto(estrategia),
      total: carrinho.total(estrategia),
      temDesconto: estrategia.percentual() > 0, // a tela decide o aviso por aqui, nao pelo papel
        percentualTexto: `${Math.round(estrategia.percentual() * 100)}%` // texto pronto (ex.: "5%"): a view nao faz conta
    };
  }

  /** Esvazia o carrinho. */
  limpar(sessao, chave) {
    delete sessao[chave];
  }
}

module.exports = CarrinhoService;
