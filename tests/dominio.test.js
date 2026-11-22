/**
 * tests/dominio.test.js
 * Testes das regras que não precisam de banco: desconto por papel, carrinho,
 * venda e cadeia de buscadores. Rode com: npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const Perfume = require('../domain/Perfume');
const Carrinho = require('../domain/Carrinho');
const { Venda } = require('../domain/Venda');
const { criarUsuario } = require('../domain/Usuario');
const BuscadorEmCadeia = require('../buscadores/BuscadorEmCadeia');

const perfume = new Perfume({ id: 1, nome: 'X', marca: 'Y', preco: 100, estoque: 3 });
const cliente = criarUsuario({ id: 1, usuario: 'c', nome: 'C', papel: 'cliente' });
const vendedor = criarUsuario({ id: 2, usuario: 'v', nome: 'V', papel: 'vendedor' });

test('cliente paga 5% a menos; vendedor e visitante pagam cheio', () => {
  assert.strictEqual(perfume.precoPara(cliente), 95);
  assert.strictEqual(perfume.precoPara(vendedor), 100);
  assert.strictEqual(perfume.precoPara(null), 100);
});

test('carrinho não passa do estoque', () => {
  const c = new Carrinho();
  c.adicionar(perfume, 3);
  assert.throws(() => c.adicionar(perfume, 1), /Estoque insuficiente/);
});

test('venda com cliente aplica 5%, sem cliente é preço cheio', () => {
  const c = new Carrinho();
  c.adicionar(perfume, 2);
  assert.strictEqual(new Venda({ carrinho: c, cliente, forma: 'pix' }).total, 190);
  assert.strictEqual(new Venda({ carrinho: c, cliente: null, forma: 'pix' }).total, 200);
  assert.throws(() => new Venda({ carrinho: c, forma: 'cheque' }), /pagamento/);
});

test('cadeia: usa o segundo buscador e ignora falhas do primeiro', async () => {
  const quebrado = { buscar: async () => { throw new Error('rede'); } };
  const bom = { buscar: async () => ({ nome: 'A', marca: 'B', foto: '' }) };
  assert.deepStrictEqual(await new BuscadorEmCadeia([quebrado, bom]).buscar('1'), { nome: 'A', marca: 'B', foto: '' });
  assert.strictEqual(await new BuscadorEmCadeia([quebrado]).buscar('1'), null);
});
