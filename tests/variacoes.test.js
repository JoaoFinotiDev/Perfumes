/**
 * tests/variacoes.test.js
 * Testa variações de produto, SKU, pontos (só Queen Semijoias) e quantidade no carrinho.
 * Sem rede e sem banco: repositório falso em memória e conexão falsa para a venda.
 */
const test = require('node:test');
const assert = require('node:assert');
const Perfume = require('../domain/Perfume');
const Variacao = require('../domain/Variacao');
const Carrinho = require('../domain/Carrinho');
const { criarUsuario } = require('../domain/Usuario');
const PerfumeService = require('../services/PerfumeService');
const VitrineService = require('../services/VitrineService');
const GestaoProdutosService = require('../services/GestaoProdutosService');
const CarrinhoService = require('../services/CarrinhoService');
const CarrinhoController = require('../controllers/CarrinhoController');
const VendaRepository = require('../repositories/VendaRepository');
const { Venda } = require('../domain/Venda');
const { ErroDeValidacao, ErroDePermissao, EstoqueInsuficienteError } = require('../utils/erros');

const cliente = criarUsuario({ id: 1, usuario: 'c', nome: 'C', papel: 'cliente' });
const vendedor = criarUsuario({ id: 2, usuario: 'v', nome: 'V', papel: 'vendedor' });

/** Produto 1: sem variação (100, estoque 5). Produto 2: com variações A (100, 2), B (80, 0 = esgotada), C (120, 4). */
function criarRepositorioFalso() {
  const lista = [
    new Perfume({ id: 1, nome: 'Simples', marca: 'Alfa', preco: 100, estoque: 5, visivel: 1 }),
    new Perfume({
      id: 2, nome: 'Anel', marca: 'Queen Semijoias', preco: 80, estoque: 6, visivel: 1, sku: '2001', pontos: 500,
      variacoes: [
        { id: 21, perfume_id: 2, descricao: 'A', preco: 100, estoque: 2, ativo: 1, ordem: 0 },
        { id: 22, perfume_id: 2, descricao: 'B', preco: 80, estoque: 0, ativo: 1, ordem: 1 },
        { id: 23, perfume_id: 2, descricao: 'C', preco: 120, estoque: 4, ativo: 1, ordem: 2 }
      ]
    }),
    new Perfume({ id: 3, nome: 'Oculto', marca: 'Alfa', preco: 10, estoque: 1, visivel: 0 })
  ];
  let proximaVariacao = 100;
  return {
    lista,
    listar: async (busca, { apenasVisiveis = false } = {}) => lista.filter((p) => !apenasVisiveis || p.visivel),
    contar: async (busca, { apenasVisiveis = false } = {}) => lista.filter((p) => !apenasVisiveis || p.visivel).length,
    listarMarcas: async () => [...new Set(lista.filter((p) => p.visivel).map((p) => p.marca))],
    buscarPorId: async (id) => lista.find((p) => p.id === id) || null,
    buscarPorCodigo: async () => null,
    buscarPorSku: async (sku) => lista.find((p) => p.sku === sku) || null,
    atualizar: async (id, d) => {
      const p = lista.find((x) => x.id === id);
      Object.assign(p, { nome: d.nome, marca: d.marca, preco: d.preco, estoque: d.estoque, sku: d.sku, pontos: d.pontos });
    },
    atualizarEstoque: async (id, e) => { lista.find((p) => p.id === id).estoque = e; },
    criar: async (d) => { lista.push(new Perfume({ ...d, id: 50 })); return 50; },
    criarVariacao: async (pid, d) => {
      lista.find((p) => p.id === pid).variacoes.push(new Variacao({ id: ++proximaVariacao, perfume_id: pid, ...d }));
    },
    atualizarVariacao: async (pid, vid, d) => {
      const v = lista.find((p) => p.id === pid).variacoes.find((x) => x.id === vid);
      if (!v) return false;
      Object.assign(v, d);
      return true;
    },
    removerVariacao: async (pid, vid) => {
      const p = lista.find((x) => x.id === pid);
      const antes = p.variacoes.length;
      p.variacoes = p.variacoes.filter((v) => v.id !== vid);
      return p.variacoes.length < antes;
    },
    // Mesma regra do SQL: menor preço e soma dos estoques das variações ATIVAS.
    sincronizarComVariacoes: async (pid) => {
      const p = lista.find((x) => x.id === pid);
      const ativas = p.variacoes.filter((v) => v.ativo);
      if (!ativas.length) return;
      p.preco = Math.min(...ativas.map((v) => v.preco));
      p.estoque = ativas.reduce((s, v) => s + v.estoque, 0);
    }
  };
}

