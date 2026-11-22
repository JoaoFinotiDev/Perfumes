/**
 * repositories/UsuarioRepository.js
 * Único lugar que fala SQL sobre a tabela "usuarios".
 * A conexão (db) é injetada no construtor.
 */
const { criarUsuario } = require('../domain/Usuario');

class UsuarioRepository {
  /** @param {object} db pool do mysql2 */
  constructor(db) {
    this.db = db;
  }

  /** Linha crua (com senha_hash) para o login. Devolve undefined se não existir. */
  async buscarLinhaPorUsuario(usuario) {
    const [linhas] = await this.db.query('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
    return linhas[0];
  }

  /** Busca por id e devolve o objeto de domínio (ou null). */
  async buscarPorId(id) {
    const [linhas] = await this.db.query(
      'SELECT id, usuario, nome, papel FROM usuarios WHERE id = ?', [id]);
    return linhas[0] ? criarUsuario(linhas[0]) : null;
  }

  /** Lista os usuários de um papel (ex.: todos os clientes). */
  async listarPorPapel(papel) {
    const [linhas] = await this.db.query(
      'SELECT id, usuario, nome, papel FROM usuarios WHERE papel = ? ORDER BY nome', [papel]);
    return linhas.map(criarUsuario);
  }

  /** Grava um usuário novo e devolve o id criado. */
  async criar({ usuario, nome, senhaHash, papel }) {
    const [r] = await this.db.query(
      'INSERT INTO usuarios (usuario, nome, senha_hash, papel) VALUES (?, ?, ?, ?)',
      [usuario, nome, senhaHash, papel]);
    return r.insertId;
  }
}

module.exports = UsuarioRepository;
