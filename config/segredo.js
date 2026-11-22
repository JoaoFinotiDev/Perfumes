/**
 * config/segredo.js
 * Escolhe o SESSION_SECRET (o segredo que assina o cookie de sessao) e confere se ele e seguro.
 * Um segredo vazio ou igual ao texto de exemplo do .env.example e publico: qualquer pessoa
 * poderia forjar um cookie de login. Por isso:
 *  - em PRODUCAO (NODE_ENV=production) o app se recusa a subir, com uma mensagem clara;
 *  - em desenvolvimento so AVISA no console (console.warn), para nao quebrar quem ainda usa o exemplo.
 * Em desenvolvimento, se o SESSION_SECRET estiver vazio, usa um segredo FIXO guardado no arquivo local
 * `.segredo-dev` (ignorado pelo git): um segredo novo a cada execucao derrubaria o login a cada reinicio.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Texto de exemplo que ja foi publicado no .env.example (nao pode ser usado de verdade). */
const SEGREDO_DE_EXEMPLO = 'troque-por-um-texto-longo-e-aleatorio';

/** Arquivo local (fora do git) com o segredo fixo de desenvolvimento. */
const ARQUIVO_DEV = path.join(__dirname, '..', '.segredo-dev');

/**
 * @param {object} env variaveis de ambiente (process.env)
 * @param {function(string): void} avisar onde escrever o aviso (console.warn por padrao)
 * @param {string} arquivoDev onde guardar o segredo de desenvolvimento (so os testes mudam)
 * @returns {string} o segredo a usar
 */
function resolverSegredo(env = process.env, avisar = console.warn, arquivoDev = ARQUIVO_DEV) {
  const segredo = String(env.SESSION_SECRET || '').trim();
  const fraco = segredo === '' || segredo === SEGREDO_DE_EXEMPLO;
  if (!fraco) return segredo;

  const mensagem = 'SESSION_SECRET esta vazio ou igual ao texto de exemplo. Defina um texto longo e aleatorio no .env (veja o .env.example).';
  if (env.NODE_ENV === 'production') throw new Error(mensagem);
  avisar(`AVISO: ${mensagem} Em producao o app nao sobe assim.`);
  // Vazio: segredo fixo de desenvolvimento. Exemplo do .env.example: usa como veio.
  return segredo === '' ? segredoDeDesenvolvimento(arquivoDev, avisar) : segredo;
}

/**
 * Le o segredo de desenvolvimento do arquivo local; se ainda nao existe, gera um aleatorio e grava (so na primeira vez).
 * shortcut: se nao der para gravar (pasta so de leitura), usa um segredo so desta execucao e o login cai ao reiniciar.
 */
function segredoDeDesenvolvimento(arquivo, avisar) {
  try {
    const guardado = fs.readFileSync(arquivo, 'utf8').trim();
    if (guardado.length >= 32) return guardado;
  } catch (erro) { /* ainda nao existe: gera abaixo */ }
  const novo = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(arquivo, novo + '\n', { mode: 0o600 });
    avisar('AVISO: criei o arquivo .segredo-dev com um segredo fixo de desenvolvimento (ele nao vai para o GitHub). Assim o login nao cai quando o servidor reinicia.');
  } catch (erro) {
    avisar('AVISO: nao consegui gravar o .segredo-dev; usando um segredo so desta execucao (o login cai ao reiniciar).');
  }
  return novo;
}

module.exports = { resolverSegredo, SEGREDO_DE_EXEMPLO };
