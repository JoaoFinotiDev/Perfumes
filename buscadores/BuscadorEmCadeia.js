/**
 * buscadores/BuscadorEmCadeia.js
 * Tenta vários buscadores na ordem e junta as respostas.
 * O primeiro que achar define os campos. Os próximos só preenchem
 * os campos que ficaram vazios (ex.: o Kodebar acha o nome, mas não a marca).
 * Também é um BuscadorDeProduto, então quem usa não sabe que existe uma cadeia.
 */
const BuscadorDeProduto = require('./BuscadorDeProduto');

// Campos que a cadeia tenta deixar preenchidos.
const CAMPOS = ['nome', 'marca', 'descricao', 'foto'];

class BuscadorEmCadeia extends BuscadorDeProduto {
  /** @param {BuscadorDeProduto[]} buscadores em ordem de tentativa */
  constructor(buscadores) {
    super();
    this.buscadores = buscadores;
  }

  /**
   * Pergunta a cada buscador, na ordem, e junta o que cada um achou.
   * Devolve o produto, ou null quando TODOS responderam "não achei".
   * Se ninguém achou e algum buscador FALHOU (rede, limite), lança erro: "falhou" não é "não existe",
   * e assim o BuscadorComCache não guarda a falha (a próxima tentativa pergunta de novo).
   */
  async buscar(codigo) {
    let resultado = null;
    let ultimaFalha = null;
    for (const buscador of this.buscadores) {
      try {
        const achado = await buscador.buscar(codigo);
        if (achado) resultado = this.completar(resultado, achado);
      } catch (erro) {
        ultimaFalha = erro; // um buscador com defeito não impede o próximo de tentar
      }
      if (resultado && this.estaCompleto(resultado)) break; // nada mais a buscar
    }
    if (!resultado && ultimaFalha) throw ultimaFalha;
    return resultado; // null: ninguém achou, o formulário fica para digitar
  }

  /** Mantém o que já existe e só preenche os campos vazios com o novo achado. */
  completar(atual, novo) {
    const base = atual || {};
    const junto = {};
    // Todo campo sai na resposta, mesmo vazio (''), para o formato ser sempre igual.
    for (const campo of CAMPOS) {
      junto[campo] = base[campo] || novo[campo] || '';
    }
    return junto;
  }

  /** Verdadeiro quando todos os campos já têm valor. */
  estaCompleto(produto) {
    return CAMPOS.every((campo) => Boolean(produto[campo]));
  }
}

module.exports = BuscadorEmCadeia;
