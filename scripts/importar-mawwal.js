/**
 * scripts/importar-mawwal.js
 * Importa os produtos da loja Mawwal (lista publica do Shopify) para a tabela "perfumes".
 * Uso:   npm run importar:mawwal
 *        npm run importar:mawwal -- --salvar=mawwal.json     (baixa e guarda o JSON bruto)
 *        npm run importar:mawwal -- --arquivo=mawwal.json    (usa o JSON guardado, sem rede)
 *
 * Três classes, cada uma com UM trabalho (SOLID):
 *  - MawwalFonte:       busca o JSON na internet (única parte que usa rede).
 *  - MawwalConversor:   transforma um produto Shopify em um Perfume (sem rede, sem banco).
 *  - ImportadorMawwal:  o ImportadorDeCatalogo (comum a todas as lojas) com o conversor da Mawwal.
 *
 * Fonte: dados e fotos pertencem a Mawwal Arabia Brasil; uso apenas acadêmico.
 */
const fs = require('fs');
const Perfume = require('../domain/Perfume');
const { limparHtml } = require('../utils/html');
const ImportadorDeCatalogo = require('./importador-de-catalogo');

// Limites das colunas de script.sql (perfumes).
const LIMITE_NOME = 120;
const LIMITE_MARCA = 80;
const LIMITE_DESCRICAO = 65535; // TEXT
const LIMITE_FOTO = 500;
const LIMITE_CODIGO = 14;

// A fonte NÃO informa estoque, então todo produto importado nasce com este valor padrão.
const ESTOQUE_PADRAO = 10;
const MARCA = 'Mawwal';

/** Busca todas as páginas de products.json. */
class MawwalFonte {
  constructor({ url = 'https://mawwal.com.br/products.json', pausaMs = 1000, fetchFn = fetch } = {}) {
    this.url = url;
    this.pausaMs = pausaMs;
    this.fetchFn = fetchFn; // injetavel para testes
  }

  /** Página com ?limit=250&page=N até vir uma lista vazia. Devolve todos os produtos juntos. */
  async buscarTodos() {
    const todos = [];
    for (let pagina = 1; ; pagina++) {
      const resposta = await this.fetchFn(`${this.url}?limit=250&page=${pagina}`, {
        headers: { 'User-Agent': 'LojinhaChic/1.0 (trabalho academico)' }
      });
      if (!resposta.ok) throw new Error(`Fonte respondeu HTTP ${resposta.status} na pagina ${pagina}`);
      const { products = [] } = await resposta.json();
      if (!products.length) break;
      todos.push(...products);
      await new Promise((ok) => setTimeout(ok, this.pausaMs)); // educação com o servidor: 1 s entre páginas
    }
    return todos;
  }
}

/** Converte produto Shopify -> Perfume. Devolve null se o produto não serve (sem nome ou sem preço válido). */
class MawwalConversor {
  /** @param {object} p produto bruto do products.json (formato Shopify) @returns {Perfume|null} */
  converter(p) {
    const variante = (p.variants || [])[0] || {};
    const preco = Number(variante.price);
    const nome = String(p.title || '').trim().slice(0, LIMITE_NOME);
    if (!nome || !Number.isFinite(preco) || preco <= 0) return null;

    const foto = ((p.images || [])[0] || {}).src || '';
    const codigo = String(variante.barcode || '').trim();

    return new Perfume({
      nome,
      marca: MARCA.slice(0, LIMITE_MARCA), // o vendor vem 'Mawwal Arabia Brasil'; padronizamos para 'Mawwal'
      preco,
      estoque: ESTOQUE_PADRAO,
      descricao: this.limparHtml(p.body_html).slice(0, LIMITE_DESCRICAO),
      // codigo_barras e UNIQUE e tem 14 posicoes: se vier vazio ou grande demais, grava NULL.
      codigo_barras: codigo && codigo.length <= LIMITE_CODIGO ? codigo : null,
      // Só aceitamos foto https e que caiba na coluna.
      foto_url: foto.startsWith('https://') && foto.length <= LIMITE_FOTO ? foto : null,
      vendedor_id: null // sem dono: a coluna aceita NULL, então não precisamos criar usuario de importação
    });
  }

  /** Tira as tags HTML e decodifica as entidades (código compartilhado em utils/html.js). */
  limparHtml(html) {
    return limparHtml(html);
  }
}

/**
 * Importador da Mawwal: o ImportadorDeCatalogo (scripts/importador-de-catalogo.js, comum a todas as lojas)
 * com o conversor da Mawwal como padrão. Mantém o nome e o uso antigos: new ImportadorMawwal(repositorio).
 */
class ImportadorMawwal extends ImportadorDeCatalogo {
  /** @param {PerfumeRepository} repositorio  @param {MawwalConversor} conversor */
  constructor(repositorio, conversor = new MawwalConversor()) {
    super(repositorio, conversor);
  }
}

/** Roda a importação pela linha de comando: lê as opções, busca (ou lê do arquivo) e grava no banco. */
async function main() {
  const { opcao } = ImportadorDeCatalogo; // lê --nome=valor (função comum aos importadores)
  const arquivo = opcao('arquivo');
  const salvar = opcao('salvar');
  const produtos = arquivo
    ? JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    : await new MawwalFonte().buscarTodos();
  if (salvar) fs.writeFileSync(salvar, JSON.stringify(produtos));

  // Carrega o banco só aqui, para os testes poderem importar as classes sem conectar.
  const db = require('../config/db');
  const PerfumeRepository = require('../repositories/PerfumeRepository');
  try {
    const importador = new ImportadorMawwal(new PerfumeRepository(db));
    if (process.argv.includes('--corrigir-descricoes')) { // só regrava descrições com "&...;" (veja o README)
      console.log(`Descricoes corrigidas: ${await importador.corrigirDescricoes(produtos)}`);
      return;
    }
    const resumo = await importador.importar(produtos);
    console.log(`Lidos: ${produtos.length} | importados: ${resumo.importados} | pulados (ja existiam): ${resumo.pulados} | invalidos: ${resumo.invalidos}`);
  } finally {
    await db.end();
  }
}

// Roda main() só quando o arquivo é executado direto (não quando o teste faz require).
if (require.main === module) {
  main().catch((erro) => { console.error('Falha na importação:', erro.message); process.exit(1); });
}

module.exports = { MawwalFonte, MawwalConversor, ImportadorMawwal };
