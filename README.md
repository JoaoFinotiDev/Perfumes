# Lojinha Chic

> Lojinha Chic, uma loja de perfumes. O nome do banco (`loja_perfumes`), a pasta e o repositório continuam com o nome antigo para não quebrar nada.

**Tema:** marketplace de perfumes (catálogo, carrinho, login de Cliente, Vendedor e Admin, venda no balcão com código de barras).
**Disciplina:** Linguagem de Programação 1 - **Professor:** Leandro Luis Pauro
**Integrantes:** Joao Vitor Vieira Finoti e Joao Pedro Camargo Machado

Tecnologias: Node.js, Express, EJS, CSS puro, MySQL (mysql2).
Arquitetura em camadas e POO: `routes -> controllers -> services -> repositories -> db`.

## Como instalar e executar

Precisa de Node.js 18+ e MySQL em execução.

```bash
npm install
mysql -u root -p < script.sql      # cria o banco loja_perfumes, as tabelas e os dados de exemplo
cp .env.example .env               # no Windows: copy .env.example .env  (e preencha os valores)
npm start
```

Para desenvolver, use `npm run dev`: o nodemon reinicia o servidor sozinho a cada arquivo salvo.

Abra http://localhost:3000. Testes: `npm test` (regras, sem banco) e, com o servidor no ar, `npm run e2e`.

## Acessos

- Admin: usuário `admin` (cria os Vendedores em "Vendedores"). O admin inicial é criado pelo `script.sql`; troque a senha antes de publicar.
- Cliente: cadastra-se sozinho em "Cadastrar" e ganha 5% de desconto.
- Vendedor: cria anúncios no Catálogo e usa "Abrir venda". O formulário de `POST /itens` (novo anúncio) só aparece depois de entrar como Vendedor. O pagamento é apenas simulado.

## Código de barras

No cadastro de produto, o código preenche nome, marca e foto pela API Kodebar (token em `KODEBAR_TOKEN`) e, se não achar, pelo Open Beauty Facts. Sem token ou sem internet, basta digitar os dados.

## Telas

- **Vitrine (`/`)**: página inicial no estilo marketplace, com cards (foto, marca, nome, preço e botão "Adicionar ao carrinho"), busca por nome ou marca, filtro por marca e ordenação por nome ou preço. O Cliente vê o preço antigo riscado, o preço com 5% e o selo "-5%". Produto sem foto mostra uma imagem local; sem estoque mostra "Esgotado".
- **Catálogo (tabela) (`/itens`)**: tabela HTML com todos os registros (`GET /itens`) e, para o Vendedor, o formulário de novo anúncio (`POST /itens`).

## Importar produtos Mawwal

```bash
npm run importar:mawwal
```

Lê a lista pública `https://mawwal.com.br/products.json` (1 segundo entre páginas) e grava os produtos na tabela `perfumes`, com marca `Mawwal`. Só adiciona: quem já existe (mesmo nome e marca, ou mesmo código de barras) é pulado, então pode rodar mais de uma vez. A fonte não informa estoque, por isso cada produto entra com estoque padrão 10 e sem vendedor (`vendedor_id` fica `NULL`). Para evitar nova chamada à internet: `npm run importar:mawwal -- --salvar=mawwal.json` guarda o JSON e `-- --arquivo=mawwal.json` importa a partir dele.

Os produtos importados não ficam no `script.sql` (são dados de terceiros). Fonte: dados e fotos pertencem a Mawwal Arabia Brasil; uso apenas acadêmico.
