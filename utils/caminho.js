/**
 * utils/caminho.js
 * "Voltar para onde a pessoa estava" depois do login, SEM abrir brecha de redirecionamento aberto.
 * Redirecionamento aberto = o site mandar o usuário para OUTRO site (ex.: //golpe.com ou https://golpe.com)
 * só porque alguém colocou esse endereço num link. Por isso só aceitamos caminhos INTERNOS.
 */

/** Tamanho máximo de um caminho de volta (o resto é descartado). */
const TAMANHO_MAXIMO = 300;

/**
 * Devolve o caminho se ele for interno e seguro; senão, a vitrine ("/").
 * Regras: começa com "/" e NÃO com "//" nem "/\" (o navegador trata os dois como outro site);
 * sem espaços nem caracteres de controle; e nunca volta para /login, /cadastro ou /logout (ficaria em círculo).
 * @param {*} valor caminho guardado (não confiável)
 * @returns {string}
 */
function caminhoInterno(valor) {
  const texto = typeof valor === 'string' ? valor : '';
  if (!texto.startsWith('/') || texto.length > TAMANHO_MAXIMO) return '/';
  if (texto.startsWith('//') || texto.startsWith('/\\')) return '/';
  if (/[\s\u0000-\u001f\u007f]/.test(texto)) return '/';
  if (/^\/(login|cadastro|logout)(?=[/?#]|$)/.test(texto)) return '/';
  return texto;
}

/**
 * Descobre para onde voltar depois do login, a partir do pedido que foi barrado.
 * GET: o próprio endereço pedido (ex.: /carrinho). POST (ex.: "Adicionar ao carrinho"): a página de onde
 * o formulário veio (cabeçalho Referer), mas só se for deste mesmo site; senão, null.
 * @param {object} req pedido do Express
 * @returns {string|null}
 */
function caminhoDeVolta(req) {
  if (req.method === 'GET') return caminhoInterno(req.originalUrl);
  const origem = req.get && req.get('referer');
  if (!origem) return null;
  try {
    const url = new URL(origem);
    if (url.host !== req.get('host')) return null; // veio de outro site: não guarda
    return caminhoInterno(url.pathname + url.search);
  } catch (erro) {
    return null;
  }
}

module.exports = { caminhoInterno, caminhoDeVolta };
