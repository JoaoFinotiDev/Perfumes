/**
 * services/VitrineService.js
 * O que o COMPRADOR vê: os cards da vitrine (com paginação), a página do produto
 * e as listas em JSON da busca suspensa. Toda a conta fica aqui; as views só mostram.
 * Herda de PerfumeService as consultas comuns (listar, buscarPorId, buscarPorCodigo).
 */
const PerfumeService = require('./PerfumeService');
const moeda = require('../utils/moeda');
const Perfume = require('../domain/Perfume');
const Paginacao = require('../domain/Paginacao');

const { limparBusca } = PerfumeService;

// Máximo de produtos na lista suspensa de busca (o resto aparece ao digitar mais letras).
const LIMITE_LISTA = 50;

// Ordenações aceitas na vitrine (as mesmas chaves do PerfumeRepository).
const ORDENS_VALIDAS = ['nome', 'menor-preco', 'maior-preco'];

// Quantos chips de variação cabem no card da vitrine; o resto vira o chip "+N" (leva à página do produto).
// 4 chips + o "+N" cabem numa linha só, então o card não fica alto demais.
const MAX_CHIPS_CARD = 4;

// Ordena textos como uma pessoa ordenaria: "9" antes de "10", e sem ligar para maiúsculas.
// Ex.: tamanhos de anel ["23", "14", "9"] viram ["9", "14", "23"].
const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Ordena uma lista de variações (já montadas para a tela) pela descrição, em ordem natural. */
function emOrdemNatural(variacoes) {
  return variacoes.sort((a, b) => ordemNatural.compare(a.descricao || '', b.descricao || ''));
}

/**
 * Só deixa passar endereço http/https (evita "javascript:" dentro do src da imagem).
 * Devolve o endereço ou null (a view então mostra a imagem padrão).
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

/** Percentual de desconto de quem compra, em inteiro (5 = 5%). Zero para visitante, Vendedor e Admin. */
function percentualDe(usuario) {
  return usuario ? usuario.estrategiaDesconto().emPorcento() : 0;
}

class VitrineService extends PerfumeService {
  /**
   * Monta os dados da vitrine (cards). A paginação é feita no banco: primeiro conta (COUNT)
   * com os mesmos filtros, depois busca só a página (LIMIT/OFFSET).
   * @param {{busca?: string, marca?: string, ordem?: string, pagina?: *, porPagina?: *}} filtros vindos da URL (não confiáveis)
   * @param {object|null} usuario quem está logado (o desconto vem da estratégia dele)
   * @returns {Promise<{cards: object[], marcas: string[], busca: string, marca: string, ordem: string,
   *   paginacao: Paginacao, links: object, opcoesPorPagina: number[]}>}
   */
  async vitrine(filtros = {}, usuario = null) {
    const busca = limparBusca(filtros.busca);
    const marca = limparBusca(filtros.marca);
    // Ordem fora da lista vira "nome" (a mesma lista fechada existe no repositório).
    const ordem = ORDENS_VALIDAS.includes(filtros.ordem) ? filtros.ordem : 'nome';
    // A vitrine só mostra produtos que o Vendedor deixou visíveis (inclusive nas marcas do filtro).
    const consulta = { marca, apenasVisiveis: true };
    // Precisa do total ANTES de listar: é ele que decide a última página e o offset.
    const total = await this.perfumes.contar(busca, consulta);
    const paginacao = new Paginacao(total, filtros.pagina, filtros.porPagina);
    const [perfumes, marcas] = await Promise.all([
      this.perfumes.listar(busca, { ...consulta, ordem, limite: paginacao.porPagina, offset: paginacao.offset }),
      this.perfumes.listarMarcas({ apenasVisiveis: true })
    ]);
    const percentual = percentualDe(usuario);
    const cards = perfumes.map((p) => this._cartao(p, usuario, percentual));
    return {
      cards, marcas, busca, marca, ordem, paginacao,
      links: this._links(paginacao, { busca, marca, ordem }),
      // Opções do seletor "Mostrar: 30 | 50 | 100" (a lista mora em Paginacao, a view só repete).
      opcoesPorPagina: Paginacao.POR_PAGINA_PERMITIDOS
    };
  }

