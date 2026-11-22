/**
 * tests/gestao-variacoes.test.js
 * Testa (sem rede e sem banco) as variações na lista "Gerenciar produtos":
 *  - estoque da variação: inteiro >= 0, validado no servidor;
 *  - variação de OUTRO produto: 404 (não mexe em nada);
 *  - desativar tira a variação da soma do estoque e do preço "a partir de";
 *  - papel: Cliente não mexe (403); a tela mostra seta, linhas filhas e o total.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const ejs = require('ejs');
const Perfume = require('../domain/Perfume');
const { criarUsuario } = require('../domain/Usuario');
const PerfumeService = require('../services/PerfumeService');
const PerfumeRepository = require('../repositories/PerfumeRepository');
const GestaoProdutosController = require('../controllers/GestaoProdutosController');
const { ErroDeValidacao, ErroDePermissao } = require('../utils/erros');

const cliente = criarUsuario({ id: 1, usuario: 'c', nome: 'C', papel: 'cliente' });
const vendedor = criarUsuario({ id: 2, usuario: 'v', nome: 'V', papel: 'vendedor' });

/** Produto 1 com variações A (100, 2) e B (80, 3); produto 2 com a variação C (50, 1). */
function criarRepositorioFalso() {
  const lista = [
    new Perfume({ id: 1, nome: 'Anel', marca: 'Alfa', preco: 80, estoque: 5, visivel: 1, variacoes: [
      { id: 11, perfume_id: 1, descricao: 'A', preco: 100, estoque: 2, ativo: 1 },
      { id: 12, perfume_id: 1, descricao: 'B', preco: 80, estoque: 3, ativo: 1 }
    ] }),
    new Perfume({ id: 2, nome: 'Brinco', marca: 'Alfa', preco: 50, estoque: 1, visivel: 1, variacoes: [
      { id: 21, perfume_id: 2, descricao: 'C', preco: 50, estoque: 1, ativo: 1 }
    ] })
  ];
  const achar = (pid, vid) => lista.find((p) => p.id === pid).variacoes.find((x) => x.id === vid);
  return {
    lista,
    buscarPorId: async (id) => lista.find((p) => p.id === Number(id)) || null,
    listar: async () => lista,
    atualizarEstoqueVariacao: async (pid, vid, e) => { achar(pid, vid).estoque = e; return true; },
    definirVariacaoAtiva: async (pid, vid, a) => { achar(pid, vid).ativo = a; return true; },
    // Mesma regra do SQL: menor preço e soma dos estoques das variações ATIVAS.
    sincronizarComVariacoes: async (pid) => {
      const p = lista.find((x) => x.id === pid);
      const ativas = p.variacoes.filter((x) => x.ativo);
      if (!ativas.length) return;
      p.preco = Math.min(...ativas.map((x) => x.preco));
      p.estoque = ativas.reduce((s, x) => s + x.estoque, 0);
    }
  };
}

test('estoque da variação: grava inteiro >= 0 e ressincroniza a soma; negativo, decimal ou texto dá erro', async () => {
  const repo = criarRepositorioFalso();
  const servico = new PerfumeService(repo);
  assert.strictEqual(await servico.atualizarEstoqueVariacao(1, 11, '7', vendedor), true);
  assert.strictEqual(repo.lista[0].variacoes[0].estoque, 7);
  assert.strictEqual(repo.lista[0].estoque, 10); // 7 + 3
  assert.strictEqual(await servico.atualizarEstoqueVariacao(1, 11, '0', vendedor), true); // zero vale
  for (const ruim of ['-1', '1.5', 'abc', '']) {
    await assert.rejects(() => servico.atualizarEstoqueVariacao(1, 11, ruim, vendedor), ErroDeValidacao, ruim);
  }
});

test('variação de OUTRO produto (ou inexistente) devolve false e não muda nada', async () => {
  const repo = criarRepositorioFalso();
  const servico = new PerfumeService(repo);
  assert.strictEqual(await servico.atualizarEstoqueVariacao(1, 21, '9', vendedor), false); // 21 é do produto 2
  assert.strictEqual(await servico.definirVariacaoAtiva(1, 21, '0', vendedor), false);
  assert.strictEqual(await servico.atualizarEstoqueVariacao(99, 11, '9', vendedor), false); // produto não existe
  assert.strictEqual(repo.lista[1].variacoes[0].estoque, 1);
  assert.strictEqual(repo.lista[1].variacoes[0].ativo, true);
});

test('desativar tira a variação da soma e do "a partir de"; ativar devolve', async () => {
  const repo = criarRepositorioFalso();
  const servico = new PerfumeService(repo);
  await servico.definirVariacaoAtiva(1, 12, '0', vendedor); // B (80, 3) sai
  const p = repo.lista[0];
  assert.strictEqual(p.variacaoPorId(12), null); // some da vitrine / Abrir venda
  assert.strictEqual(p.estoqueDe(), 2);
  assert.strictEqual(p.precoBase(), 100);
  assert.strictEqual(p.preco, 100); // perfumes.preco ressincronizado
  await servico.definirVariacaoAtiva(1, 12, '1', vendedor);
  assert.strictEqual(p.precoBase(), 80);
  assert.strictEqual(p.estoque, 5);
});

