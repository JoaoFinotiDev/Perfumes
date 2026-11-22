/**
 * tests/card-vitrine.test.js
 * Testa o card da vitrine: regra do selo "Últimas N" e os chips de variação.
 * Sem rede e sem banco: compila o EJS com dados falsos.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const ejs = require('ejs');
const Perfume = require('../domain/Perfume');
const PerfumeService = require('../services/PerfumeService');
const moeda = require('../utils/moeda');

const servico = new PerfumeService({});
const raiz = path.join(__dirname, '..');

/** Monta um produto com variações [{descricao, estoque}] e devolve o "cartão" que a view recebe. */
function cartao(estoqueDasVariacoes, estoqueDoProduto = 10) {
  const variacoes = estoqueDasVariacoes.map((estoque, i) => ({
    id: 100 + i, perfume_id: 1, descricao: 'V' + i, preco: 100, estoque, ativo: 1, ordem: i
  }));
  const p = new Perfume({ id: 1, nome: 'Teste', marca: 'Alfa', preco: 100, estoque: estoqueDoProduto, visivel: 1, variacoes });
  return servico._cartao(p, null, 0);
}

/** Renderiza o bloco de compra (parcial compartilhada) como o card ou a página do produto. */
function renderizar(p, ctx) {
  return ejs.renderFile(path.join(raiz, 'views/partials/produto-compra.ejs'), { p, ctx, moeda, mostrarCarrinho: true });
}

test('avisoDeEstoque: 0 = Esgotado, 1 a 5 = Últimas N, acima de 5 = nada', () => {
  assert.deepStrictEqual(Perfume.avisoDeEstoque(0), { tipo: 'esgotado', texto: 'Esgotado' });
  assert.deepStrictEqual(Perfume.avisoDeEstoque(1), { tipo: 'ultimas', texto: 'Últimas 1' });
  assert.deepStrictEqual(Perfume.avisoDeEstoque(5), { tipo: 'ultimas', texto: 'Últimas 5' });
  assert.deepStrictEqual(Perfume.avisoDeEstoque(6), { tipo: '', texto: '' });
});

test('produto sem variações usa o estoque do próprio produto no selo', async () => {
  const p = servico._cartao(new Perfume({ id: 1, nome: 'X', marca: 'A', preco: 50, estoque: 3, visivel: 1 }), null, 0);
  assert.strictEqual(p.aviso.texto, 'Últimas 3');
  const html = await renderizar(p, 'card');
  assert.match(html, /Últimas 3/);
  assert.doesNotMatch(html, /em estoque/);
});

test('estoque acima de 5: o selo fica escondido (hidden) e sem texto', async () => {
  const html = await renderizar(cartao([9]), 'card');
  assert.match(html, /<p class="aviso-estoque aviso-"[^>]* hidden>\s*<\/p>/);
});

test('chips: esgotada vem desativada, a primeira com estoque vem marcada, cada chip traz o seu selo', async () => {
  const html = await renderizar(cartao([0, 2, 8]), 'card');
  assert.match(html, /<fieldset class="variacoes">/);
  assert.match(html, /<legend class="so-leitor">/);
  assert.strictEqual((html.match(/type="radio"/g) || []).length, 3);
  assert.match(html, /value="100"[^>]*disabled/); // esgotada
  assert.match(html, /value="101"[^>]*checked/); // primeira com estoque
  assert.match(html, /value="101"[^>]*data-aviso-texto="Últimas 2"/);
  assert.match(html, /value="102"[^>]*data-aviso-tipo=""/); // 8 em estoque: sem selo
  assert.match(html, /chip-esgotado/);
  assert.doesNotMatch(html, /<select/);
});

test('card com mais de 6 opções mostra 6 chips e o chip +N que leva à página do produto', async () => {
  const p = cartao([1, 1, 1, 1, 1, 1, 1, 1]); // 8 opções
  const card = await renderizar(p, 'card');
  assert.strictEqual((card.match(/type="radio"/g) || []).length, 6);
  assert.match(card, /<a class="chip chip-mais" href="\/produto\/1"[^>]*><span>\+2<\/span>/);
  // Na página do produto aparecem todas, sem "+N".
  const pagina = await renderizar(p, 'pagina');
  assert.strictEqual((pagina.match(/type="radio"/g) || []).length, 8);
  assert.doesNotMatch(pagina, /chip-mais/);
});

test('se as 6 primeiras estão esgotadas, a variação marcada de início entra nos chips do card', async () => {
  const p = cartao([0, 0, 0, 0, 0, 0, 4]);
  assert.ok(p.variacoesCard.some((x) => x.id === p.inicialId));
  assert.match(await renderizar(p, 'card'), /value="106"[^>]*checked/);
});

test('todas esgotadas: nenhum chip marcado, selo Esgotado e botão desativado', async () => {
  const html = await renderizar(cartao([0, 0]), 'card');
  assert.doesNotMatch(html, /checked/);
  assert.match(html, /aviso-esgotado/);
  assert.match(html, /data-enviar[^>]*disabled/);
});

test('a vitrine compila (com card e SKU/pontos) e a página do produto compila', async () => {
  const p = { ...cartao([2, 7]), sku: '123', pontos: null, nome: 'Teste', marca: 'Alfa', fotoUrl: null, temDesconto: false, percentual: 0 };
  const paginacao = { porPagina: 30, inicio: 1, fim: 1, total: 1, totalPaginas: 1 };
  const comum = { usuario: null, mostrarCarrinho: true, temDesconto: false, moeda, aviso: null, erro: null };
  const vitrine = await ejs.renderFile(path.join(raiz, 'views/vitrine.ejs'), {
    ...comum, cards: [p], marcas: [], busca: '', marca: '', ordem: 'nome', paginacao, links: {}
  });
  assert.match(vitrine, /card-codigos/);
  const pagina = await ejs.renderFile(path.join(raiz, 'views/produto.ejs'), { ...comum, p: { ...p, visivel: true, descricao: 'd' } });
  assert.match(pagina, /type="radio"/);
});
