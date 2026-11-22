/**
 * utils/validacao.js
 * Funções pequenas para validar as entradas dos formulários NO SERVIDOR.
 * Cada função devolve o valor já limpo ou lança ErroDeValidacao.
 */
const { ErroDeValidacao } = require('./erros');
const { arredondar } = require('../domain/Desconto');

/** Texto obrigatório (ou opcional) com tamanho mínimo e máximo. */
function texto(valor, campo, { min = 1, max = 255, opcional = false } = {}) {
  const v = String(valor === undefined || valor === null ? '' : valor).trim();
  if (v === '' && opcional) return null;
  if (v.length < min || v.length > max) {
    throw new ErroDeValidacao(`${campo}: use de ${min} a ${max} caracteres.`);
  }
  return v;
}

/** Número decimal positivo. Aceita vírgula (12,50) ou ponto (12.50). */
function preco(valor, campo) {
  const n = Number(String(valor).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 99999.99) {
    throw new ErroDeValidacao(`${campo}: informe um valor maior que zero.`);
  }
  // `arredondar` (de domain/Desconto.js) acerta casos como 1,005, que Math.round(n * 100) / 100 arredondava para baixo
  // (1.005 * 100 vale 100.49999999999999 no computador). Assim o preço digitado e o preço com desconto usam a MESMA regra.
  return arredondar(n);
}

/** Número inteiro entre 0 e um máximo (estoque, quantidade). */
function inteiro(valor, campo, max = 100000) {
  const s = String(valor).trim();
  if (!/^\d+$/.test(s) || Number(s) > max) {
    throw new ErroDeValidacao(`${campo}: informe um número inteiro de 0 a ${max}.`);
  }
  return Number(s);
}

/** Código de barras: só dígitos, de 8 a 14 (EAN-8, EAN-13, GTIN-14). Vazio vira null. */
function codigoDeBarras(valor, { opcional = true } = {}) {
  const v = String(valor === undefined || valor === null ? '' : valor).trim();
  if (v === '' && opcional) return null;
  if (!/^\d{8,14}$/.test(v)) {
    throw new ErroDeValidacao('Código de barras: use de 8 a 14 números.');
  }
  return v;
}

/** URL opcional: só aceita http ou https. */
function urlOpcional(valor, campo) {
  const v = String(valor === undefined || valor === null ? '' : valor).trim();
  if (v === '') return null;
  let u;
  try { u = new URL(v); } catch (e) { u = null; }
  if (!u || !['http:', 'https:'].includes(u.protocol) || v.length > 500) {
    throw new ErroDeValidacao(`${campo}: informe um endereço http ou https válido.`);
  }
  return v;
}

/** Nome de usuário: letras, números, ponto e sublinhado (3 a 30). */
function nomeDeUsuario(valor) {
  const v = String(valor === undefined || valor === null ? '' : valor).trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(v)) {
    throw new ErroDeValidacao('Usuário: 3 a 30 caracteres (letras, números, ponto ou sublinhado).');
  }
  return v;
}

/** Senha nova: mínimo de 6 caracteres. */
function senhaNova(valor) {
  const v = String(valor === undefined || valor === null ? '' : valor);
  if (v.length < 6 || v.length > 72) { // 72 = limite do bcrypt
    throw new ErroDeValidacao('Senha: use de 6 a 72 caracteres.');
  }
  return v;
}

module.exports = { texto, preco, inteiro, codigoDeBarras, urlOpcional, nomeDeUsuario, senhaNova };