const formulario = { nome: 'Anel', marca: 'Queen Semijoias', preco: '100', estoque: '3', descricao: '', codigo_barras: '', foto_url: '', sku: '', pontos: '' };

// ---------- Domínio ----------

test('produto SEM variação continua igual a hoje: preço e estoque do próprio produto', () => {
  const p = criarRepositorioFalso().lista[0];
  assert.strictEqual(p.temVariacoes(), false);
  assert.strictEqual(p.precoPara(null), 100);
  assert.strictEqual(p.precoPara(cliente), 95);
  assert.strictEqual(p.estoqueDe(), 5);
});

test('produto COM variação: preço e estoque vêm da variação; "a partir de" = menor preço; estoque total = soma', () => {
  const p = criarRepositorioFalso().lista[1];
  const c = p.variacaoPorId('23'); // aceita texto (vem de formulário)
  assert.strictEqual(p.precoPara(null, c), 120);
  assert.strictEqual(p.estoqueDe(c), 4);
  assert.strictEqual(p.precoBase(), 80);
  assert.strictEqual(p.estoqueDe(), 6);
  assert.strictEqual(p.variacaoPorId(999), null);
});

test('desconto de 5% do Cliente vale na variação', () => {
  const p = criarRepositorioFalso().lista[1];
  assert.strictEqual(p.precoPara(cliente, p.variacaoPorId(23)), 114); // 120 - 5%
  assert.strictEqual(p.precoPara(vendedor, p.variacaoPorId(23)), 120);
});

test('variação inativa não pode ser escolhida; sem nenhuma ativa o produto volta ao preço dele', () => {
  const p = new Perfume({ id: 9, nome: 'X', marca: 'Y', preco: 50, estoque: 3, variacoes: [{ id: 1, perfume_id: 9, descricao: 'A', preco: 10, estoque: 1, ativo: 0 }] });
  assert.strictEqual(p.temVariacoes(), false);
  assert.strictEqual(p.variacaoPorId(1), null);
  assert.strictEqual(p.precoPara(null), 50);
});

test('pontos: só a marca Queen Semijoias guarda; as outras viram null', () => {
  assert.strictEqual(new Perfume({ id: 1, nome: 'a', marca: 'Queen Semijoias', preco: 1, pontos: 300 }).pontos, 300);
  assert.strictEqual(new Perfume({ id: 1, nome: 'a', marca: ' queen semijoias ', preco: 1, pontos: 300 }).pontos, 300);
  assert.strictEqual(new Perfume({ id: 1, nome: 'a', marca: 'Outra Marca', preco: 1, pontos: 300 }).pontos, null);
  assert.strictEqual(Perfume.aceitaPontos('Outra Marca'), false);
});

// ---------- Carrinho (domínio) ----------

test('carrinho exige variação quando o produto tem; soma a mesma variação; variações diferentes são linhas diferentes', () => {
  const p = criarRepositorioFalso().lista[1];
  const carrinho = new Carrinho();
  assert.throws(() => carrinho.adicionar(p, 1, null), ErroDeValidacao);
  carrinho.adicionar(p, 1, p.variacaoPorId(21));
  carrinho.adicionar(p, 1, p.variacaoPorId(21));
  carrinho.adicionar(p, 1, p.variacaoPorId(23));
  assert.strictEqual(carrinho.itens.length, 2);
  assert.strictEqual(carrinho.itens[0].quantidade, 2);
  assert.strictEqual(carrinho.itens[0].nome, 'Anel - A');
  assert.throws(() => carrinho.adicionar(p, 1, p.variacaoPorId(21)), /só temos 2 em estoque/); // passou do estoque da variação
  assert.strictEqual(carrinho.subtotal(), 320); // 2 x 100 + 1 x 120
  assert.deepStrictEqual(Object.keys(carrinho.paraSessao()), ['2:21', '2:23']);
});

