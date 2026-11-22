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
   * Monta o WHERE (e seus parâmetros) a partir dos filtros. É usado por listar() E por contar(),
   * para a contagem da paginação e a lista olharem exatamente os mesmos produtos.
   */
  _filtrar(busca, { marca = '', apenasVisiveis = false } = {}) {
    const filtros = [];
    const params = [];
    if (apenasVisiveis) filtros.push('visivel = 1'); // texto fixo, sem dado do usuário
    if (busca) {
      // Os "?" são preenchidos pelo driver, o que impede SQL injection (texto malicioso virar comando).
      filtros.push('(nome LIKE ? OR marca LIKE ? OR sku LIKE ?)'); // também acha pelo SKU
      const termo = `%${busca}%`;
      params.push(termo, termo, termo);
    }
    if (marca) {
      filtros.push('marca = ?');
      params.push(marca);
    }
    return { where: filtros.length ? ` WHERE ${filtros.join(' AND ')}` : '', params };
  }

  /**
   * Lista perfumes. Com `busca`, filtra por nome, marca ou SKU.
   * Opcional: `marca` (igual exata), `ordem` (chave de ORDENACOES; qualquer outra vira "nome")
   * e `apenasVisiveis` (true = esconde os produtos que o Vendedor ocultou da vitrine).
   * `limite` (inteiro positivo) corta o número de linhas; 0 = sem limite.
   * `offset` (inteiro positivo) pula linhas antes de começar: junto com o limite faz a paginação no banco.
   */
  async listar(busca = '', { marca = '', ordem = 'nome', apenasVisiveis = false, limite = 0, offset = 0 } = {}) {
    const { where, params } = this._filtrar(busca, { marca, apenasVisiveis });
    // O ORDER BY não aceita "?", então só entra texto da lista fixa acima (nunca o que veio da URL).
    const orderBy = Object.prototype.hasOwnProperty.call(ORDENACOES, ordem) ? ORDENACOES[ordem] : ORDENACOES.nome;
    let sql = `SELECT * FROM perfumes${where} ORDER BY ${orderBy}`;
    if (Number.isInteger(limite) && limite > 0) {
      sql += ' LIMIT ?'; // o limite também vai como parâmetro, nunca concatenado
      params.push(limite);
      if (Number.isInteger(offset) && offset > 0) {
        sql += ' OFFSET ?'; // OFFSET só existe junto com LIMIT
        params.push(offset);
      }
    }
    const [linhas] = await this.db.query(sql, params);
    return this._montar(linhas);
  }

  /** Quantos perfumes passam pelos mesmos filtros de listar() (o total da paginação). */
  async contar(busca = '', { marca = '', apenasVisiveis = false } = {}) {
    const { where, params } = this._filtrar(busca, { marca, apenasVisiveis });
    const [linhas] = await this.db.query(`SELECT COUNT(*) AS total FROM perfumes${where}`, params);
    return Number(linhas[0].total);
  }

  /**
   * Transforma linhas da tabela perfumes em objetos Perfume JÁ com as suas variações
   * (uma única consulta extra para todas as linhas, em vez de uma por produto).
   */
  async _montar(linhas) {
    if (!linhas.length) return [];
    const [vars] = await this.db.query(
      'SELECT * FROM variacoes WHERE perfume_id IN (?) ORDER BY ordem, id', [linhas.map((l) => l.id)]);
    return linhas.map((l) => new Perfume({ ...l, variacoes: vars.filter((v) => v.perfume_id === l.id) }));
  }

  /** Igual a _montar, para uma linha só (ou nenhuma: devolve null). */
  async _montarUm(linhas) {
    return linhas[0] ? (await this._montar([linhas[0]]))[0] : null;
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
    return this._montarUm(linhas);
  }

  /** Busca pelo código de barras, SOMENTE no banco local (ou null). */
  async buscarPorCodigo(codigo) {
    const [linhas] = await this.db.query('SELECT * FROM perfumes WHERE codigo_barras = ?', [codigo]);
    return this._montarUm(linhas);
  }

  /** Atualiza todos os campos editáveis de um produto (o dono, vendedor_id, não muda). */
  async atualizar(id, d) {
    await this.db.query(
      `UPDATE perfumes SET nome = ?, marca = ?, preco = ?, estoque = ?, descricao = ?,
         codigo_barras = ?, foto_url = ?, visivel = ?, sku = ?, pontos = ? WHERE id = ?`,
      [d.nome, d.marca, d.preco, d.estoque, d.descricao, d.codigoBarras, d.fotoUrl, d.visivel ? 1 : 0,
       d.sku || null, d.pontos === undefined ? null : d.pontos, id]);
  }

  /** Busca pelo SKU (código interno único), ou null. Usado para não duplicar produtos importados. */
  async buscarPorSku(sku) {
    const [linhas] = await this.db.query('SELECT * FROM perfumes WHERE sku = ?', [sku]);
    return this._montarUm(linhas);
  }

  /** Grava uma variação nova (no fim da ordem) e devolve o id criado. */
  async criarVariacao(perfumeId, d) {
    const [r] = await this.db.query(
      `INSERT INTO variacoes (perfume_id, descricao, preco, estoque, ativo, ordem)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(o.ordem), -1) + 1 FROM variacoes o WHERE o.perfume_id = ?)))`,
      [perfumeId, d.descricao, d.preco, d.estoque, d.ativo === false ? 0 : 1, d.ordem === undefined ? null : d.ordem, perfumeId]);
    return r.insertId;
  }

  /** Atualiza descrição, preço, estoque e "ativa" de uma variação (do produto informado). */
  async atualizarVariacao(perfumeId, variacaoId, d) {
    const [r] = await this.db.query(
      'UPDATE variacoes SET descricao = ?, preco = ?, estoque = ?, ativo = ? WHERE id = ? AND perfume_id = ?',
      [d.descricao, d.preco, d.estoque, d.ativo ? 1 : 0, variacaoId, perfumeId]);
    return r.affectedRows > 0;
  }

  /** Troca SÓ o estoque de uma variação (do produto informado). UPDATE parametrizado; nenhuma outra coluna muda. */
  async atualizarEstoqueVariacao(perfumeId, variacaoId, estoque) {
    const [r] = await this.db.query(
      'UPDATE variacoes SET estoque = ? WHERE id = ? AND perfume_id = ?', [estoque, variacaoId, perfumeId]);
    return r.affectedRows > 0;
  }

  /** Liga (true) ou desliga (false) uma variação. Só a coluna "ativo" muda. */
  async definirVariacaoAtiva(perfumeId, variacaoId, ativo) {
    const [r] = await this.db.query(
      'UPDATE variacoes SET ativo = ? WHERE id = ? AND perfume_id = ?', [ativo ? 1 : 0, variacaoId, perfumeId]);
    return r.affectedRows > 0;
  }

  /** Apaga uma variação (os itens de venda antigos ficam com variacao_id NULL, pela chave estrangeira). */
  async removerVariacao(perfumeId, variacaoId) {
    const [r] = await this.db.query('DELETE FROM variacoes WHERE id = ? AND perfume_id = ?', [variacaoId, perfumeId]);
    return r.affectedRows > 0;
  }

  /**
   * Mantém perfumes.preco = MENOR preço e perfumes.estoque = SOMA das variações ATIVAS.
   * Assim a tabela /itens e a busca continuam simples. Sem variação ativa, não mexe no produto.
   */
  async sincronizarComVariacoes(perfumeId) {
    await this.db.query(
      `UPDATE perfumes p
         JOIN (SELECT perfume_id, MIN(preco) AS preco, SUM(estoque) AS estoque
                 FROM variacoes WHERE perfume_id = ? AND ativo = 1 GROUP BY perfume_id) v
           ON v.perfume_id = p.id
          SET p.preco = v.preco, p.estoque = v.estoque`, [perfumeId]);
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

  /** Busca pelo par nome + marca (ou null). Usado pela importação para não duplicar produtos. */
  async buscarPorNomeEMarca(nome, marca) {
    const [linhas] = await this.db.query('SELECT * FROM perfumes WHERE nome = ? AND marca = ? LIMIT 1', [nome, marca]);
    return this._montarUm(linhas);
  }

  /** Grava um perfume novo e devolve o id criado. */
  async criar(d) {
    const [r] = await this.db.query(
      `INSERT INTO perfumes (nome, marca, preco, estoque, descricao, codigo_barras, foto_url, vendedor_id, sku, pontos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.nome, d.marca, d.preco, d.estoque, d.descricao, d.codigoBarras, d.fotoUrl, d.vendedorId,
       d.sku || null, d.pontos === undefined ? null : d.pontos]);
    return r.insertId;
  }
}

module.exports = PerfumeRepository;
