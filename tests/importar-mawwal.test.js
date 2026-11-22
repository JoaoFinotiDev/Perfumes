/**
 * tests/importar-mawwal.test.js
 * Testa a conversao Shopify -> Perfume e a regra de nao duplicar. Sem rede e sem banco.
 */
const test = require('node:test');
const assert = require('node:assert');
const { MawwalConversor, ImportadorMawwal } = require('../scripts/importar-mawwal');

// Produto de exemplo no formato do products.json do Shopify.
const exemplo = {
  title: 'Perfume Teste',
  vendor: 'Mawwal Arabia Brasil',
  body_html: '<p>Aroma  <b>doce</b>&nbsp;e&amp;marcante</p>\n<p>Fixa&ccedil;&atilde;o longa</p>',
  variants: [{ price: '149.90', barcode: '' }],
  images: [{ src: 'https://cdn.exemplo.com/foto.jpg' }]
};

test('converte produto Shopify em Perfume', () => {
  const p = new MawwalConversor().converter(exemplo);
  assert.strictEqual(p.nome, 'Perfume Teste');
  assert.strictEqual(p.marca, 'Mawwal');
  assert.strictEqual(p.preco, 149.9);
  assert.strictEqual(p.estoque, 10);
  assert.strictEqual(p.codigoBarras, null);
  assert.strictEqual(p.fotoUrl, 'https://cdn.exemplo.com/foto.jpg');
  assert.ok(!p.descricao.includes('<'));
  assert.ok(p.descricao.startsWith('Aroma doce e&marcante'));
});

test('produto sem preco valido e descartado', () => {
  assert.strictEqual(new MawwalConversor().converter({ title: 'X', variants: [{ price: '0' }] }), null);
});

test('importar duas vezes nao duplica', async () => {
  const gravados = [];
  const repositorio = { // repositorio falso em memoria
    buscarPorNomeEMarca: async (n, m) => gravados.find((g) => g.nome === n && g.marca === m) || null,
    buscarPorCodigo: async () => null,
    criar: async (p) => { gravados.push(p); }
  };
  const importador = new ImportadorMawwal(repositorio);
  const r1 = await importador.importar([exemplo]);
  const r2 = await importador.importar([exemplo]);
  assert.deepStrictEqual([r1.importados, r2.importados, r2.pulados], [1, 0, 1]);
});
