/**
 * tests/carrinho-busca-estoque.test.js
 * Testa (sem rede e sem banco, com repositório falso em memória):
 *  1) carrinho só do Cliente (domínio + middleware);
 *  2) rota JSON /api/produtos: visíveis, ocultos só para quem gerencia, limite de 50;
 *  3) estoque rápido: inteiro >= 0, permissão e erro 400.
 */
const test = require('node:test');
const assert = require('node:assert');
const Perfume = require('../domain/Perfume');
const { criarUsuario } = require('../domain/Usuario');
const PerfumeService = require('../services/PerfumeService');
const CatalogoController = require('../controllers/CatalogoController');
const GestaoProdutosController = require('../controllers/GestaoProdutosController');
const { carregarUsuario, exigirCliente } = require('../middlewares/auth');
const { ErroDeValidacao, ErroDePermissao } = require('../utils/erros');

const cliente = criarUsuario({ id: 1, usuario: 'c', nome: 'C', papel: 'cliente' });
const vendedor = criarUsuario({ id: 2, usuario: 'v', nome: 'V', papel: 'vendedor' });
const admin = criarUsuario({ id: 3, usuario: 'a', nome: 'A', papel: 'admin' });

/** Repositório falso: 60 produtos visíveis + 1 oculto ("Segredo"). Respeita busca, apenasVisiveis e limite. */
function criarRepositorioFalso() {
  const lista = [];
  for (let i = 1; i <= 60; i++) {
    lista.push(new Perfume({ id: i, nome: `Rosa ${i}`, marca: 'Alfa', preco: 100, estoque: 5, visivel: 1 }));
  }
  lista.push(new Perfume({ id: 99, nome: 'Segredo', marca: 'Beta', preco: 100, estoque: 5, visivel: 0 }));
  return {
    lista,
    listar: async (busca, { apenasVisiveis = false, limite = 0 } = {}) => {
      const achados = lista.filter((p) => (!apenasVisiveis || p.visivel) && p.nome.toLowerCase().includes(busca.toLowerCase()));
      return limite > 0 ? achados.slice(0, limite) : achados;
    },
    buscarPorId: async (id) => lista.find((p) => p.id === id) || null,
    atualizarEstoque: async (id, estoque) => { lista.find((p) => p.id === id).estoque = estoque; }
  };
}

/** res falso: guarda status, JSON, página renderizada e redirecionamento. */
function criarRes() {
  const res = { statusCode: 200 };
  res.status = (n) => { res.statusCode = n; return res; };
  res.json = (d) => { res.corpo = d; return res; };
  res.render = (v, d) => { res.view = v; res.dados = d; return res; };
  res.redirect = (l) => { res.local = l; return res; };
  return res;
}

// ---------- 1) Carrinho só do Cliente ----------

test('só o Cliente pode usar o carrinho (método de domínio)', () => {
  assert.strictEqual(cliente.podeUsarCarrinho(), true);
  assert.strictEqual(vendedor.podeUsarCarrinho(), false);
  assert.strictEqual(admin.podeUsarCarrinho(), false);
});

test('exigirCliente: visitante vai ao login com aviso, vendedor/admin recebem 403, cliente passa', () => {
  let passou = false;
  const next = () => { passou = true; };

  const sessao = {};
  const resVisitante = criarRes();
  exigirCliente({ usuario: null, session: sessao }, resVisitante, next);
  assert.strictEqual(resVisitante.local, '/login');
  assert.strictEqual(sessao.aviso, 'Entre como cliente para comprar.');
  assert.strictEqual(passou, false);

  for (const u of [vendedor, admin]) {
    const res = criarRes();
    exigirCliente({ usuario: u, session: {} }, res, next);
    assert.strictEqual(res.statusCode, 403);
  }
  assert.strictEqual(passou, false);

  exigirCliente({ usuario: cliente, session: {} }, criarRes(), next);
  assert.strictEqual(passou, true);
});

test('o menu recebe mostrarCarrinho pronto: visitante e cliente sim, vendedor e admin não', () => {
  const quem = (u) => {
    const res = { locals: {} };
    carregarUsuario({ session: { usuario: u && u.paraSessao() } }, res, () => {});
    return res.locals.mostrarCarrinho;
  };
  assert.strictEqual(quem(null), true);
  assert.strictEqual(quem(cliente), true);
  assert.strictEqual(quem(vendedor), false);
  assert.strictEqual(quem(admin), false);
});

