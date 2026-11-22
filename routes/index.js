/**
 * routes/index.js
 * Rotas públicas e do cliente: catálogo, login, cadastro e carrinho.
 * As rotas só ligam o endereço ao controller; não falam com o banco.
 */
const express = require('express');
const c = require('../container');
const ligar = require('../utils/ligar');
const { exigirPapel } = require('../middlewares/auth');

const router = express.Router();

// Catálogo (home). GET / redireciona para a lista.
router.get('/', (req, res) => res.redirect('/itens'));
router.get('/itens', ligar(c.catalogo, 'listar'));
router.post('/itens', exigirPapel('vendedor'), ligar(c.catalogo, 'criar'));

// Login, cadastro de cliente e logout.
router.get('/login', ligar(c.auth, 'formLogin'));
router.post('/login', ligar(c.auth, 'login'));
router.get('/cadastro', ligar(c.auth, 'formCadastro'));
router.post('/cadastro', ligar(c.auth, 'cadastrar'));
router.post('/logout', ligar(c.auth, 'logout'));

// Carrinho (qualquer visitante); só o cliente logado finaliza a compra.
router.get('/carrinho', ligar(c.carrinho, 'ver'));
router.post('/carrinho/adicionar', ligar(c.carrinho, 'adicionar'));
router.post('/carrinho/remover', ligar(c.carrinho, 'remover'));
router.post('/carrinho/finalizar', exigirPapel('cliente'), ligar(c.carrinho, 'finalizar'));

module.exports = router;
