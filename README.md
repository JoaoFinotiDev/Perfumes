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

- **Tabela do catálogo (`GET /itens`, exigida pelo trabalho)**: só aparece depois de entrar como Vendedor ou Admin. Para ver, entre em `/login` com o usuário `admin` (criado pelo `script.sql`; a senha inicial está lá, troque antes de publicar) ou com um Vendedor criado pelo Admin. Cliente e visitante usam só a vitrine (`/`): visitante é levado ao login e Cliente recebe 403 em `/itens`.
- Admin: usuário `admin` (cria os Vendedores em "Vendedores"). O admin inicial é criado pelo `script.sql`; troque a senha antes de publicar.
- Cliente: cadastra-se sozinho em "Cadastrar" e ganha 5% de desconto.
- Vendedor: cria anúncios no Catálogo e usa "Abrir venda". O formulário de `POST /itens` (novo anúncio) só aparece depois de entrar como Vendedor. O pagamento é apenas simulado.

## Código de barras

No cadastro de produto, o código preenche nome, marca e foto pela API Kodebar (token em `KODEBAR_TOKEN`) e, se não achar, pelo Open Beauty Facts. Sem token ou sem internet, basta digitar os dados.

## Telas

- **Vitrine (`/`)**: página inicial no estilo marketplace, com cards (foto, marca, nome, preço e botão "Adicionar ao carrinho"), busca por nome ou marca, filtro por marca e ordenação por nome ou preço. O Cliente vê o preço antigo riscado, o preço com 5% e o selo "-5%". Produto sem foto mostra uma imagem local; sem estoque mostra "Esgotado".
- **Catálogo (tabela) (`/itens`)**: só para Vendedor e Admin (middleware `exigirPapel`). A descrição aparece em uma linha, e o botão "Ver mais" / "Ver menos" só surge quando o texto não cabe. Tabela HTML com todos os registros (`GET /itens`) e, para o Vendedor, o formulário de novo anúncio (`POST /itens`).

## Importar produtos Mawwal

```bash
npm run importar:mawwal
```

Lê a lista pública `https://mawwal.com.br/products.json` (1 segundo entre páginas) e grava os produtos na tabela `perfumes`, com marca `Mawwal`. Só adiciona: quem já existe (mesmo nome e marca, ou mesmo código de barras) é pulado, então pode rodar mais de uma vez. A fonte não informa estoque, por isso cada produto entra com estoque padrão 10 e sem vendedor (`vendedor_id` fica `NULL`). Para evitar nova chamada à internet: `npm run importar:mawwal -- --salvar=mawwal.json` guarda o JSON e `-- --arquivo=mawwal.json` importa a partir dele.

As entidades HTML dos textos (`&ccedil;`, `&#233;`, `&amp;`...) são trocadas pelos caracteres na importação. Para consertar produtos já importados que ficaram com `&...;` na descrição, rode `npm run importar:mawwal -- --arquivo=mawwal.json --corrigir-descricoes` (só regrava a descrição desses produtos, não apaga nada e pode repetir).

Os produtos importados não ficam no `script.sql` (são dados de terceiros). Fonte: dados e fotos pertencem a Mawwal Arabia Brasil; uso apenas acadêmico.

## Gerenciar produtos (Vendedor)

Menu **Gerenciar produtos** (`/vendedor/produtos`), para Vendedor e Admin:

- Lista todos os produtos (inclusive ocultos), com busca por nome ou marca.
- **Mostrar/Ocultar na vitrine**: botão (POST). A vitrine (`/`) só mostra produtos visíveis, e o servidor recusa colocar um produto oculto no carrinho do site. A tabela `/itens` (só Vendedor e Admin) mostra todos os produtos, com a coluna "Na vitrine". A tela **Abrir venda** continua achando produtos ocultos (por nome, marca e código de barras): ocultar vale só para a vitrine.
- **Editar** (`/vendedor/produtos/:id/editar`): nome, marca, preço, estoque, descrição, foto, código de barras e visibilidade, com as mesmas validações do cadastro. O código de barras é opcional e único (repetido em outro produto dá erro 400). O Enter nesse campo não envia o formulário (o leitor de código termina com Enter), e a edição não chama nenhuma API externa.
- **Quem pode**: qualquer Vendedor (e o Admin) gerencia todos os produtos, pois a loja é uma só e os produtos importados da Mawwal não têm dono. Cliente recebe 403 e visitante vai para o login. A regra está em um lugar só, o método `podeGerenciar(produto)` em `domain/Usuario.js`; para limitar ao dono, troque a regra do Vendedor por `produto.vendedorId === this.id`.
- A descrição aceita até 5000 caracteres (as descrições importadas passam de 1000).

### Banco já existente: migração

O `script.sql` novo já cria a coluna `visivel`. Quem já tem o banco criado roda uma vez (pode repetir, não apaga nada):

```bash
mysql -u root -p < migracoes/001-visivel.sql
```
