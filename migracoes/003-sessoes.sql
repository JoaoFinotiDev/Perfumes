-- migracoes/003-sessoes.sql
-- Para bancos que JA existem: cria a tabela "sessoes", onde o login (a sessao) fica guardado no MySQL.
-- Assim reiniciar o servidor nao derruba o login de ninguem.
-- So CRIA a tabela: nenhum dado e apagado. Pode rodar mais de uma vez (IF NOT EXISTS).
-- Bancos novos, criados pelo script.sql, ja nascem com ela.
-- Para rodar:  mysql -u root -p < migracoes/003-sessoes.sql

USE loja_perfumes;

-- Colunas exigidas pelo pacote express-mysql-session (config/sessao.js).
CREATE TABLE IF NOT EXISTS sessoes (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires    INT UNSIGNED NOT NULL,  -- quando a sessao vence (segundos desde 1970)
  data       MEDIUMTEXT COLLATE utf8mb4_bin  -- o conteudo da sessao (usuario logado, carrinho...)
);
