/**
 * config/db.js
 * Cria o "pool" de conexões com o MySQL (pacote mysql2).
 * Usuário, senha e banco vêm do arquivo .env (nunca ficam no código).
 * Este pool é injetado nos repositórios (ver container.js).
 */
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true // colunas DECIMAL (preço) chegam como número, não como texto
});

module.exports = pool;
