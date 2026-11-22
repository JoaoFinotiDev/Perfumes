-- script.sql
-- Cria o banco "loja_perfumes", as tabelas e os dados de exemplo.
-- Para rodar:  mysql -u root -p < script.sql

CREATE DATABASE IF NOT EXISTS loja_perfumes
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE loja_perfumes;

-- Usuários do sistema (cliente, vendedor ou admin).
-- A senha é guardada como hash bcrypt, nunca em texto puro.
CREATE TABLE IF NOT EXISTS usuarios (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  usuario    VARCHAR(30)  NOT NULL UNIQUE,
  nome       VARCHAR(100) NOT NULL,
  senha_hash VARCHAR(100) NOT NULL,
  papel      ENUM('cliente','vendedor','admin') NOT NULL,
  criado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Perfumes anunciados (tabela principal exigida pelo trabalho).
CREATE TABLE IF NOT EXISTS perfumes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(120)  NOT NULL,
  marca         VARCHAR(80)   NOT NULL,
  preco         DECIMAL(10,2) NOT NULL,
  estoque       INT           NOT NULL DEFAULT 0,
  descricao     TEXT,
  codigo_barras VARCHAR(14)   UNIQUE,   -- opcional (UNIQUE aceita vários NULL)
  foto_url      VARCHAR(500),           -- opcional
  visivel       BOOLEAN NOT NULL DEFAULT TRUE, -- o Vendedor escolhe se aparece na vitrine (/)
  sku           VARCHAR(40) NULL UNIQUE,       -- código interno do produto (opcional e único)
  pontos        INT NULL,                      -- só a marca 'Queen Semijoias' usa (regra no domínio: Perfume.aceitaPontos)
  vendedor_id   INT NULL,               -- quem criou o anúncio
  criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendedor_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Variações OPCIONAIS de um produto (tamanho, cor...): cada uma tem o seu preço e o seu estoque.
-- Produto sem variação continua usando o preço e o estoque da tabela perfumes.
-- Com variações ativas, perfumes.preco guarda o MENOR preço e perfumes.estoque a SOMA (o service mantém sincronizado).
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

-- Cabeçalho de cada venda (pelo site ou aberta por um vendedor).
CREATE TABLE IF NOT EXISTS vendas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id      INT NULL,             -- NULL = venda sem cliente
  vendedor_id     INT NULL,             -- NULL = compra feita pelo site
  forma_pagamento ENUM('credito','debito','pix','dinheiro') NOT NULL,
  subtotal        DECIMAL(10,2) NOT NULL,
  desconto        DECIMAL(10,2) NOT NULL,
  total           DECIMAL(10,2) NOT NULL,
  criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id)  REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (vendedor_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Itens de cada venda.
CREATE TABLE IF NOT EXISTS venda_itens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  venda_id       INT NOT NULL,
  perfume_id     INT NOT NULL,
  quantidade     INT NOT NULL,
  variacao_id    INT NULL,               -- variação vendida (NULL = produto sem variação)
  preco_unitario DECIMAL(10,2) NOT NULL, -- preço cheio no momento da venda
  FOREIGN KEY (venda_id)   REFERENCES vendas(id)   ON DELETE CASCADE,
  FOREIGN KEY (perfume_id) REFERENCES perfumes(id),
  FOREIGN KEY (variacao_id) REFERENCES variacoes(id) ON DELETE SET NULL
);

-- Admin inicial: usuário "admin", senha "admin" (hash bcrypt).
-- Troque a senha depois do primeiro acesso, se for usar de verdade.
INSERT IGNORE INTO usuarios (usuario, nome, senha_hash, papel) VALUES
  ('admin', 'Administrador', '$2b$10$v2/tXCbr7N5xPqRuavrKRO23E4diMnY9Cr26EHDyULwTbgvsglHQe', 'admin');

-- Perfumes de exemplo (INSERT IGNORE evita duplicar se o script rodar de novo).
INSERT IGNORE INTO perfumes (nome, marca, preco, estoque, descricao, codigo_barras, foto_url) VALUES
-- São produtos fictícios da própria loja (marcas "Lojinha Chic" e "Chic Essence"), só para exemplo.
-- Os códigos de barras começam com 2, faixa reservada para uso interno (não pertence a nenhuma empresa).
  ('Âmbar Noturno', 'Lojinha Chic', 189.90, 15, 'Amadeirado e marcante, 100 ml.', '2000000000011', NULL),
  ('Body Splash Rosa Chic', 'Lojinha Chic', 129.90, 20, 'Floral suave, 75 ml.', '2000000000028', NULL),
  ('Colônia Brisa do Mar', 'Chic Essence', 119.50, 12, 'Fresco e aquático, 100 ml.', '2000000000035', NULL),
  ('Madeira Nobre', 'Chic Essence', 259.00, 8, 'Amadeirado intenso, 100 ml.', '2000000000042', NULL);
