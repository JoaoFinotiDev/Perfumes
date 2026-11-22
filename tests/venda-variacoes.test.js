/**
 * tests/venda-variacoes.test.js
 * Testa (sem rede e sem banco, com repositório falso em memória) a rota GET /api/produtos/:id/variacoes,
 * usada pela segunda busca da tela "Abrir venda":
 *  - papel: visitante e Cliente recebem 403; Vendedor e Admin recebem a lista;
 *  - ordem natural (9, 14, 23...), igual à vitrine;
 *  - variação esgotada vem marcada; variação inativa não aparece; produto inexistente dá 404.
 */
const test = require('node:test');
const assert = require('node:assert');
const Perfume = require('../domain/Perfume');
const { criarUsuario } = require('../domain/Usuario');
const VitrineService = require('../services/VitrineService');
const GestaoProdutosService = require('../services/GestaoProdutosService');
const CatalogoController = require('../controllers/CatalogoController');

const cliente = criarUsuario({ id: 1, usuario: 'c', nome: 'C', papel: 'cliente' });
const vendedor = criarUsuario({ id: 2, usuario: 'v', nome: 'V', papel: 'vendedor' });
const admin = criarUsuario({ id: 3, usuario: 'a', nome: 'A', papel: 'admin' });

/** Produto 7 (oculto, de propósito): variações fora de ordem "23", "9", "14"; "9" esgotada; "40" inativa. */
function criarController() {
  const produto = new Perfume({
    id: 7, nome: 'Perfume X', marca: 'Alfa', preco: 100, estoque: 9, visivel: 0,
    variacoes: [
      { id: 1, perfume_id: 7, descricao: '23 ml', preco: 230, estoque: 3, ativo: 1, ordem: 0 },
      { id: 2, perfume_id: 7, descricao: '9 ml', preco: 90, estoque: 0, ativo: 1, ordem: 1 },
      { id: 3, perfume_id: 7, descricao: '14 ml', preco: 140, estoque: 6, ativo: 1, ordem: 2 },
      { id: 4, perfume_id: 7, descricao: '40 ml', preco: 400, estoque: 1, ativo: 0, ordem: 3 }
    ]
  });
  const repositorio = { buscarPorId: async (id) => (id === 7 ? produto : null) };
  return new CatalogoController(new VitrineService(repositorio), new GestaoProdutosService(repositorio));
}

/** res falso: guarda status e JSON. */
function criarRes() {
  const res = { statusCode: 200 };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (d) => { res.corpo = d; return res; };
  return res;
}

test('variações: visitante e Cliente recebem 403', async () => {
  const c = criarController();
  for (const usuario of [null, cliente]) {
    const res = criarRes();
    await c.variacoesJson({ usuario, params: { id: '7' } }, res);
    assert.strictEqual(res.statusCode, 403);
  }
});

test('variações: Vendedor e Admin recebem em ordem natural, com a esgotada marcada e sem a inativa', async () => {
  const c = criarController();
  for (const usuario of [vendedor, admin]) {
    const res = criarRes();
    await c.variacoesJson({ usuario, params: { id: '7' } }, res); // produto oculto também vale no balcão
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.corpo.map((v) => v.descricao), ['9 ml', '14 ml', '23 ml']);
    assert.deepStrictEqual(res.corpo.map((v) => v.esgotada), [true, false, false]);
    assert.strictEqual(res.corpo[1].estoque, 6);
    assert.match(res.corpo[1].precoTexto, /140/);
  }
});

test('variações: produto que não existe (ou id inválido) dá 404', async () => {
  const c = criarController();
  const res = criarRes();
  await c.variacoesJson({ usuario: vendedor, params: { id: '999' } }, res);
  assert.strictEqual(res.statusCode, 404);
});