// ---------- CarrinhoService: quantidade ----------

test('adicionar 3 unidades; somar com o que já estava; passar do estoque dá erro claro', async () => {
  const servico = new CarrinhoService(new PerfumeService(criarRepositorioFalso()));
  const sessao = {};
  await servico.adicionar(sessao, 'carrinho', 1, { quantidade: '3' });
  assert.deepStrictEqual(sessao.carrinho, { 1: 3 });
  await servico.adicionar(sessao, 'carrinho', 1, { quantidade: '2' }); // 3 + 2 = 5 (todo o estoque)
  assert.deepStrictEqual(sessao.carrinho, { 1: 5 });
  await assert.rejects(() => servico.adicionar(sessao, 'carrinho', 1, { quantidade: '1' }), /só temos 5 em estoque/);
  assert.deepStrictEqual(sessao.carrinho, { 1: 5 }); // nada mudou no erro
});

test('quantidade 0, negativa, decimal ou texto dá erro; vazia vale 1', async () => {
  const servico = new CarrinhoService(new PerfumeService(criarRepositorioFalso()));
  for (const ruim of ['0', '-1', '1.5', 'abc', '1e3']) {
    await assert.rejects(() => servico.adicionar({}, 'carrinho', 1, { quantidade: ruim }), ErroDeValidacao, `quantidade ${ruim}`);
  }
  const sessao = {};
  await servico.adicionar(sessao, 'carrinho', 1, { quantidade: '' });
  assert.deepStrictEqual(sessao.carrinho, { 1: 1 });
});

test('produto com variações: sem variacaoId é erro; variação esgotada é recusada no servidor', async () => {
  const servico = new CarrinhoService(new PerfumeService(criarRepositorioFalso()));
  await assert.rejects(() => servico.adicionar({}, 'carrinho', 2, {}), /Escolha uma opção/);
  await assert.rejects(() => servico.adicionar({}, 'carrinho', 2, { variacaoId: '22' }), /Estoque insuficiente/); // B: estoque 0
  await assert.rejects(() => servico.adicionar({}, 'carrinho', 2, { variacaoId: '999' }), /Escolha uma opção/);
  const sessao = {};
  await servico.adicionar(sessao, 'carrinho', 2, { variacaoId: '23', quantidade: '3' });
  assert.deepStrictEqual(sessao.carrinho, { '2:23': 3 });
  const carrinho = await servico.carregar(sessao, 'carrinho');
  assert.strictEqual(carrinho.itens[0].nome, 'Anel - C');
  assert.strictEqual(servico.resumir(carrinho, cliente).total, 342); // 3 x 120 - 5%
});

test('POST do carrinho com variacaoId e quantidade (vindos do card) chega ao service; erro volta para a página do produto', async () => {
  const servico = new CarrinhoService(new PerfumeService(criarRepositorioFalso()));
  const ctrl = new CarrinhoController(servico, {});
  const sessao = {};
  const res = { redirect(l) { this.local = l; } };
  await ctrl.adicionar({ session: sessao, body: { perfumeId: '2', variacaoId: '21', quantidade: '2' } }, res);
  assert.strictEqual(res.local, '/carrinho');
  assert.deepStrictEqual(sessao.carrinho, { '2:21': 2 });
  const erro = { redirect(l) { this.local = l; } };
  await ctrl.adicionar({ session: sessao, body: { perfumeId: '2', variacaoId: '22', quantidade: '1' } }, erro); // esgotada
  assert.strictEqual(erro.local, '/produto/2');
  assert.match(sessao.aviso, /Estoque insuficiente/);
});

