/**
 * domain/Perfume.js
 * Classe de domínio do produto (perfume) anunciado na loja.
 *
 * O produto pode ter VARIAÇÕES (opcionais). Regras:
 *  - Sem variação ativa: o preço e o estoque são os do próprio produto (tudo como sempre foi).
 *  - Com variação ativa: o cliente escolhe uma; preço e estoque vêm da variação escolhida.
 *    O produto mostra "a partir de" (menor preço) e o estoque total (soma).
 * Também mora aqui a regra dos PONTOS: só a marca "Queen Semijoias" tem pontos (veja aceitaPontos).
 */
const { SemDesconto } = require('./Desconto');
const Variacao = require('./Variacao');

/**
 * ÚNICO lugar com a regra "quem tem pontos". Views, controllers e services perguntam
 * a Perfume.aceitaPontos(marca); ninguém compara o nome da marca por conta própria.
 */
const MARCA_COM_PONTOS = 'Queen Semijoias';

class Perfume {
  /** @param {object} dados linha da tabela perfumes (mais `variacoes`, uma lista opcional de linhas de variações) */
  constructor({ id, nome, marca, preco, estoque, descricao, codigo_barras, foto_url, vendedor_id, visivel, sku, pontos, variacoes }) {
    this.id = id;
    this.nome = nome;
    this.marca = marca;
    this.preco = Number(preco);
    this.estoque = estoque;
    this.descricao = descricao;
    this.codigoBarras = codigo_barras;
    this.fotoUrl = foto_url;
    this.vendedorId = vendedor_id;
    // Aparece na vitrine? O MySQL devolve 1/0; sem a informação (produto novo) vale "sim".
    this.visivel = visivel === undefined ? true : Boolean(visivel);
    // Código interno (opcional e único) e pontos. Pontos de marca que não aceita viram null (veja aceitaPontos).
    this.sku = sku || null;
    this.pontos = Perfume.aceitaPontos(marca) && pontos !== undefined && pontos !== null ? Number(pontos) : null;
    /** @type {Variacao[]} todas as variações (ativas e inativas), na ordem de exibição */
    this.variacoes = (variacoes || []).map((v) => (v instanceof Variacao ? v : new Variacao(v)));
  }

  /** Esta marca tem pontos? Só "Queen Semijoias" (sem diferenciar maiúsculas e espaços nas pontas). */
  static aceitaPontos(marca) {
    return String(marca || '').trim().toLowerCase() === MARCA_COM_PONTOS.toLowerCase();
  }

  /**
   * Aviso de estoque mostrado no card e na página do produto (a regra mora AQUI, não na view nem no JS).
   *  - estoque 0 (ou menos)        -> "Esgotado"
   *  - de 1 até 5                  -> "Últimas N" (selo discreto de urgência)
   *  - mais de 5                   -> nada (não polui o card)
   * @param {number} estoque estoque da variação escolhida (ou do produto, quando não há variações)
   * @returns {{tipo: ''|'ultimas'|'esgotado', texto: string}} tipo vazio = não mostrar nada
   */
  static avisoDeEstoque(estoque) {
    const n = Number(estoque);
    if (!(n > 0)) return { tipo: 'esgotado', texto: 'Esgotado' };
    if (n <= Perfume.LIMITE_ULTIMAS) return { tipo: 'ultimas', texto: `Últimas ${n}` };
    return { tipo: '', texto: '' };
  }

  /** Este produto aceita pontos? (depende da marca) */
  aceitaPontos() {
    return Perfume.aceitaPontos(this.marca);
  }

  /** Variações ativas (as que o cliente pode escolher). */
  get variacoesAtivas() {
    return this.variacoes.filter((v) => v.ativo);
  }

  /** O produto tem variações ativas? Então preço e estoque dependem da escolhida. */
  temVariacoes() {
    return this.variacoesAtivas.length > 0;
  }

  /** Acha uma variação ATIVA pelo id (ou null). Aceita número ou texto (vem de formulário). */
  variacaoPorId(id) {
    const numero = Number(id);
    return this.variacoesAtivas.find((v) => v.id === numero) || null;
  }

  /** Preço cheio (sem desconto) da variação; sem variação, o do produto (com variações: o menor, o "a partir de"). */
  precoBase(variacao = null) {
    if (variacao) return variacao.preco;
    if (this.temVariacoes()) return Math.min(...this.variacoesAtivas.map((v) => v.preco));
    return this.preco;
  }

  /**
   * Preço para quem está comprando. O desconto vem do próprio usuário (Cliente: 5%),
   * e vale igual para o produto e para qualquer variação.
   * Sem usuário (visitante ou venda sem cliente) paga o preço cheio.
   * @param {Usuario|null} usuario
   * @param {Variacao|null} [variacao] variação escolhida (opcional)
   */
  precoPara(usuario, variacao = null) {
    const estrategia = usuario ? usuario.estrategiaDesconto() : new SemDesconto();
    return estrategia.aplicar(this.precoBase(variacao));
  }

  /** Estoque da variação; sem variação, o estoque do produto (com variações: a soma das ativas). */
  estoqueDe(variacao = null) {
    if (variacao) return variacao.estoque;
    if (this.temVariacoes()) return this.variacoesAtivas.reduce((soma, v) => soma + v.estoque, 0);
    return this.estoque;
  }

  /** Há estoque suficiente para a quantidade pedida (na variação escolhida, se houver)? */
  temEstoque(quantidade, variacao = null) {
    return this.estoqueDe(variacao) >= quantidade;
  }
}

Perfume.MARCA_COM_PONTOS = MARCA_COM_PONTOS;
// Até este estoque (e acima de zero) aparece o selo "Últimas N".
Perfume.LIMITE_ULTIMAS = 5;

module.exports = Perfume;
