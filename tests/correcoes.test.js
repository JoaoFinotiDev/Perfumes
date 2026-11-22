/**
 * tests/correcoes.test.js
 * Testes das correcoes da revisao: arredondamento do preco, SESSION_SECRET e ordem da baixa de estoque.
 * Sem rede e sem banco.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v = require('../utils/validacao');
const { resolverSegredo, SEGREDO_DE_EXEMPLO } = require('../config/segredo');
const Perfume = require('../domain/Perfume');
const Carrinho = require('../domain/Carrinho');
const { Venda } = require('../domain/Venda');
const VendaRepository = require('../repositories/VendaRepository');

test('preco 1,005 arredonda para 1,01 (Math.round(n * 100) / 100 dava 1)', () => {
  assert.strictEqual(v.preco('1,005', 'Preço'), 1.01);
  assert.strictEqual(v.preco('12,5', 'Preço'), 12.5);
  assert.strictEqual(v.preco('0.994', 'Preço'), 0.99);
});

test('SESSION_SECRET: em producao vazio ou de exemplo falha; em desenvolvimento so avisa', () => {
  const avisos = [];
  const avisar = (m) => avisos.push(m);
  assert.throws(() => resolverSegredo({ NODE_ENV: 'production' }, avisar), /SESSION_SECRET/);
  assert.throws(() => resolverSegredo({ NODE_ENV: 'production', SESSION_SECRET: SEGREDO_DE_EXEMPLO }, avisar), /SESSION_SECRET/);
  assert.strictEqual(resolverSegredo({ NODE_ENV: 'production', SESSION_SECRET: 'um-segredo-de-verdade' }, avisar), 'um-segredo-de-verdade');
  assert.strictEqual(avisos.length, 0);

  assert.strictEqual(resolverSegredo({ SESSION_SECRET: SEGREDO_DE_EXEMPLO }, avisar), SEGREDO_DE_EXEMPLO); // dev: avisa e segue
  assert.strictEqual(avisos.length, 1);
  // dev vazio: segredo fixo guardado em arquivo (aqui um arquivo temporario, para nao mexer no .segredo-dev real)
  const arquivo = path.join(os.tmpdir(), `segredo-dev-${process.pid}-${Date.now()}`);
  try {
    assert.ok(resolverSegredo({}, avisar, arquivo).length >= 32);
    assert.strictEqual(avisos.length, 3); // aviso do .env vazio + aviso de arquivo criado
  } finally { fs.rmSync(arquivo, { force: true }); }
});

test('a venda baixa o estoque na ordem do id (produto e depois variacao), seja qual for a ordem do carrinho', async () => {
  const baixas = [];
  const conexao = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, params) => {
      if (/UPDATE variacoes SET estoque/.test(sql)) baixas.push(`variacao ${params[1]}`);
      else if (/UPDATE perfumes SET estoque/.test(sql)) baixas.push(`produto ${params[1]}`);
      return [{ insertId: 1, affectedRows: 1 }];
    }
  };
  const p9 = new Perfume({ id: 9, nome: 'Nove', marca: 'M', preco: 10, estoque: 5 });
  const p2 = new Perfume({
    id: 2, nome: 'Dois', marca: 'M', preco: 10, estoque: 9,
    variacoes: [{ id: 30, perfume_id: 2, descricao: 'A', preco: 10, estoque: 4 }, { id: 20, perfume_id: 2, descricao: 'B', preco: 10, estoque: 5 }]
  });
  const carrinho = new Carrinho();
  carrinho.adicionar(p9, 1); // entra primeiro, mas tem o maior id
  carrinho.adicionar(p2, 1, p2.variacaoPorId(30));
  carrinho.adicionar(p2, 1, p2.variacaoPorId(20));
  await new VendaRepository({ getConnection: async () => conexao }).registrar(new Venda({ carrinho, forma: 'pix' }));
  assert.deepStrictEqual(baixas, ['variacao 20', 'produto 2', 'variacao 30', 'produto 2', 'produto 9']);
});
