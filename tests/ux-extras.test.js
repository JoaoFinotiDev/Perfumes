/**
 * tests/ux-extras.test.js
 * Testa (sem rede e sem banco) os extras de UX: título por tela, meta Open Graph com endereço completo,
 * erro com volta à vitrine, vitrine vazia com "Limpar filtros", zoom só com foto e o olhinho da senha.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const ejs = require('ejs');
const { carregarUsuario } = require('../middlewares/auth');
const CatalogoController = require('../controllers/CatalogoController');
const moeda = require('../utils/moeda');

const views = path.join(__dirname, '..', 'views');
const base = {
  usuario: null, mostrarCarrinho: true, moeda, aviso: null, percentualDesconto: 0, percentualCliente: 5,
  urlDoSite: 'https://loja.test', caminhoAtual: '/'
};

test('middleware: urlDoSite vem do SITE_URL (sem barra no fim) ou do próprio pedido', () => {
  const pedido = { session: {}, protocol: 'http', originalUrl: '/produto/7', get: () => 'localhost:3000' };
  const antes = process.env.SITE_URL;
  try {
    delete process.env.SITE_URL;
    let res = { locals: {} };
    carregarUsuario(pedido, res, () => {});
    assert.strictEqual(res.locals.urlDoSite, 'http://localhost:3000');
    assert.strictEqual(res.locals.caminhoAtual, '/produto/7');
    process.env.SITE_URL = 'https://lojinha.example/';
    res = { locals: {} };
    carregarUsuario(pedido, res, () => {});
    assert.strictEqual(res.locals.urlDoSite, 'https://lojinha.example');
  } finally {
    if (antes === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = antes;
  }
});

test('topo: título da tela e cartão Open Graph/Twitter com endereço completo do logo', async () => {
  const html = await ejs.renderFile(path.join(views, 'login.ejs'), { ...base, erro: null, form: {} });
  assert.match(html, /<title>Entrar - Lojinha Chic<\/title>/);
  assert.match(html, /<meta property="og:title" content="Entrar - Lojinha Chic">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/loja\.test\/images\/logo\.jpg">/);
  assert.match(html, /<meta name="twitter:card" content="summary">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/images\/logo\.jpg">/);
  assert.match(html, /data-mostrar-senha/); // olhinho da senha
  assert.match(html, /mostrar-senha\.js/);
});

test('erro (404): botão de volta para a vitrine', async () => {
  const html = await ejs.renderFile(path.join(views, 'erro.ejs'), { ...base, titulo: 'Página não encontrada', mensagem: 'Esse endereço não existe.' });
  assert.match(html, /<a href="\/" class="botao-link botao-grande">Voltar à vitrine<\/a>/);
});

test('vitrine vazia: "Limpar filtros" só quando há busca ou marca; título muda com a busca', async () => {
  const comum = { ...base, cards: [], marcas: [], ordem: 'nome', paginacao: { porPagina: 30 }, links: {}, opcoesPorPagina: [30, 50, 100] };
  const comBusca = await ejs.renderFile(path.join(views, 'vitrine.ejs'), { ...comum, busca: 'xyz', marca: '', titulo: 'Busca: xyz' });
  assert.match(comBusca, /Nenhum perfume encontrado/);
  assert.match(comBusca, />Limpar filtros</);
  assert.match(comBusca, /<title>Busca: xyz - Lojinha Chic<\/title>/);
  const semBusca = await ejs.renderFile(path.join(views, 'vitrine.ejs'), { ...comum, busca: '', marca: '' });
  assert.ok(!semBusca.includes('Limpar filtros'));

  // O controller escolhe o título: busca > marca > "Vitrine".
  let dados = null;
  const ctrl = new CatalogoController({ vitrine: async () => ({ busca: 'rosa', marca: 'Alfa' }) }, {});
  await ctrl.vitrine({ query: {}, usuario: null }, { render: (v, d) => { dados = d; } });
  assert.strictEqual(dados.titulo, 'Busca: rosa');
});

test('página do produto: zoom só quando há foto; foto principal sem lazy e com decoding async', async () => {
  const p = {
    id: 7, nome: 'Rosa', marca: 'Alfa', sku: null, pontos: null, visivel: true, descricao: 'd',
    preco: 10, precoFinal: 10, temVariacoes: false, variacoes: [], variacoesCard: [], maisOpcoes: 0, inicialId: null,
    estoque: 3, estoqueAtual: 3, aviso: { tipo: '', texto: '' }
  };
  const comFoto = await ejs.renderFile(path.join(views, 'produto.ejs'), { ...base, p: { ...p, fotoUrl: 'https://cdn.test/rosa.jpg' } });
  assert.match(comFoto, /<a href="https:\/\/cdn\.test\/rosa\.jpg" class="foto-zoom" data-zoom aria-label="Ampliar a foto de Rosa">/);
  assert.match(comFoto, /decoding="async" fetchpriority="high"/);
  assert.match(comFoto, /zoom-foto\.js/);
  const semFoto = await ejs.renderFile(path.join(views, 'produto.ejs'), { ...base, p: { ...p, fotoUrl: null } });
  assert.ok(!semFoto.includes('data-zoom'));
});
