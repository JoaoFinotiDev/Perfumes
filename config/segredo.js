/**
 * config/segredo.js
 * Escolhe o SESSION_SECRET (o segredo que assina o cookie de sessao) e confere se ele e seguro.
 * Um segredo vazio ou igual ao texto de exemplo do .env.example e publico: qualquer pessoa
 * poderia forjar um cookie de login. Por isso:
 *  - em PRODUCAO (NODE_ENV=production) o app se recusa a subir, com uma mensagem clara;
 *  - em desenvolvimento so AVISA no console (console.warn), para nao quebrar quem ainda usa o exemplo.
 */
const crypto = require('crypto');

/** Texto de exemplo que ja foi publicado no .env.example (nao pode ser usado de verdade). */
const SEGREDO_DE_EXEMPLO = 'troque-por-um-texto-longo-e-aleatorio';

/**
 * @param {object} env variaveis de ambiente (process.env)
 * @param {function(string): void} avisar onde escrever o aviso (console.warn por padrao)
 * @returns {string} o segredo a usar
 */
function resolverSegredo(env = process.env, avisar = console.warn) {
  const segredo = String(env.SESSION_SECRET || '').trim();
  const fraco = segredo === '' || segredo === SEGREDO_DE_EXEMPLO;
  if (!fraco) return segredo;

  const mensagem = 'SESSION_SECRET esta vazio ou igual ao texto de exemplo. Defina um texto longo e aleatorio no .env (veja o .env.example).';
  if (env.NODE_ENV === 'production') throw new Error(mensagem);
  avisar(`AVISO: ${mensagem} Em producao o app nao sobe assim.`);
  // Vazio: gera um segredo aleatorio so para esta execucao (as sessoes caem ao reiniciar). Exemplo: usa como veio.
  return segredo === '' ? crypto.randomBytes(32).toString('hex') : segredo;
}

module.exports = { resolverSegredo, SEGREDO_DE_EXEMPLO };
