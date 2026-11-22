/**
 * routes/produtos.js
 * Gestão de produtos: lista, edição e mostrar/ocultar na vitrine.
 * exigirPapel barra visitante (vai para o login) e Cliente (403). Dentro do service, a regra
 * Usuario.podeGerenciar(produto) decide quem pode mexer em qual produto.
 * Este arquivo é ligado no app.js ANTES de routes/vendedor.js, porque aquele só aceita o papel "vendedor"
 * e aqui o Admin também pode entrar.
 */
const express = require('express');
const c = require('../container');
const ligar = require('../utils/ligar');
const { exigirPapel } = require('../middlewares/auth');

const router = express.Router();
router.use('/vendedor/produtos', exigirPapel('vendedor', 'admin'));

router.get('/vendedor/produtos', ligar(c.gestaoProdutos, 'listar'));
router.get('/vendedor/produtos/:id/editar', ligar(c.gestaoProdutos, 'formEditar'));
router.post('/vendedor/produtos/:id/editar', ligar(c.gestaoProdutos, 'salvar'));
router.post('/vendedor/produtos/:id/visibilidade', ligar(c.gestaoProdutos, 'definirVisibilidade'));
router.post('/vendedor/produtos/:id/estoque', ligar(c.gestaoProdutos, 'definirEstoque'));

module.exports = router;