// ---------- 2) GET /api/produtos ----------

test('/api/produtos: sem login só visíveis, no máximo 50 itens', async () => {
  const ctrl = new CatalogoController(new PerfumeService(criarRepositorioFalso()));
  const res = criarRes();
  await ctrl.buscarJson({ query: {}, usuario: null }, res);
  assert.strictEqual(res.corpo.length, 50);
  assert.ok(res.corpo.every((p) => p.nome !== 'Segredo'));
  assert.deepStrictEqual(Object.keys(res.corpo[0]).sort(), ['fotoUrl', 'id', 'marca', 'nome', 'precoTexto', 'sku', 'temVariacoes']);

  const filtrado = criarRes();
  await ctrl.buscarJson({ query: { q: 'rosa 5' }, usuario: null }, filtrado);
  assert.ok(filtrado.corpo.length > 0 && filtrado.corpo.every((p) => p.nome.includes('Rosa 5')));
});

test('/api/produtos?todos=1: oculto só para Vendedor/Admin; visitante e cliente levam 403', async () => {
  const ctrl = new CatalogoController(new PerfumeService(criarRepositorioFalso()));
  for (const u of [null, cliente]) {
    const res = criarRes();
    await ctrl.buscarJson({ query: { todos: '1', q: 'Segredo' }, usuario: u }, res);
    assert.strictEqual(res.statusCode, 403);
  }
  for (const u of [vendedor, admin]) {
    const res = criarRes();
    await ctrl.buscarJson({ query: { todos: '1', q: 'Segredo' }, usuario: u }, res);
    assert.deepStrictEqual(res.corpo.map((p) => p.nome), ['Segredo']);
  }
  // Mesmo para o vendedor, sem todos=1 o oculto continua fora.
  const res = criarRes();
  await ctrl.buscarJson({ query: { q: 'Segredo' }, usuario: vendedor }, res);
  assert.deepStrictEqual(res.corpo, []);
});

// ---------- 3) Estoque rápido ----------

test('atualizarEstoque grava inteiro >= 0 (inclusive 0) e recusa o resto', async () => {
  const repo = criarRepositorioFalso();
  const servico = new PerfumeService(repo);
  assert.strictEqual(await servico.atualizarEstoque(1, '12', vendedor), true);
  assert.strictEqual(repo.lista[0].estoque, 12);
  assert.strictEqual(await servico.atualizarEstoque(1, '0', admin), true);
  assert.strictEqual(repo.lista[0].estoque, 0);
  for (const ruim of ['-1', '1.5', 'abc', '', undefined, '999999999']) {
    await assert.rejects(() => servico.atualizarEstoque(1, ruim, vendedor), ErroDeValidacao, `valor ${ruim}`);
  }
  assert.strictEqual(repo.lista[0].estoque, 0); // nada mudou nos erros
  assert.strictEqual(await servico.atualizarEstoque(12345, '3', vendedor), false); // produto inexistente
});

test('atualizarEstoque: cliente e visitante recebem erro de permissão', async () => {
  const servico = new PerfumeService(criarRepositorioFalso());
  await assert.rejects(() => servico.atualizarEstoque(1, '3', cliente), ErroDePermissao);
  await assert.rejects(() => servico.atualizarEstoque(1, '3', null), ErroDePermissao);
});

test('controller do estoque: valor inválido -> 400 com mensagem; válido -> aviso "Estoque atualizado"', async () => {
  const ctrl = new GestaoProdutosController(new PerfumeService(criarRepositorioFalso()));

  const ruim = criarRes();
  await ctrl.definirEstoque({ params: { id: '1' }, body: { estoque: '-3' }, query: {}, session: {}, usuario: vendedor }, ruim);
  assert.strictEqual(ruim.statusCode, 400);
  assert.strictEqual(ruim.view, 'produtos');
  assert.match(ruim.dados.erro, /Estoque/);

  const sessao = {};
  const bom = criarRes();
  await ctrl.definirEstoque({ params: { id: '1' }, body: { estoque: '7' }, query: {}, session: sessao, usuario: vendedor }, bom);
  assert.strictEqual(bom.local, '/vendedor/produtos');
  assert.strictEqual(sessao.aviso, 'Estoque atualizado');

  const proibido = criarRes();
  await ctrl.definirEstoque({ params: { id: '1' }, body: { estoque: '7' }, query: {}, session: {}, usuario: cliente }, proibido);
  assert.strictEqual(proibido.statusCode, 403);
});
