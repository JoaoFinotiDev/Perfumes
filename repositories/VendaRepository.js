/**
 * repositories/VendaRepository.js
 * Grava vendas. Transação = um pacote "tudo ou nada" do banco.
 * Tudo acontece em UMA transação: ou grava a venda inteira
 * e baixa o estoque, ou não grava nada.
 */
const { EstoqueInsuficienteError } = require('../utils/erros');

class VendaRepository {
  /** @param {object} db pool do mysql2 */
  constructor(db) {
    this.db = db;
  }

  /**
   * Grava a venda, os itens e baixa o estoque.
   * @param {Venda} venda objeto de domínio já calculado
   * @returns {Promise<number>} id da venda criada
   */
  async registrar(venda) {
    const conexao = await this.db.getConnection();
    try {
      await conexao.beginTransaction();
      const [r] = await conexao.query(
        `INSERT INTO vendas (cliente_id, vendedor_id, forma_pagamento, subtotal, desconto, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [venda.cliente ? venda.cliente.id : null, venda.vendedor ? venda.vendedor.id : null,
         venda.forma, venda.subtotal, venda.desconto, venda.total]);

      // DEADLOCK: duas vendas ao mesmo tempo travam as linhas de estoque que baixam. Se uma travar o produto 1
      // e depois o 2, e a outra travar o 2 e depois o 1, as duas ficam esperando uma pela outra (impasse) e o
      // banco derruba uma delas. Para evitar, TODAS as vendas baixam o estoque na MESMA ordem: pelo id do
      // produto e, no mesmo produto, pelo id da variacao. Assim uma venda sempre espera a outra, nunca se cruzam.
      const itensEmOrdem = [...venda.itens].sort((a, b) =>
        (a.perfume.id - b.perfume.id) || ((a.variacao ? a.variacao.id : 0) - (b.variacao ? b.variacao.id : 0)));
      for (const item of itensEmOrdem) {
        const { perfume, variacao, quantidade } = item;
        // Só baixa se ainda houver estoque (evita estoque negativo em compras ao mesmo tempo).
        // Item com variação: a baixa é na VARIAÇÃO; o estoque do produto (a soma) cai junto, para ficar sincronizado.
        if (variacao) {
          const [baixaVar] = await conexao.query(
            'UPDATE variacoes SET estoque = estoque - ? WHERE id = ? AND perfume_id = ? AND estoque >= ?',
            [quantidade, variacao.id, perfume.id, quantidade]);
          if (baixaVar.affectedRows === 0) throw new EstoqueInsuficienteError(item.nome);
        }
        const [baixa] = await conexao.query(
          'UPDATE perfumes SET estoque = estoque - ? WHERE id = ? AND estoque >= ?',
          [quantidade, perfume.id, quantidade]);
        if (baixa.affectedRows === 0) {
          throw new EstoqueInsuficienteError(item.nome); // o service converte para erro de validacao
        }
        await conexao.query(
          'INSERT INTO venda_itens (venda_id, perfume_id, variacao_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?, ?)',
          [r.insertId, perfume.id, variacao ? variacao.id : null, quantidade, item.preco]);
      }
      await conexao.commit();
      return r.insertId;
    } catch (erro) {
      await conexao.rollback(); // desfaz tudo se algo falhar
      throw erro;
    } finally {
      conexao.release();
    }
  }
}

module.exports = VendaRepository;