// ---------- Venda: baixa na variação ----------

test('finalizar venda baixa o estoque da VARIAÇÃO e grava variacao_id', async () => {
  const consultas = [];
  const conexao = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, params) => { consultas.push({ sql, params }); return [{ insertId: 7, affectedRows: 1 }]; }
  };
  const repo = new VendaRepository({ getConnection: async () => conexao });
  const p = criarRepositorioFalso().lista[1];
  const carrinho = new Carrinho();
  carrinho.adicionar(p, 2, p.variacaoPorId(23));
  await repo.registrar(new Venda({ carrinho, cliente, forma: 'pix' }));
  const baixa = consultas.find((c) => /UPDATE variacoes SET estoque/.test(c.sql));
  assert.deepStrictEqual(baixa.params, [2, 23, 2, 2]); // quantidade, id da variação, id do produto, quantidade
  const item = consultas.find((c) => /INSERT INTO venda_itens/.test(c.sql));
  assert.deepStrictEqual(item.params, [7, 2, 23, 2, 120]);
});

test('venda: variação sem estoque no banco desfaz a venda', async () => {
  const conexao = {
    beginTransaction: async () => {}, commit: async () => {}, release: () => {}, rolledBack: false,
    rollback: async () => { conexao.rolledBack = true; },
    query: async (sql) => [{ insertId: 7, affectedRows: /UPDATE variacoes/.test(sql) ? 0 : 1 }]
  };
  const p = criarRepositorioFalso().lista[1];
  const carrinho = new Carrinho();
  carrinho.adicionar(p, 1, p.variacaoPorId(21));
  await assert.rejects(() => new VendaRepository({ getConnection: async () => conexao }).registrar(new Venda({ carrinho, forma: 'pix' })), EstoqueInsuficienteError);
  assert.strictEqual(conexao.rolledBack, true);
});

// ---------- Service: SKU, pontos, variações ----------

test('SKU duplicado dá erro 400 (ErroDeValidacao) ao editar e ao criar', async () => {
  const servico = new GestaoProdutosService(criarRepositorioFalso());
  await assert.rejects(() => servico.atualizar(1, { ...formulario, marca: 'Alfa', sku: '2001' }, vendedor), /SKU/);
  assert.strictEqual(await servico.atualizar(2, { ...formulario, sku: '2001' }, vendedor), true); // o próprio produto mantém o SKU
  const repo = criarRepositorioFalso();
  repo.criar = async () => { const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; e.sqlMessage = "Duplicate entry 'x' for key 'perfumes.sku'"; throw e; };
  await assert.rejects(() => new GestaoProdutosService(repo).criar({ ...formulario, sku: 'x' }, 2), /SKU/);
});

test('pontos: Queen guarda; outra marca ignora o valor enviado; trocar a marca zera', async () => {
  const repo = criarRepositorioFalso();
  const servico = new GestaoProdutosService(repo);
  await servico.atualizar(2, { ...formulario, sku: '2001', pontos: '750' }, vendedor);
  assert.strictEqual(repo.lista[1].pontos, 750);
  await servico.atualizar(1, { ...formulario, marca: 'Outra Marca', pontos: '999' }, vendedor);
  assert.strictEqual(repo.lista[0].pontos, null);
  await servico.atualizar(2, { ...formulario, marca: 'Outra Marca', sku: '2001', pontos: '750' }, vendedor); // saiu de Queen
  assert.strictEqual(repo.lista[1].pontos, null);
  await assert.rejects(() => servico.atualizar(2, { ...formulario, pontos: '-3' }, vendedor), ErroDeValidacao); // Queen: inteiro >= 0
});

