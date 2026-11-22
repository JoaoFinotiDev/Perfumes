/**
 * config/segredo.js
 * Escolhe o SESSION_SECRET (o segredo que assina o cookie de sessão) e confere se ele é seguro.
 * Um segredo vazio ou igual ao texto de exemplo do .env.example é público: qualquer pessoa
 * poderia forjar um cookie de login. Por isso:
 *  - em PRODUÇÃO (NODE_ENV=production) o app se recusa a subir, com uma mensagem clara;
 *  - em desenvolvimento só AVISA no console (console.warn), para não quebrar quem ainda usa o exemplo.
 * Em desenvolvimento, se o SESSION_SECRET estiver vazio, usa um segredo FIXO guardado no arquivo local
 * `.segredo-dev` (ignorado pelo git): um segredo novo a cada execução derrubaria o login a cada reinício.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Texto de exemplo que já foi publicado no .env.example (não pode ser usado de verdade). */
const SEGREDO_DE_EXEMPLO = 'troque-por-um-texto-longo-e-aleatorio';

/** Arquivo local (fora do git) com o segredo fixo de desenvolvimento. */
const ARQUIVO_DEV = path.join(__dirname, '..', '.segredo-dev');

/**
 * @param {object} env variáveis de ambiente (process.env)
 * @param {function(string): void} avisar onde escrever o aviso (console.warn por padrão)
 * @param {string} arquivoDev onde guardar o segredo de desenvolvimento (só os testes mudam)
 * @returns {string} o segredo a usar
 */
function resolverSegredo(env = process.env, avisar = console.warn, arquivoDev = ARQUIVO_DEV) {
  const segredo = String(env.SESSION_SECRET || '').trim();
  const fraco = segredo === '' || segredo === SEGREDO_DE_EXEMPLO;
  if (!fraco) return segredo;

  const mensagem = 'SESSION_SECRET está vazio ou igual ao texto de exemplo. Defina um texto longo e aleatório no .env (veja o .env.example).';
  if (env.NODE_ENV === 'production') throw new Error(mensagem);
  avisar(`AVISO: ${mensagem} Em produção o app não sobe assim.`);
  // Vazio ou igual ao exemplo (que é público): em desenvolvimento usa o segredo fixo do .segredo-dev.
  return segredoDeDesenvolvimento(arquivoDev, avisar);
}

/**
 * Lê o segredo de desenvolvimento do arquivo local; se ainda não existe, gera um aleatório e grava (só na primeira vez).
 * shortcut: se não der para gravar (pasta só de leitura), usa um segredo só desta execução e o login cai ao reiniciar.
 */
function segredoDeDesenvolvimento(arquivo, avisar) {
  try {
    const guardado = fs.readFileSync(arquivo, 'utf8').trim();
    if (guardado.length >= 32) return guardado;
  } catch (erro) { /* ainda não existe: gera abaixo */ }
  const novo = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(arquivo, novo + '\n', { mode: 0o600 });
    avisar('AVISO: criei o arquivo .segredo-dev com um segredo fixo de desenvolvimento (ele não vai para o GitHub). Assim o login não cai quando o servidor reinicia.');
  } catch (erro) {
    avisar('AVISO: não consegui gravar o .segredo-dev; usando um segredo só desta execução (o login cai ao reiniciar).');
  }
  return novo;
}

module.exports = { resolverSegredo, SEGREDO_DE_EXEMPLO };
