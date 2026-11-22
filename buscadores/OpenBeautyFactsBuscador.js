/**
 * buscadores/OpenBeautyFactsBuscador.js
 * Busca o produto no Open Beauty Facts (base aberta, sem chave de API).
 * Endpoint: https://world.openbeautyfacts.org/api/v2/product/<codigo>.json
 */
const BuscadorDeProduto = require('./BuscadorDeProduto');

class OpenBeautyFactsBuscador extends BuscadorDeProduto {
  /** Consulta o Open Beauty Facts. Devolve {nome, marca, descricao, foto} ou null se nao achar ou falhar. */
  async buscar(codigo) {
    try {
      const url = `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(codigo)}.json`;
      const resposta = await fetch(url, {
        headers: { 'User-Agent': 'LojaPerfumes/1.0 (trabalho academico)' },
        signal: AbortSignal.timeout(5000)
      });
      if (resposta.status === 404) return null; // não achou
      if (!resposta.ok) throw new Error(`Open Beauty Facts respondeu ${resposta.status}`); // falha: não vai para o cache
      const dados = await resposta.json();
      const produto = dados.product;
      if (dados.status !== 1 || !produto || !produto.product_name) return null;
      return {
        nome: produto.product_name,
        // "brands" vem separado por vírgula; fica só a primeira marca.
        marca: (produto.brands || '').split(',')[0].trim(),
        // Descrição curta: prefere a versão em português, se existir.
        descricao: produto.generic_name_pt || produto.generic_name || '',
        foto: produto.image_front_url || produto.image_url || ''
      };
    } catch (erro) {
      // Falha de rede ou tempo esgotado: lança (a cadeia segura e o cache não guarda a falha).
      throw new Error(`Open Beauty Facts indisponível: ${erro.message}`);
    }
  }
}

module.exports = OpenBeautyFactsBuscador;
