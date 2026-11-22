/**
 * domain/Desconto.js
 * Estratégias de desconto (padrão Strategy: cada regra de desconto vira uma
 * classe pequena, e quem calcula só chama "aplicar" sem saber qual regra é).
 * Cada papel de usuário escolhe a sua estratégia. Para criar um novo desconto
 * basta criar uma nova classe, sem mexer nas existentes (aberto/fechado - SOLID).
 */

/** Arredonda para 2 casas decimais (centavos). */
function arredondar(valor) {
  // Primeiro em 4 casas (tira o ruido do ponto flutuante, ex.: 9.595 vira 959.5 centavos),
  // depois em centavos inteiros (meio centavo sobe).
  return Math.round(Math.round(valor * 10000) / 100) / 100;
}

/** Classe base: define o contrato "aplicar(valor)". */
class EstrategiaDesconto {
  /** Percentual de desconto (0.05 = 5%). */
  percentual() {
    throw new Error('Implemente percentual() na subclasse.');
  }

  /** Devolve o valor já com desconto. */
  aplicar(valor) {
    return arredondar(valor * (1 - this.percentual()));
  }
}

/** Sem desconto (visitante, vendedor, admin ou venda sem cliente). */
class SemDesconto extends EstrategiaDesconto {
  percentual() { return 0; }
}

/** Desconto do cliente cadastrado: 5% em todo o site. */
class DescontoCliente extends EstrategiaDesconto {
  percentual() { return 0.05; }
}

module.exports = { arredondar, EstrategiaDesconto, SemDesconto, DescontoCliente };
