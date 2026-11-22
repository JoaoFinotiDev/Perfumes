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
- Cliente: cadastra-se sozinho em "Cadastrar", ganha 5% de desconto e é o **único** papel que usa o carrinho do site.
- Vendedor: cria anúncios no Catálogo e usa "Abrir venda". O formulário de `POST /itens` (novo anúncio) só aparece depois de entrar como Vendedor. O pagamento é apenas simulado.

## Código de barras

No cadastro de produto, o código preenche nome, marca e foto pela API Kodebar (token em `KODEBAR_TOKEN`) e, se não achar, pelo Open Beauty Facts. Sem token ou sem internet, basta digitar os dados.

## Telas

- **Vitrine (`/`)**: página inicial no estilo marketplace, com cards (foto, marca, nome, preço e botão "Adicionar ao carrinho"), busca por nome ou marca, filtro por marca e ordenação por nome ou preço. Visitante e Cliente veem o botão e o link "Carrinho"; Vendedor e Admin não veem nenhum dos dois (eles vendem por "Abrir venda").
- **Busca em lista suspensa**: ao clicar no campo de busca da vitrine (e no campo "Buscar por nome ou marca" de "Abrir venda"), abre uma lista com os produtos (nome, marca, preço e foto pequena), com rolagem (até 320 px de altura) e um campo de pesquisa no topo que filtra a cada letra (espera de 200 ms, sem recarregar a página; maiúsculas e acentos não importam). Teclado: setas sobem e descem, Enter escolhe, Esc fecha, e clicar fora também fecha. A lista segue o padrão ARIA combobox/listbox. Na vitrine, escolher um item abre a vitrine filtrada por aquele nome; em "Abrir venda", escolher adiciona o produto à venda (o mesmo `POST /vendedor/venda/adicionar` de antes). Os dados vêm de `GET /api/produtos?q=...`, uma rota **local** que lê só o nosso banco (nenhuma API externa), com no máximo 50 resultados: sem login devolve só os produtos visíveis; com `?todos=1` (usado em "Abrir venda") inclui os ocultos e só Vendedor/Admin podem pedir (os outros recebem 403). O JS está em `public/javascripts/busca-lista.js`, sem biblioteca. Sem JavaScript, o formulário de busca continua funcionando. O campo de código de barras de "Abrir venda" é separado e igual (bipar + Enter).
- **Variações, página do produto e quantidade**: o produto pode ter **variações** opcionais (ex.: tamanho, cor), cada uma com preço e estoque próprios. O card da vitrine de um produto com variações mostra um seletor "Opção" (já vem escolhida a primeira com estoque; as esgotadas aparecem desativadas com "(esgotado)"), "a partir de R$ X · N opções" e o preço e o estoque da opção escolhida (JS puro em `public/javascripts/comprar.js`; sem JS o `<select>` vai no formulário). O campo **Quantidade** (com botões - e +) vai para `POST /carrinho/adicionar` junto com `perfumeId` e `variacaoId`. O servidor valida de novo: quantidade inteira a partir de 1, variação obrigatória quando há, e (já no carrinho + nova) não pode passar do estoque ("só temos N em estoque"). Clicar na foto ou no nome do card abre `GET /produto/:id` (foto grande, descrição completa, SKU, pontos, seletor, preço, estoque e adicionar). Visitante e Cliente só abrem produtos visíveis; Vendedor e Admin abrem todos. O desconto de 5% do Cliente vale na variação. Produto sem variação funciona como sempre. A venda baixa o estoque da **variação** (na mesma transação) e grava `venda_itens.variacao_id`. Em "Abrir venda", produto com variações pede a variação antes de adicionar. A busca (vitrine, `/api/produtos` e "Abrir venda") também acha pelo **SKU**.
- **SKU e pontos**: o SKU é um código interno opcional e único (até 40 caracteres). **Pontos** existem só para a marca **Queen Semijoias** (regra em um lugar só: `Perfume.aceitaPontos()` em `domain/Perfume.js`): o campo só aparece nos formulários dessa marca, o servidor ignora os pontos das outras marcas (grava NULL), e trocar a marca de Queen para outra zera os pontos. Vitrine, página do produto, `/itens` e Gerenciar só mostram pontos para a Queen.
- **Carrinho (`/carrinho`)**: só para o Cliente, checado no servidor (middleware `exigirCliente` em `middlewares/auth.js`; a regra de domínio é `Usuario.podeUsarCarrinho()`). Visitante que tenta adicionar vai para o login com o aviso "Entre como cliente para comprar."; Vendedor e Admin recebem 403 em qualquer rota do carrinho. O Cliente vê o preço antigo riscado, o preço com 5% e o selo "-5%". Produto sem foto mostra uma imagem local; sem estoque mostra "Esgotado".
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
- **Variações, SKU e pontos** (na tela de edição): seção "Variações" para adicionar, editar (descrição, preço, estoque, ativa) e remover. Com variações ativas, o preço do produto passa a ser o menor preço e o estoque a soma (o servidor mantém `perfumes.preco` e `perfumes.estoque` sincronizados, então `/itens` e a busca continuam simples) e o formulário do produto mostra esses dois campos só para leitura. Na lista, produto com variações mostra o estoque total e o link "editar variações" (o estoque rápido não vale para ele). SKU: único, opcional, até 40 caracteres (repetido dá erro 400). Pontos: inteiro maior ou igual a 0, só para a marca Queen Semijoias.
- **Estoque rápido**: cada linha tem um campo numérico com o botão "Salvar" (`POST /vendedor/produtos/:id/estoque`) e os botões "-1" e "+1". O servidor só aceita inteiro maior ou igual a 0 (senão responde 400 com a mensagem na própria lista), só Vendedor/Admin (`podeGerenciar`) mexem, e o `UPDATE` grava apenas a coluna `estoque`. Depois aparece o aviso "Estoque atualizado". A tela de edição continua editando o estoque também.
- **Mostrar/Ocultar na vitrine**: botão (POST). A vitrine (`/`) só mostra produtos visíveis, e o servidor recusa colocar um produto oculto no carrinho do site. A tabela `/itens` (só Vendedor e Admin) mostra todos os produtos, com a coluna "Na vitrine". A tela **Abrir venda** continua achando produtos ocultos (por nome, marca e código de barras): ocultar vale só para a vitrine.
- **Editar** (`/vendedor/produtos/:id/editar`): nome, marca, preço, estoque, descrição, foto, código de barras e visibilidade, com as mesmas validações do cadastro. O código de barras é opcional e único (repetido em outro produto dá erro 400). O Enter nesse campo não envia o formulário (o leitor de código termina com Enter), e a edição não chama nenhuma API externa.
- **Quem pode**: qualquer Vendedor (e o Admin) gerencia todos os produtos, pois a loja é uma só e os produtos importados da Mawwal não têm dono. Cliente recebe 403 e visitante vai para o login. A regra está em um lugar só, o método `podeGerenciar(produto)` em `domain/Usuario.js`; para limitar ao dono, troque a regra do Vendedor por `produto.vendedorId === this.id`.
- A descrição aceita até 5000 caracteres (as descrições importadas passam de 1000).

### Banco já existente: migração

Variações, SKU e pontos (`migracoes/002-variacoes-sku-pontos.sql`, só adiciona e pode repetir; o `script.sql` novo já cria tudo):

```bash
mysql -u root -p < migracoes/002-variacoes-sku-pontos.sql
```

Visibilidade (`migracoes/001-visivel.sql`):

O `script.sql` novo já cria a coluna `visivel`. Quem já tem o banco criado roda uma vez (pode repetir, não apaga nada):

```bash
mysql -u root -p < migracoes/001-visivel.sql
```
