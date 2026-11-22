/**
 * tests/paginacao.test.js
 * Testa (sem rede e sem banco) a paginação da vitrine:
 *  1) a classe Paginacao (páginas, offset, faixa, janela de números, valores inválidos);
 *  2) o VitrineService chamando o repositório com limite e offset certos e montando os links.
 */
const test = require('node:test');
const assert = require('node:assert');
const Paginacao = require('../domain/Paginacao');
const VitrineService = require('../services/VitrineService');

test('Paginacao: total 0 tem 1 página vazia e faixa 0-0', () => {
  const p = new Paginacao(0, 5, 30);
  assert.deepStrictEqual([p.pagina, p.totalPaginas, p.offset, p.inicio, p.fim], [1, 1, 0, 0, 0]);
  assert.strictEqual(p.temAnterior || p.temProxima, false);
  assert.deepStrictEqual(p.janela(), [1]);
});

test('Paginacao: 1 página só (10 produtos)', () => {
  const p = new Paginacao(10);
  assert.deepStrictEqual([p.porPagina, p.totalPaginas, p.inicio, p.fim], [30, 1, 1, 10]);
});

test('Paginacao: página do meio e última página parcial (619 produtos, 30 por página)', () => {
  const meio = new Paginacao(619, 2, 30);
  assert.deepStrictEqual([meio.totalPaginas, meio.offset, meio.inicio, meio.fim], [21, 30, 31, 60]);
  const ultima = new Paginacao(619, 21, 30);
  assert.deepStrictEqual([ultima.offset, ultima.inicio, ultima.fim, ultima.temProxima], [600, 601, 619, false]);
});

test('Paginacao: página fora do limite ou inválida', () => {
  assert.strictEqual(new Paginacao(619, 999, 30).pagina, 21); // maior que o total -> última
  assert.strictEqual(new Paginacao(619, 'abc').pagina, 1);
  assert.strictEqual(new Paginacao(619, '0').pagina, 1);
  assert.strictEqual(new Paginacao(619, '-3').pagina, 1);
  assert.strictEqual(new Paginacao(619, '2.5').pagina, 1);
  assert.strictEqual(new Paginacao(619, ['2', '3']).pagina, 1);
  assert.strictEqual(new Paginacao(619, undefined).pagina, 1);
});

test('Paginacao: porPagina só aceita 30, 50 e 100', () => {
  assert.strictEqual(new Paginacao(619, 1, '50').porPagina, 50);
  assert.strictEqual(new Paginacao(619, 1, 100).porPagina, 100);
  for (const ruim of ['7', '0', '-50', 'abc', '', undefined, ['30', '50'], '1000']) {
    assert.strictEqual(new Paginacao(619, 1, ruim).porPagina, 30);
  }
});

test('Paginacao.janela: reticências só onde há buraco', () => {
  assert.deepStrictEqual(new Paginacao(619, 6, 30).janela(), [1, null, 4, 5, 6, 7, 8, null, 21]);
  assert.deepStrictEqual(new Paginacao(619, 1, 30).janela(), [1, 2, 3, null, 21]);
  assert.deepStrictEqual(new Paginacao(619, 21, 30).janela(), [1, null, 19, 20, 21]);
  assert.deepStrictEqual(new Paginacao(619, 4, 30).janela(), [1, 2, 3, 4, 5, 6, null, 21]); // buraco de 1 mostra o número
  assert.deepStrictEqual(new Paginacao(90, 2, 30).janela(), [1, 2, 3]);
});

test('VitrineService.vitrine: conta e lista com os mesmos filtros, limite e offset da página', async () => {
  const chamadas = {};
  const repo = {
    contar: async (busca, filtros) => { chamadas.contar = [busca, filtros]; return 619; },
    listar: async (busca, filtros) => { chamadas.listar = [busca, filtros]; return []; },
    listarMarcas: async () => []
  };
  const r = await new VitrineService(repo).vitrine(
    { busca: ' rosa ', marca: 'Alfa', ordem: 'maior-preco', pagina: '3', porPagina: '50' }, null);
  assert.deepStrictEqual(chamadas.contar, ['rosa', { marca: 'Alfa', apenasVisiveis: true }]);
  assert.strictEqual(chamadas.listar[0], 'rosa');
  assert.deepStrictEqual(chamadas.listar[1],
    { marca: 'Alfa', apenasVisiveis: true, ordem: 'maior-preco', limite: 50, offset: 100 });
  // Links guardam busca, marca, ordem e porPagina (e o número da página).
  assert.strictEqual(r.links.anterior, '/?q=rosa&marca=Alfa&ordem=maior-preco&porPagina=50&pagina=2');
  assert.strictEqual(r.links.proxima, '/?q=rosa&marca=Alfa&ordem=maior-preco&porPagina=50&pagina=4');
  assert.strictEqual(r.links.paginas.find((x) => x && x.atual).numero, 3);
});

test('VitrineService.vitrine: valores inválidos usam 30 por página, página 1 e links curtos', async () => {
  let usado;
  const repo = {
    contar: async () => 100,
    listar: async (busca, filtros) => { usado = filtros; return []; },
    listarMarcas: async () => []
  };
  const r = await new VitrineService(repo).vitrine({ pagina: 'x', porPagina: '9999' }, null);
  assert.deepStrictEqual([usado.limite, usado.offset], [30, 0]);
  assert.strictEqual(r.links.anterior, null);
  assert.strictEqual(r.links.proxima, '/?pagina=2');
});
