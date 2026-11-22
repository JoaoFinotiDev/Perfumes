/**
 * utils/moeda.js
 * Transforma um número em dinheiro brasileiro (ex.: 12.5 vira "R$ 12,50").
 * Fica num arquivo só para as telas (views) e os controllers usarem o MESMO formato.
 */

/** @param {number|string} valor quantia em reais; @returns {string} texto como "R$ 12,50" */
const moeda = (valor) => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

module.exports = moeda;
