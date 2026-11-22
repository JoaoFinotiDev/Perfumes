/**
 * services/VendaService.js
 * Finaliza vendas: monta a Venda (com desconto) e manda gravar.
 * O pagamento é SIMULADO: só registramos a forma escolhida.
 */
const { Venda, FORMAS_DE_PAGAMENTO } = require('../domain/Venda');
const { arredondar } = require('../domain/Desconto');
const { ErroDeValidacao, EstoqueInsuficienteError } = require('../utils/erros');

class VendaService {
  /** @param {VendaRepository} vendas */
  constructor(vendas) {
    this.vendas = vendas;
  }

  /**
   * @param {object} dados
   * @param {Carrinho} dados.carrinho
   * @param {Usuario|null} dados.cliente null = sem cliente (preço cheio)
   * @param {Usuario|null} dados.vendedor null = compra pelo site
   * @param {string} dados.forma credito | debito | pix | dinheiro
   * @returns {Promise<Venda>} venda gravada (com id)
   */
  async finalizar(dados) {
    const venda = new Venda(dados); // valida carrinho e forma, calcula totais
    try {
      venda.id = await this.vendas.registrar(venda);
    } catch (erro) {
      // Estoque acabou entre a tela e a gravação: vira mensagem amigável para o usuário.
      if (erro instanceof EstoqueInsuficienteError) throw new ErroDeValidacao(erro.message);
      throw erro;
    }
    return venda;
  }

  /**
   * Dados prontos do comprovante de uma compra (a view só mostra).
   * SÓ o dono vê: se a compra não existe OU é de outra pessoa, devolve null (o controller responde 404,
   * sem contar que a compra existe). Assim ninguém vê a compra de outro trocando o número no endereço.
   * @param {*} id número da compra (vem da URL, não confiável)
   * @param {Usuario} usuario quem está pedindo
   * @returns {Promise<object|null>}
   */
  async comprovante(id, usuario) {
    const numero = Number(id);
    if (!usuario || !Number.isInteger(numero) || numero <= 0) return null;
    const achada = await this.vendas.buscarComItens(numero);
    if (!achada || achada.venda.cliente_id !== usuario.id) return null;
    const { venda, itens } = achada;
    return {
      id: venda.id,
      data: new Date(venda.criado_em),
      forma: FORMAS_DE_PAGAMENTO[venda.forma_pagamento] || venda.forma_pagamento,
      // Cada linha já com o subtotal (preço gravado na venda x quantidade).
      linhas: itens.map((i) => ({
        nome: i.variacao ? `${i.nome} - ${i.variacao}` : i.nome,
        marca: i.marca,
        quantidade: i.quantidade,
        unitario: Number(i.preco_unitario),
        subtotal: arredondar(Number(i.preco_unitario) * i.quantidade)
      })),
      subtotal: Number(venda.subtotal),
      desconto: Number(venda.desconto),
      total: Number(venda.total)
    };
  }
}

module.exports = VendaService;
