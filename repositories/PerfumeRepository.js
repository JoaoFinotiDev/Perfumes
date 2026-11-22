/**
 * repositories/PerfumeRepository.js
 * Único lugar que fala SQL sobre a tabela "perfumes".
 * A conexão (db) é injetada no construtor.
 */
const Perfume = require('../domain/Perfume');

class PerfumeRepository {
  /** @param {object} db pool do mysql2 */
  constructor(db) {
    this.db = db;
  }

  /** Lista perfumes. Com `busca`, filtra por nome ou marca. */
  async listar(busca = '') {
    let sql = 'SELECT * FROM perfumes';
    const params = [];
    if (busca) {
      sql += ' WHERE nome LIKE ? OR marca LIKE ?';
      const termo = `%${busca}%`;
      params.push(termo, termo);
    }
    const [linhas] = await this.db.query(sql + ' ORDER BY nome', params);
    return linhas.map((l) => new Perfume(l));
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
