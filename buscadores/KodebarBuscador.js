/**
 * buscadores/KodebarBuscador.js
 * Busca o produto na API Kodebar (GET /gtin/lookup?gtin=...).
 * O token vem de process.env.KODEBAR_TOKEN e vai no cabeçalho X-API-Key.
 * Documentação: https://kodebar.korvensistemas.com.br/docs
 */
const BuscadorDeProduto = require('./BuscadorDeProduto');

class KodebarBuscador extends BuscadorDeProduto {
  /** @param {string} token chave da API (pode ser vazio: aí o buscador não faz nada) */
  constructor(token = process.env.KODEBAR_TOKEN) {
    super();
    this.token = token;
    this.urlBase = 'https://kodebar.korvensistemas.com.br';
  }

  /** Consulta o Kodebar. Devolve {nome, marca, descricao, foto} ou null se nao achar ou falhar. */
  async buscar(codigo) {
    if (!this.token) return null; // sem token: passa a vez para o próximo buscador
    try {
      const url = `${this.urlBase}/gtin/lookup?gtin=${encodeURIComponent(codigo)}`;
      const resposta = await fetch(url, {
        headers: { 'X-API-Key': this.token },
        signal: AbortSignal.timeout(5000) // não espera mais que 5 segundos
      });
      if (!resposta.ok) return null; // 404 = não achou; 401/429 = token ou limite
      const dados = await resposta.json();
      if (!dados.nome) return null;
      // O Kodebar não tem campo de descrição: ela fica vazia para outro buscador completar.
      return { nome: dados.nome, marca: dados.marca || '', descricao: '', foto: dados.thumbnail || '' };
    } catch (erro) {
      return null; // falha de rede nunca quebra o cadastro
    }
  }
}

module.exports = KodebarBuscador;
