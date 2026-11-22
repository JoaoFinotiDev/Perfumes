-- migracoes/002-variacoes-sku-pontos.sql
-- Para bancos que JA existem (criados antes desta mudanca). Adiciona:
--   * perfumes.sku    (VARCHAR 40, opcional e UNICO)
--   * perfumes.pontos (INT, opcional; so a marca 'Queen Semijoias' usa)
--   * a tabela variacoes (variacoes opcionais de um produto, cada uma com preco e estoque)
--   * venda_itens.variacao_id (liga o item vendido a variacao, se houver)
-- So ADICIONA: nenhum dado e apagado ou alterado. Todos os produtos continuam como estavam.
-- Pode rodar mais de uma vez: cada passo confere antes se ja existe.
-- Para rodar:  mysql -u root -p < migracoes/002-variacoes-sku-pontos.sql

USE loja_perfumes;

-- O MySQL nao tem "ADD COLUMN IF NOT EXISTS", entao conferimos antes no information_schema.

-- 1) perfumes.sku
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'perfumes' AND COLUMN_NAME = 'sku');
SET @comando = IF(@existe = 0,
  'ALTER TABLE perfumes ADD COLUMN sku VARCHAR(40) NULL',
  'SELECT "coluna sku ja existe" AS aviso');
PREPARE passo FROM @comando;
EXECUTE passo;
DEALLOCATE PREPARE passo;

-- 1b) indice UNICO do sku (UNIQUE aceita varios NULL). Confere por coluna, pois no script.sql o indice tem outro nome.
SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'perfumes' AND COLUMN_NAME = 'sku' AND NON_UNIQUE = 0);
SET @comando = IF(@existe = 0,
  'ALTER TABLE perfumes ADD CONSTRAINT uq_perfumes_sku UNIQUE (sku)',
  'SELECT "indice do sku ja existe" AS aviso');
PREPARE passo FROM @comando;
EXECUTE passo;
DEALLOCATE PREPARE passo;

-- 2) perfumes.pontos
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'perfumes' AND COLUMN_NAME = 'pontos');
SET @comando = IF(@existe = 0,
  'ALTER TABLE perfumes ADD COLUMN pontos INT NULL',
  'SELECT "coluna pontos ja existe" AS aviso');
PREPARE passo FROM @comando;
EXECUTE passo;
DEALLOCATE PREPARE passo;

-- 3) tabela variacoes (CREATE TABLE IF NOT EXISTS ja e idempotente)
CREATE TABLE IF NOT EXISTS variacoes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  perfume_id INT NOT NULL,
  descricao  VARCHAR(80)   NOT NULL,
  preco      DECIMAL(10,2) NOT NULL,
  estoque    INT           NOT NULL DEFAULT 0,
  ativo      BOOLEAN       NOT NULL DEFAULT TRUE,
  ordem      INT           NOT NULL DEFAULT 0,
  CONSTRAINT ck_variacoes_estoque CHECK (estoque >= 0),
  FOREIGN KEY (perfume_id) REFERENCES perfumes(id) ON DELETE CASCADE
);

-- 4) venda_itens.variacao_id
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venda_itens' AND COLUMN_NAME = 'variacao_id');
SET @comando = IF(@existe = 0,
  'ALTER TABLE venda_itens ADD COLUMN variacao_id INT NULL',
  'SELECT "coluna variacao_id ja existe" AS aviso');
PREPARE passo FROM @comando;
EXECUTE passo;
DEALLOCATE PREPARE passo;

-- 4b) chave estrangeira venda_itens.variacao_id -> variacoes.id
SET @existe = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venda_itens' AND CONSTRAINT_NAME = 'fk_venda_itens_variacao');
SET @comando = IF(@existe = 0,
  'ALTER TABLE venda_itens ADD CONSTRAINT fk_venda_itens_variacao FOREIGN KEY (variacao_id) REFERENCES variacoes(id) ON DELETE SET NULL',
  'SELECT "chave estrangeira da variacao ja existe" AS aviso');
PREPARE passo FROM @comando;
EXECUTE passo;
DEALLOCATE PREPARE passo;
