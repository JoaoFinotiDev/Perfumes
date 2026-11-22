/**
 * repositories/PerfumeRepository.js
 * Único lugar que fala SQL sobre a tabela "perfumes".
 * A conexão (db) é injetada no construtor.
 */
const Perfume = require('../domain/Perfume');

// Ordenações permitidas: chave que vem da URL -> trecho fixo de SQL (lista fechada contra SQL injection).
const ORDENACOES = {
  nome: 'nome',
  'menor-preco': 'preco ASC, nome',
  'maior-preco': 'preco DESC, nome'
};

class PerfumeRepository {
  /** @param {object} db pool do mysql2 */
  constructor(db) {
    this.db = db;
  }

  /**
   * Lista perfumes. Com `busca`, filtra por nome ou marca.
   * Opcional: `marca` (igual exata), `ordem` (chave de ORDENACOES; qualquer outra vira "nome")
   * e `apenasVisiveis` (true = esconde os produtos que o Vendedor ocultou da vitrine).
   * `limite` (inteiro positivo) corta o número de linhas; 0 = sem limite (usado pela lista suspensa de busca).
   */
  async listar(busca = '', { marca = '', ordem = 'nome', apenasVisiveis = false, limite = 0 } = {}) {
    const filtros = [];
    const params = [];
    if (apenasVisiveis) filtros.push('visivel = 1'); // texto fixo, sem dado do usuário
    if (busca) {
      // Os "?" são preenchidos pelo driver, o que impede SQL injection (texto malicioso virar comando).
      filtros.push('(nome LIKE ? OR marca LIKE ?)');
      const termo = `%${busca}%`;
      params.push(termo, termo);
    }
    if (marca) {
      filtros.push('marca = ?');
      params.push(marca);
    }
    const where = filtros.length ? ` WHERE ${filtros.join(' AND ')}` : '';
    // O ORDER BY não aceita "?", então só entra texto da lista fixa acima (nunca o que veio da URL).
    const orderBy = Object.prototype.hasOwnProperty.call(ORDENACOES, ordem) ? ORDENACOES[ordem] : ORDENACOES.nome;
    let sql = `SELECT * FROM perfumes${where} ORDER BY ${orderBy}`;
    if (Number.isInteger(limite) && limite > 0) {
      sql += ' LIMIT ?'; // o limite também vai como parâmetro, nunca concatenado
      params.push(limite);
    }
    const [linhas] = await this.db.query(sql, params);
    return linhas.map((l) => new Perfume(l));
  }

  /** Marcas diferentes que existem no banco, em ordem alfabética (para o filtro da vitrine). */
  async listarMarcas({ apenasVisiveis = false } = {}) {
    const where = apenasVisiveis ? ' WHERE visivel = 1' : '';
    const [linhas] = await this.db.query(`SELECT DISTINCT marca FROM perfumes${where} ORDER BY marca`);
    return linhas.map((l) => l.marca);
  }

  /** Busca por id (ou null). */
  async buscarPorId(id) {
    const [linhas] = await this.db.query('SELECT * FROM perfumes WHERE id = ?', [id]);
    return linhas[0] ? new Perfume(linhas[0]) : null;
  }

  /** Busca pelo código de barras, SOMENTE no banco local (ou null). */
  async buscarPorCodigo(codigo) {
    const [linhas] = await this.db.query('SELECT * FROM perfumes WHERE codigo_barras = ?', [codigo]);
    return linhas[0] ? new Perfume(linhas[0]) : null;
  }

  /** Atualiza todos os campos editáveis de um produto (o dono, vendedor_id, não muda). */
  async atualizar(id, d) {
    await this.db.query(
      `UPDATE perfumes SET nome = ?, marca = ?, preco = ?, estoque = ?, descricao = ?,
         codigo_barras = ?, foto_url = ?, visivel = ? WHERE id = ?`,
      [d.nome, d.marca, d.preco, d.estoque, d.descricao, d.codigoBarras, d.fotoUrl, d.visivel ? 1 : 0, id]);
  }

  /** Troca só a coluna estoque de um produto (UPDATE parametrizado; nenhum outro campo é tocado). */
  async atualizarEstoque(id, estoque) {
    await this.db.query('UPDATE perfumes SET estoque = ? WHERE id = ?', [estoque, id]);
  }

  /** Troca só a descrição de um produto (usado para corrigir textos importados). */
  async atualizarDescricao(id, descricao) {
    await this.db.query('UPDATE perfumes SET descricao = ? WHERE id = ?', [descricao, id]);
  }

  /** Mostra (true) ou oculta (false) o produto na vitrine. */
  async definirVisivel(id, visivel) {
    await this.db.query('UPDATE perfumes SET visivel = ? WHERE id = ?', [visivel ? 1 : 0, id]);
  }

  /** Busca pelo par nome + marca (ou null). Usado pela importacao para nao duplicar produtos. */
  async buscarPorNomeEMarca(nome, marca) {
    const [linhas] = await this.db.query('SELECT * FROM perfumes WHERE nome = ? AND marca = ? LIMIT 1', [nome, marca]);
    return linhas[0] ? new Perfume(linhas[0]) : null;
  }

  /** Grava um perfume novo e devolve o id criado. */
  async criar(d) {
    const [r] = await this.db.query(
      `INSERT INTO perfumes (nome, marca, preco, estoque, descricao, codigo_barras, foto_url, vendedor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.nome, d.marca, d.preco, d.estoque, d.descricao, d.codigoBarras, d.fotoUrl, d.vendedorId]);
    return r.insertId;
  }
}

module.exports = PerfumeRepository;