test('variações: adicionar/editar/remover sincroniza preço (menor) e estoque (soma) do produto', async () => {
  const repo = criarRepositorioFalso();
  const servico = new GestaoProdutosService(repo);
  await servico.adicionarVariacao(1, { descricao: 'P', preco: '40,50', estoque: '3' }, vendedor);
  assert.strictEqual(repo.lista[0].variacoes.length, 1);
  assert.strictEqual(repo.lista[0].preco, 40.5);
  assert.strictEqual(repo.lista[0].estoque, 3);
  await servico.adicionarVariacao(1, { descricao: 'G', preco: '60', estoque: '2' }, vendedor);
  assert.strictEqual(repo.lista[0].estoque, 5);
  const idG = repo.lista[0].variacoes[1].id;
  await servico.atualizarVariacao(1, idG, { descricao: 'G', preco: '30', estoque: '2', ativo: 'on' }, vendedor);
  assert.strictEqual(repo.lista[0].preco, 30);
  await servico.removerVariacao(1, idG, vendedor);
  assert.strictEqual(repo.lista[0].preco, 40.5);
  await assert.rejects(() => servico.adicionarVariacao(1, { descricao: '', preco: '1', estoque: '1' }, vendedor), ErroDeValidacao);
  await assert.rejects(() => servico.adicionarVariacao(1, { descricao: 'Z', preco: '1', estoque: '-1' }, vendedor), ErroDeValidacao);
  await assert.rejects(() => servico.adicionarVariacao(1, { descricao: 'Z', preco: '1', estoque: '1' }, cliente), ErroDePermissao);
});

test('estoque rápido recusa produto com variações; editar produto com variações não muda preço e estoque', async () => {
  const repo = criarRepositorioFalso();
  const servico = new GestaoProdutosService(repo);
  await assert.rejects(() => servico.atualizarEstoque(2, '9', vendedor), /variações/);
  await servico.atualizar(2, { ...formulario, preco: '1', estoque: '1', sku: '2001' }, vendedor);
  assert.strictEqual(repo.lista[1].preco, 80);
  assert.strictEqual(repo.lista[1].estoque, 6);
});

test('página do produto: oculto só para quem gerencia; vitrine mostra "a partir de" e as variações com desconto', async () => {
  const servico = new VitrineService(criarRepositorioFalso());
  assert.strictEqual(await servico.paginaDoProduto(3, null), null);
  assert.strictEqual(await servico.paginaDoProduto(3, cliente), null);
  assert.strictEqual((await servico.paginaDoProduto(3, vendedor)).id, 3);
  assert.strictEqual(await servico.paginaDoProduto('abc', null), null);
  const pagina = await servico.paginaDoProduto(2, cliente);
  assert.strictEqual(pagina.precoFinal, 76); // 80 - 5%
  assert.strictEqual(pagina.estoque, 6);
  assert.deepStrictEqual(pagina.variacoes.map((v) => [v.descricao, v.precoFinal, v.esgotada]), [['A', 95, false], ['B', 76, true], ['C', 114, false]]);
  assert.strictEqual(pagina.pontos, 500);
  const vitrine = await servico.vitrine({}, null);
  const card = vitrine.cards.find((c) => c.id === 2);
  assert.deepStrictEqual([card.temVariacoes, card.opcoes, card.precoFinal], [true, 3, 80]);
});

// ---------- Abrir venda: esgotada e quantidade acima do estoque são recusadas no servidor ----------

test('Abrir venda: variação esgotada e quantidade acima do estoque são recusadas, com aviso claro, e nada entra na venda', async () => {
  const servico = new CarrinhoService(new PerfumeService(criarRepositorioFalso()));
  const sessao = {};
  const opcoes = { permitirOculto: true };
  // Variação B (id 22) tem estoque 0.
  await assert.rejects(() => servico.adicionar(sessao, 'venda', 2, { ...opcoes, variacaoId: '22' }), /variação esgotada/);
  // Variação A (id 21) tem estoque 2: pedir 3 é recusado e diz quantas existem.
  await assert.rejects(() => servico.adicionar(sessao, 'venda', 2, { ...opcoes, variacaoId: '21', quantidade: '3' }), /só temos 2 em estoque/);
  assert.strictEqual(sessao.venda, undefined); // nada entrou na venda
});
