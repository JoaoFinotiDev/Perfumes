-- migracoes/001-visivel.sql
-- Para bancos que JA existem (criados antes desta mudanca): adiciona a coluna "visivel".
-- Bancos novos, criados pelo script.sql, ja nascem com ela.
-- So ADICIONA a coluna: nenhum dado e apagado. Todos os produtos continuam visiveis (DEFAULT TRUE).
-- Pode rodar mais de uma vez: se a coluna ja existe, nao faz nada.
-- Para rodar:  mysql -u root -p < migracoes/001-visivel.sql

USE loja_perfumes;

-- O MySQL nao tem "ADD COLUMN IF NOT EXISTS", entao conferimos antes no information_schema.
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'perfumes' AND COLUMN_NAME = 'visivel');
SET @comando = IF(@existe = 0,
  'ALTER TABLE perfumes ADD COLUMN visivel BOOLEAN NOT NULL DEFAULT TRUE',
  'SELECT "coluna visivel ja existe" AS aviso');
PREPARE passo FROM @comando;
EXECUTE passo;
DEALLOCATE PREPARE passo;