  /**
   * Endereços da paginação já prontos (a view só mostra). Cada link guarda busca, marca, ordem e porPagina.
   * Valores padrão (30 por página, página 1) ficam fora da URL para ela ficar curta.
   * `q` e `marca` passam por URLSearchParams, que escapa o texto (nada do usuário vai cru para o href).
   */
  _links(paginacao, { busca, marca, ordem }) {
    const href = (pagina) => {
      const params = new URLSearchParams();
      if (busca) params.set('q', busca);
      if (marca) params.set('marca', marca);
      if (ordem !== 'nome') params.set('ordem', ordem);
      if (paginacao.porPagina !== Paginacao.POR_PAGINA_PADRAO) params.set('porPagina', paginacao.porPagina);
      if (pagina > 1) params.set('pagina', pagina);
      const texto = params.toString();
      return texto ? `/?${texto}` : '/';
    };
    return {
      anterior: paginacao.temAnterior ? href(paginacao.pagina - 1) : null,
      proxima: paginacao.temProxima ? href(paginacao.pagina + 1) : null,
      // null na janela = reticências.
      paginas: paginacao.janela().map((n) => (n === null ? null : { numero: n, href: href(n), atual: n === paginacao.pagina }))
    };
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
    // Chips em ordem natural pelo nome da opção (tamanho 9, 14, 23...), e não na ordem em que foram importados.
    const variacoes = emOrdemNatural(p.variacoesAtivas.map((x) => ({
      id: x.id,
      descricao: x.descricao,
      preco: x.preco,
      precoFinal: p.precoPara(usuario, x),
      estoque: Math.max(0, x.estoque),
      esgotada: x.estoque <= 0,
      // Selo de estoque desta variação ("Últimas N" / "Esgotado"); o JS só o copia ao trocar a escolha.
      aviso: Perfume.avisoDeEstoque(x.estoque)
    })));
    // Variação já marcada ao abrir: a PRIMEIRA com estoque (null se todas esgotaram ou se não há variações).
    const inicial = variacoes.find((x) => !x.esgotada) || null;
    // Estoque que a tela mostra de início: o da variação marcada, ou o do produto (sem variações).
    const estoqueAtual = p.temVariacoes() ? (inicial ? inicial.estoque : 0) : estoque;
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
      // Opções (chips). O desconto do Cliente vale igual na variação (precoFinal já vem calculado).
      variacoes,
      inicialId: inicial ? inicial.id : null,
      // Chips que cabem no CARD (a página do produto usa `variacoes` inteira) e quantas ficaram de fora ("+N").
      variacoesCard: this._chipsDoCard(variacoes, inicial),
      maisOpcoes: Math.max(0, variacoes.length - MAX_CHIPS_CARD),
      estoque,
      esgotado: estoque <= 0,
      estoqueAtual,
      aviso: Perfume.avisoDeEstoque(estoqueAtual)
    };
  }

  /**
   * Escolhe até MAX_CHIPS_CARD variações para o card, na ordem de exibição.
   * Se a variação marcada de início ficaria de fora (as primeiras estão esgotadas), ela entra no lugar do último chip,
   * assim o card sempre abre com uma opção marcada e o botão "Adicionar" funciona.
   */
  _chipsDoCard(variacoes, inicial) {
    const visiveis = variacoes.slice(0, MAX_CHIPS_CARD);
    if (inicial && !visiveis.includes(inicial)) visiveis[MAX_CHIPS_CARD - 1] = inicial;
    return visiveis;
  }

  /**
   * Dados da página do produto (GET /produto/:id). Devolve null se não existe OU se está oculto
   * e quem pede não gerencia produtos (visitante e Cliente só veem os visíveis).
   * @returns {Promise<object|null>} o cartão do produto (com a lista de variações ativas) + descrição
   */
  async paginaDoProduto(id, usuario) {
    const p = await this.buscarPorId(id);
    if (!p || (!p.visivel && !(usuario && usuario.podeGerenciar(p)))) return null;
    return {
      ...this._cartao(p, usuario, percentualDe(usuario)),
      descricao: p.descricao || '',
      visivel: p.visivel
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
    const perfumes = await this.perfumes.listar(limparBusca(busca), {
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

  /**
   * Variações de UM produto para a segunda busca de "Abrir venda" (JSON). Só as ativas, em ordem natural
   * (9, 14, 23...), igual à vitrine. Esgotada vem marcada (`esgotada`): a tela a mostra desativada.
   * O preço é o cheio: o desconto do cliente escolhido na venda já é aplicado no total da venda.
   * Quem chama confere a permissão (veja CatalogoController.variacoesJson). Devolve null se o produto não existe.
   * Produto oculto também vale: no balcão o Vendedor vende o que está oculto da vitrine.
   * @param {number|string} id id do produto
   */
  async variacoesParaLista(id) {
    const p = await this.buscarPorId(id);
    if (!p) return null;
    return emOrdemNatural(p.variacoesAtivas.map((x) => ({
      id: x.id,
      descricao: x.descricao,
      precoTexto: moeda(p.precoPara(null, x)),
      estoque: Math.max(0, x.estoque),
      esgotada: x.estoque <= 0
    })));
  }
}

module.exports = VitrineService;
