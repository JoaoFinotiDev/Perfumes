# Loja de Perfumes

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

Abra http://localhost:3000. Testes: `npm test` (regras, sem banco) e, com o servidor no ar, `npm run e2e`.

## Acessos

- Admin inicial: usuário `admin`, senha `admin` (cria os Vendedores em "Vendedores").
- Cliente: cadastra-se sozinho em "Cadastrar" e ganha 5% de desconto.
- Vendedor: cria anúncios no Catálogo e usa "Abrir venda". O pagamento é apenas simulado.

## Código de barras

No cadastro de produto, o código preenche nome, marca e foto pela API Kodebar (token em `KODEBAR_TOKEN`) e, se não achar, pelo Open Beauty Facts. Sem token ou sem internet, basta digitar os dados.
