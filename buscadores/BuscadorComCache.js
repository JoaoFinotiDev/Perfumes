/**
 * buscadores/BuscadorComCache.js
 * Guarda na memória o resultado de cada código já buscado.
 * Assim, buscar o mesmo código de novo não gasta a cota diária das APIs.
 * Também é um BuscadorDeProduto (padrão Decorator): envolve outro buscador
 * sem mudar o código dele (princípio aberto/fechado).
 * O cache some quando o servidor reinicia. Para o escopo do trabalho, basta.
 */
const BuscadorDeProduto = require('./BuscadorDeProduto');

const UM_DIA_MS = 24 * 60 * 60 * 1000;

class BuscadorComCache extends BuscadorDeProduto {
  /**
   * @param {BuscadorDeProduto} buscador o buscador de verdade (ex.: a cadeia)
   * @param {number} validadeMs por quanto tempo um resultado vale
   */
  constructor(buscador, validadeMs = UM_DIA_MS) {
    super();
    this.buscador = buscador;
    this.validadeMs = validadeMs;
    this.cache = new Map(); // código -> { valor, expiraEm }
    this.emAndamento = new Map(); // código -> Promise (evita duas chamadas ao mesmo tempo)
  }

  /**
   * Devolve o resultado guardado (se ainda vale) ou busca de verdade e guarda.
   * Ideia: a mesma pergunta não vai duas vezes para a API.
   */
  async buscar(codigo) {
    const guardado = this.cache.get(codigo);
    if (guardado && guardado.expiraEm > Date.now()) return guardado.valor;

    // Se o mesmo código já está sendo buscado agora, espera essa mesma busca.
    if (this.emAndamento.has(codigo)) return this.emAndamento.get(codigo);

    const busca = this.buscador.buscar(codigo)
      .then((valor) => {
        // "Não achou" (null) também é guardado: evita gastar cota com o mesmo código.
        // Já uma FALHA (erro lançado) não chega aqui: a promise rejeita, nada é guardado e a próxima busca tenta de novo.
        this.cache.set(codigo, { valor, expiraEm: Date.now() + this.validadeMs });
        return valor;
      })
      .finally(() => this.emAndamento.delete(codigo));

    this.emAndamento.set(codigo, busca);
    return busca;
  }
}

module.exports = BuscadorComCache;
