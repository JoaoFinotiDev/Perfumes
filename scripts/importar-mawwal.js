/**
 * scripts/importar-mawwal.js
 * Importa os produtos da loja Mawwal (lista publica do Shopify) para a tabela "perfumes".
 * Uso:   npm run importar:mawwal
 *        npm run importar:mawwal -- --salvar=mawwal.json     (baixa e guarda o JSON bruto)
 *        npm run importar:mawwal -- --arquivo=mawwal.json    (usa o JSON guardado, sem rede)
 *
 * Tres classes, cada uma com UM trabalho (SOLID):
 *  - MawwalFonte:       busca o JSON na internet (unica parte que usa rede).
 *  - MawwalConversor:   transforma um produto Shopify em um Perfume (sem rede, sem banco).
 *  - ImportadorMawwal:  junta as pecas e grava pelo PerfumeRepository (nenhum SQL aqui).
 *
 * Fonte: dados e fotos pertencem a Mawwal Arabia Brasil; uso apenas academico.
 */
const fs = require('fs');
const Perfume = require('../domain/Perfume');

// Limites das colunas de script.sql (perfumes).
const LIMITE_NOME = 120;
const LIMITE_MARCA = 80;
const LIMITE_DESCRICAO = 65535; // TEXT
const LIMITE_FOTO = 500;
const LIMITE_CODIGO = 14;

// A fonte NAO informa estoque, entao todo produto importado nasce com este valor padrao.
const ESTOQUE_PADRAO = 10;
const MARCA = 'Mawwal';

// Entidades HTML com nome que aparecem nos textos em portugues. Nome da entidade -> caractere.
const ENTIDADES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã',
  egrave: 'è', eacute: 'é', ecirc: 'ê', Eacute: 'É', Ecirc: 'Ê',
  iacute: 'í', Iacute: 'Í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ',
  uacute: 'ú', uuml: 'ü', Uacute: 'Ú', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ',
  ordm: 'º', ordf: 'ª', ndash: '-', mdash: '-', hellip: '...', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"'
};

/**
 * Troca entidades HTML pelo caractere de verdade: &ccedil; (nome), &#233; (decimal) e &#xE9; (hexadecimal).
 * Passa UMA vez pelo texto, entao "&amp;ccedil;" vira "&ccedil;" (nao decodifica duas vezes).
 * Entidade desconhecida fica como veio.
 */
function decodificarEntidades(texto) {
  return String(texto).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (inteira, corpo) => {
    if (corpo[0] === '#') {
      const codigo = corpo[1].toLowerCase() === 'x' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      return codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : inteira;
    }
    return Object.prototype.hasOwnProperty.call(ENTIDADES, corpo) ? ENTIDADES[corpo] : inteira;
  });
}

/** Busca todas as paginas de products.json. */
class MawwalFonte {
  constructor({ url = 'https://mawwal.com.br/products.json', pausaMs = 1000, fetchFn = fetch } = {}) {
    this.url = url;
    this.pausaMs = pausaMs;
    this.fetchFn = fetchFn; // injetavel para testes
  }

  /** Pagina com ?limit=250&page=N ate vir uma lista vazia. Devolve todos os produtos juntos. */
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
      await new Promise((ok) => setTimeout(ok, this.pausaMs)); // educacao com o servidor: 1 s entre paginas
    }
    return todos;
  }
}

/** Converte produto Shopify -> Perfume. Devolve null se o produto nao serve (sem nome ou sem preco valido). */
class MawwalConversor {
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
      // So aceitamos foto https e que caiba na coluna.
      foto_url: foto.startsWith('https://') && foto.length <= LIMITE_FOTO ? foto : null,
      vendedor_id: null // sem dono: a coluna aceita NULL, entao nao precisamos criar usuario de importacao
    });
  }

  /** Tira as tags HTML, decodifica as entidades (&ccedil; vira ç) e junta espacos repetidos. */
  limparHtml(html) {
    const semTags = String(html || '').replace(/<[^>]*>/g, ' ');
    return decodificarEntidades(semTags).replace(/\s+/g, ' ').trim();
  }
}

/** Orquestra: converte cada produto e grava se ainda nao existir (rodar 2x da o mesmo resultado). */
class ImportadorMawwal {
  /** @param {PerfumeRepository} repositorio  @param {MawwalConversor} conversor */
  constructor(repositorio, conversor = new MawwalConversor()) {
    this.repositorio = repositorio;
    this.conversor = conversor;
  }

  async importar(produtos) {
    const resumo = { importados: 0, pulados: 0, invalidos: 0 };
    for (const bruto of produtos) {
      const perfume = this.conversor.converter(bruto);
      if (!perfume) { resumo.invalidos++; continue; }
      // Nao duplica: pula se ja existe o mesmo nome+marca ou o mesmo codigo de barras.
      const jaExiste = (await this.repositorio.buscarPorNomeEMarca(perfume.nome, perfume.marca))
        || (perfume.codigoBarras && await this.repositorio.buscarPorCodigo(perfume.codigoBarras));
      if (jaExiste) { resumo.pulados++; continue; }
      await this.repositorio.criar(perfume);
      resumo.importados++;
    }
    return resumo;
  }

  /**
   * Conserta SO a descricao de produtos ja importados que ficaram com entidades cruas ("&ccedil;").
   * Para cada produto da fonte, acha o do banco (nome + marca) e regrava a descricao ja decodificada,
   * mas apenas quando a do banco ainda tem "&...;". Nao mexe em mais nada e nao apaga nada.
   * Pode rodar varias vezes: depois de corrigida, a descricao nao tem mais "&...;" e e pulada.
   */
  async corrigirDescricoes(produtos) {
    let corrigidos = 0;
    for (const bruto of produtos) {
      const perfume = this.conversor.converter(bruto);
      if (!perfume) continue;
      const atual = await this.repositorio.buscarPorNomeEMarca(perfume.nome, perfume.marca);
      if (atual && /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/i.test(atual.descricao || '') && atual.descricao !== perfume.descricao) {
        await this.repositorio.atualizarDescricao(atual.id, perfume.descricao);
        corrigidos++;
      }
    }
    return corrigidos;
  }
}

/** Le --nome=valor da linha de comando. */
function opcao(nome) {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : null;
}

async function main() {
  const arquivo = opcao('arquivo');
  const salvar = opcao('salvar');
  const produtos = arquivo
    ? JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    : await new MawwalFonte().buscarTodos();
  if (salvar) fs.writeFileSync(salvar, JSON.stringify(produtos));

  // Carrega o banco so aqui, para os testes poderem importar as classes sem conectar.
  const db = require('../config/db');
  const PerfumeRepository = require('../repositories/PerfumeRepository');
  try {
    const importador = new ImportadorMawwal(new PerfumeRepository(db));
    if (process.argv.includes('--corrigir-descricoes')) { // so regrava descricoes com "&...;" (veja o README)
      console.log(`Descricoes corrigidas: ${await importador.corrigirDescricoes(produtos)}`);
      return;
    }
    const resumo = await importador.importar(produtos);
    console.log(`Lidos: ${produtos.length} | importados: ${resumo.importados} | pulados (ja existiam): ${resumo.pulados} | invalidos: ${resumo.invalidos}`);
  } finally {
    await db.end();
  }
}

// Roda main() so quando o arquivo e executado direto (nao quando o teste faz require).
if (require.main === module) {
  main().catch((erro) => { console.error('Falha na importacao:', erro.message); process.exit(1); });
}

module.exports = { MawwalFonte, MawwalConversor, ImportadorMawwal };
