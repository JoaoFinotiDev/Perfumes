/**
 * scripts/importar-queen.js
 * Importa o catalogo da Queen Semijoias (plataforma Conecta Venda) para a tabela "perfumes".
 * Uso:   npm run importar:queen -- --arquivo=queen-produtos.json   (usa o JSON já baixado, sem rede)
 *        npm run importar:queen -- --salvar=queen-produtos.json   (baixa da internet e guarda o JSON bruto)
 *        npm run importar:queen                                   (baixa da internet e importa)
 *
 * Três classes, cada uma com UM trabalho (SOLID):
 *  - QueenFonte:      busca o JSON na internet (única parte que usa rede).
 *  - QueenConversor:  transforma um produto da Queen em um Perfume (sem rede, sem banco).
 *  - ImportadorQueen: o ImportadorDeCatalogo (comum a todas as lojas) com a chave de "ja existe" = SKU.
 *
 * Regras da conversão: UM produto por peça. Peça com 2 ou mais variações ativas vira produto COM variações
 * (cada uma com preço e estoque); com uma só, o preço e o estoque ficam no próprio produto.
 * O SKU é a referência da Queen (código interno, NÃO é código de barras: por isso codigo_barras fica NULL).
 * Os pontos existem só para esta marca e saem do texto da descrição ("500 Pontos").
 *
 * Fonte: catalogo Conecta Venda https://app.conectavenda.com.br/af7c4f3dcc495af4273cbc35886f253b
 * Dados e fotos pertencem a Queen Semijoias; uso apenas acadêmico.
 */
const fs = require('fs');
const Perfume = require('../domain/Perfume');
const { limparHtml } = require('../utils/html');
const ImportadorDeCatalogo = require('./importador-de-catalogo');

// Limites das colunas de script.sql.
const LIMITE_NOME = 120;
const LIMITE_FOTO = 500;
const LIMITE_SKU = 40;
const LIMITE_VARIACAO = 80;

const MARCA = Perfume.MARCA_COM_PONTOS; // 'Queen Semijoias' (a regra dos pontos mora em Perfume)

/** Acha "500 Pontos" (ou "1.500 pontos") no texto; o ponto e separador de milhar. */
const PADRAO_PONTOS = /(\d[\d.]*)\s*pontos/i;

/** Busca todos os produtos do catalogo na plataforma Conecta Venda. */
class QueenFonte {
  constructor({
    catalogo = 'af7c4f3dcc495af4273cbc35886f253b',
    base = 'https://dados.conectavenda.com.br',
    dominio = 'app.conectavenda.com.br',
    fetchFn = fetch
  } = {}) {
    this.catalogo = catalogo;
    this.base = base;
    this.dominio = dominio;
    this.fetchFn = fetchFn; // injetavel para testes
  }

  /**
   * 1) POST /cliente/iniciar abre uma sessão e devolve o cabeçalho "conecta-session";
   * 2) POST /produtos/listar (com esse cabeçalho) devolve a lista de produtos.
   * shortcut: o formato exato da resposta (lista direta ou dentro de um objeto) foi tratado de forma tolerante;
   * ajuste aqui se a plataforma mudar.
   */
  async buscarTodos() {
    const cabecalhos = { 'Content-Type': 'application/json', 'User-Agent': 'LojinhaChic/1.0 (trabalho academico)' };
    const inicio = await this.fetchFn(`${this.base}/cliente/iniciar`, {
      method: 'POST', headers: cabecalhos, body: JSON.stringify({ catalogo: this.catalogo, dominio: this.dominio })
    });
    if (!inicio.ok) throw new Error(`Fonte respondeu HTTP ${inicio.status} ao iniciar a sessao`);
    const sessao = inicio.headers.get('conecta-session');
    if (!sessao) throw new Error('A fonte nao devolveu o cabecalho conecta-session');

    const resposta = await this.fetchFn(`${this.base}/produtos/listar`, {
      method: 'POST', headers: { ...cabecalhos, 'conecta-session': sessao }, body: JSON.stringify({ catalogo: this.catalogo })
    });
    if (!resposta.ok) throw new Error(`Fonte respondeu HTTP ${resposta.status} ao listar os produtos`);
    const json = await resposta.json();
    return Array.isArray(json) ? json : (json.dados || json.produtos || json.data || []);
  }
}