test('papel: Cliente não mexe na variação (ErroDePermissao)', async () => {
  const servico = new PerfumeService(criarRepositorioFalso());
  await assert.rejects(() => servico.atualizarEstoqueVariacao(1, 11, '1', cliente), ErroDePermissao);
  await assert.rejects(() => servico.definirVariacaoAtiva(1, 11, '0', cliente), ErroDePermissao);
});

test('repositório: cada UPDATE mexe só na sua coluna, com parâmetros (?), e confere o produto', async () => {
  const consultas = [];
  const repo = new PerfumeRepository({ query: async (sql, p) => { consultas.push({ sql, p }); return [{ affectedRows: 1 }]; } });
  await repo.atualizarEstoqueVariacao(1, 11, 4);
  await repo.definirVariacaoAtiva(1, 11, false);
  assert.deepStrictEqual(consultas[0], { sql: 'UPDATE variacoes SET estoque = ? WHERE id = ? AND perfume_id = ?', p: [4, 11, 1] });
  assert.deepStrictEqual(consultas[1], { sql: 'UPDATE variacoes SET ativo = ? WHERE id = ? AND perfume_id = ?', p: [0, 11, 1] });
});

/** Resposta falsa: guarda status, view e redirect. */
function respostaFalsa() {
  const r = { codigo: 200, view: null, local: null };
  r.status = (c) => { r.codigo = c; return r; };
  r.render = (v) => { r.view = v; };
  r.redirect = (u) => { r.local = u; };
  return r;
}

test('controller: sucesso volta à mesma busca com a linha aberta; vid de outro produto 404; inválido 400; Cliente 403', async () => {
  const controller = new GestaoProdutosController(new PerfumeService(criarRepositorioFalso()));
  const pedido = (params, body, usuario = vendedor) => ({ params, body, query: {}, session: {}, usuario });

  let req = pedido({ id: '1', variacaoId: '11' }, { estoque: '4', q: 'anel rosa', aberto: '1' });
  let res = respostaFalsa();
  await controller.definirEstoqueVariacao(req, res);
  assert.strictEqual(res.local, '/vendedor/produtos?q=anel+rosa&aberto=1#produto-1');
  assert.strictEqual(req.session.aviso, 'Estoque atualizado');

  req = pedido({ id: '1', variacaoId: '11' }, { ativo: '0' });
  res = respostaFalsa();
  await controller.definirAtivoVariacao(req, res);
  assert.strictEqual(req.session.aviso, 'Variação desativada');
  assert.strictEqual(res.local, '/vendedor/produtos?aberto=1#produto-1');

  res = respostaFalsa();
  await controller.definirEstoqueVariacao(pedido({ id: '1', variacaoId: '21' }, { estoque: '4' }), res);
  assert.strictEqual(res.codigo, 404);

  res = respostaFalsa();
  await controller.definirEstoqueVariacao(pedido({ id: '1', variacaoId: '11' }, { estoque: '-2' }), res);
  assert.strictEqual(res.codigo, 400);
  assert.strictEqual(res.view, 'produtos');

  res = respostaFalsa();
  await controller.definirAtivoVariacao(pedido({ id: '1', variacaoId: '11' }, { ativo: '0' }, cliente), res);
  assert.strictEqual(res.codigo, 403);
});

test('tela: produto com variações tem seta, linhas filhas, "a partir de" e total sem campo; sem variação tem o campo', async () => {
  const repo = criarRepositorioFalso();
  repo.lista.push(new Perfume({ id: 3, nome: 'Simples', marca: 'Alfa', preco: 10, estoque: 4, visivel: 1 }));
  repo.lista[0].variacoes[1].ativo = false; // B inativa: continua listada, como "Inativa"
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'produtos.ejs'), {
    perfumes: repo.lista, busca: '', erro: null, aberto: 1, usuario: vendedor, mostrarCarrinho: false, aviso: null,
    moeda: require('../utils/moeda')
  });
  assert.match(html, /data-seta hidden aria-expanded="true" aria-controls="var-1-11 var-1-12"/);
  assert.match(html, /id="var-1-12" class="linha-variacao variacao-inativa" data-filha-de="1" data-aberta/);
  assert.match(html, /a partir de R\$\s100,00/); // só a A está ativa
  assert.match(html, /2 \(total\)/);
  assert.ok(!html.includes('action="/vendedor/produtos/1/estoque"'), 'produto com variações não tem estoque próprio');
  assert.ok(html.includes('action="/vendedor/produtos/3/estoque"'), 'produto sem variação mantém o estoque rápido');
  assert.ok(html.includes('action="/vendedor/produtos/1/variacoes/11/estoque"'));
  assert.ok(html.includes('action="/vendedor/produtos/1/variacoes/12/ativo"'));
  assert.match(html, />Ativar</);
  assert.ok(html.includes('href="/vendedor/produtos/1/editar#variacoes"'));
  assert.ok(!html.includes('id="var-2-21" class="linha-variacao" data-filha-de="2" data-aberta'), 'só o produto ?aberto volta aberto');
});
