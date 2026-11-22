/**
 * services/VendaService.js
 * Finaliza vendas: monta a Venda (com desconto) e manda gravar.
 * O pagamento é SIMULADO: só registramos a forma escolhida.
 */
const { Venda } = require('../domain/Venda');
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
}

module.exports = VendaService;