/** Converte produto da Queen -> Perfume. Devolve null se o produto não serve (sem nome, inativo ou sem preço válido). */
class QueenConversor {
  /** @param {object} p produto bruto da Conecta Venda @returns {Perfume|null} */
  converter(p) {
    const nome = this.limparEspacos(p.produto_nome).slice(0, LIMITE_NOME);
    if (!nome || Number(p.produto_ativo) === 0) return null;

    // Variações que valem: ativas e com preço maior que zero (o preço vem em CENTAVOS: 3000 = R$ 30,00).
    const validas = (p.produto_variacoes || []).filter((v) => Number(v.variacao_ativo) !== 0 && Number(v.variacao_preco) > 0);
    if (!validas.length) return null;

    const { pontos, texto } = this.separarPontos(p.produto_descricao);
    const categoria = this.limparEspacos(p.produto_grupo_descricao);
    const foto = (p.produto_imagens || []).find((url) => typeof url === 'string' && url.startsWith('https://') && url.length <= LIMITE_FOTO);

    const dados = {
      nome,
      marca: MARCA,
      descricao: this.montarDescricao(categoria, texto),
      codigo_barras: null, // a referência da Queen NÃO é EAN
      foto_url: foto || null,
      vendedor_id: null, // sem dono, como na Mawwal
      visivel: 1,
      sku: this.limparEspacos(p.produto_referencia).slice(0, LIMITE_SKU) || null,
      pontos
    };

    if (validas.length === 1) {
      // Uma só opção: sem variação, preço e estoque ficam no próprio produto.
      const v = validas[0];
      const estoque = Number.isFinite(Number(v.variacao_estoque)) ? Number(v.variacao_estoque) : Number(p.produto_estoque_total);
      return new Perfume({ ...dados, preco: this.reais(v.variacao_preco), estoque: Math.max(0, estoque || 0) });
    }

    // Duas ou mais: cada uma vira uma variação; o produto guarda o menor preço e a soma dos estoques.
    const variacoes = validas.map((v, i) => ({
      descricao: this.limparEspacos(v.variacao_descricao).slice(0, LIMITE_VARIACAO) || `Opção ${i + 1}`,
      preco: this.reais(v.variacao_preco),
      estoque: Math.max(0, Number(v.variacao_estoque) || 0),
      ativo: 1,
      ordem: i
    }));
    return new Perfume({
      ...dados,
      preco: Math.min(...variacoes.map((v) => v.preco)),
      estoque: variacoes.reduce((soma, v) => soma + v.estoque, 0),
      variacoes
    });
  }

  /** Centavos -> reais com 2 casas (3000 vira 30). */
  reais(centavos) {
    return Math.round(Number(centavos)) / 100;
  }

  /** Tira as pontas e troca espaços repetidos por um só. */
  limparEspacos(texto) {
    return String(texto === undefined || texto === null ? '' : texto).replace(/\s+/g, ' ').trim();
  }

  /**
   * Da descrição em HTML tira os PONTOS ("500 Pontos" -> 500) e devolve o texto que sobrou
   * (sem tags, com entidades decodificadas). Sem o padrão, pontos = null e o texto fica inteiro.
   */
  separarPontos(html) {
    const limpo = limparHtml(html);
    const achou = PADRAO_PONTOS.exec(limpo);
    if (!achou) return { pontos: null, texto: limpo };
    const pontos = parseInt(achou[1].replace(/\./g, ''), 10);
    const texto = this.limparEspacos(limpo.replace(PADRAO_PONTOS, ' ')).replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '');
    return { pontos: Number.isFinite(pontos) ? pontos : null, texto };
  }

  /** "Categoria: X" sozinha, ou "Categoria: X. texto" quando há texto. */
  montarDescricao(categoria, texto) {
    const prefixo = categoria ? `Categoria: ${categoria}` : '';
    if (!texto) return prefixo || null;
    return prefixo ? `${prefixo}. ${texto}` : texto;
  }
}

/** Importador da Queen: a chave de "ja existe" e o SKU (rodar 2 vezes da o mesmo resultado). */
class ImportadorQueen extends ImportadorDeCatalogo {
  /** @param {PerfumeRepository} repositorio  @param {QueenConversor} conversor */
  constructor(repositorio, conversor = new QueenConversor()) {
    super(repositorio, conversor);
  }

  /** Procura pelo SKU; sem SKU, cai na chave padrão (nome + marca). */
  async localizar(perfume) {
    return perfume.sku ? this.repositorio.buscarPorSku(perfume.sku) : super.localizar(perfume);
  }
}

/** Roda a importação pela linha de comando: lê as opções, busca (ou lê do arquivo) e grava no banco. */
async function main() {
  const { opcao } = ImportadorDeCatalogo; // lê --nome=valor (função comum aos importadores)
  const arquivo = opcao('arquivo');
  const salvar = opcao('salvar');
  const produtos = arquivo
    ? JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, '')) // o arquivo pode ter BOM (marca de UTF-8)
    : await new QueenFonte().buscarTodos();
  if (salvar) fs.writeFileSync(salvar, JSON.stringify(produtos));

  // Carrega o banco só aqui, para os testes poderem importar as classes sem conectar.
  const db = require('../config/db');
  const PerfumeRepository = require('../repositories/PerfumeRepository');
  try {
    const resumo = await new ImportadorQueen(new PerfumeRepository(db)).importar(produtos);
    console.log(`Lidos: ${produtos.length} | importados: ${resumo.importados} | pulados (ja existiam): ${resumo.pulados} | invalidos: ${resumo.invalidos}`);
  } finally {
    await db.end();
  }
}

// Roda main() só quando o arquivo é executado direto (não quando o teste faz require).
if (require.main === module) {
  main().catch((erro) => { console.error('Falha na importação:', erro.message); process.exit(1); });
}

module.exports = { QueenFonte, QueenConversor, ImportadorQueen };
