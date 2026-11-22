/**
 * app.js
 * Configuração do Express: views EJS, sessão, arquivos estáticos e rotas.
 * O servidor sobe em bin/www (npm start).
 */
require('dotenv').config({ quiet: true }); // lê o .env antes de tudo
const express = require('express');
const path = require('path');
const logger = require('morgan');
const session = require('express-session');
const { carregarUsuario } = require('./middlewares/auth');
const Perfume = require('./domain/Perfume');
const { resolverSegredo } = require('./config/segredo');

// Segredo da sessao: em producao falha se estiver vazio ou for o exemplo; em desenvolvimento so avisa.
const segredoDaSessao = resolverSegredo();

const app = express();

// Motor de views: EJS (escapa o texto de <%= %> automaticamente).
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// A regra "só a marca Queen Semijoias tem pontos" mora em Perfume; as views só perguntam.
app.locals.marcaComPontos = Perfume.MARCA_COM_PONTOS;
app.locals.aceitaPontos = Perfume.aceitaPontos;

app.use(logger('dev'));
app.use(express.urlencoded({ extended: false })); // lê formulários HTML
app.use(express.static(path.join(__dirname, 'public')));

// Sessão em cookie httpOnly. shortcut: usa a memória do servidor (reinicia = sai de todos);
// para produção, trocar por um store em banco (ex.: express-mysql-session).
app.use(session({
  secret: segredoDaSessao,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));
app.use(carregarUsuario);

app.use('/', require('./routes/index'));
app.use('/', require('./routes/produtos')); // antes de vendedor: aqui o Admin também entra
app.use('/', require('./routes/vendedor'));
app.use('/', require('./routes/admin'));

// Página não encontrada.
app.use((req, res) => {
  res.status(404).render('erro', { titulo: 'Página não encontrada', mensagem: 'Esse endereço não existe.' });
});

// Erros inesperados: loga no servidor e mostra mensagem genérica (sem detalhes internos).
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('erro', { titulo: 'Erro no servidor', mensagem: 'Algo deu errado. Tente de novo.' });
});

module.exports = app;
