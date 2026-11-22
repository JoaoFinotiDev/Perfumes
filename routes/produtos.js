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
const { PAPEIS } = require('../domain/Usuario');

const router = express.Router();
router.use('/vendedor/produtos', exigirPapel(PAPEIS.VENDEDOR, PAPEIS.ADMIN));

router.get('/vendedor/produtos', ligar(c.gestaoProdutos, 'listar'));
router.get('/vendedor/produtos/:id/editar', ligar(c.gestaoProdutos, 'formEditar'));
router.post('/vendedor/produtos/:id/editar', ligar(c.gestaoProdutos, 'salvar'));
router.post('/vendedor/produtos/:id/visibilidade', ligar(c.gestaoProdutos, 'definirVisibilidade'));
router.post('/vendedor/produtos/:id/estoque', ligar(c.gestaoProdutos, 'definirEstoque'));
// Variações do produto (adicionar, editar, remover), na tela de edição.
router.post('/vendedor/produtos/:id/variacoes', ligar(c.gestaoProdutos, 'adicionarVariacao'));
router.post('/vendedor/produtos/:id/variacoes/:variacaoId', ligar(c.gestaoProdutos, 'atualizarVariacao'));
router.post('/vendedor/produtos/:id/variacoes/:variacaoId/remover', ligar(c.gestaoProdutos, 'removerVariacao'));
// Atalhos da LISTA "Gerenciar produtos": estoque de uma variação e ligar/desligar (o service confere a permissão).
router.post('/vendedor/produtos/:id/variacoes/:variacaoId/estoque', ligar(c.gestaoProdutos, 'definirEstoqueVariacao'));
router.post('/vendedor/produtos/:id/variacoes/:variacaoId/ativo', ligar(c.gestaoProdutos, 'definirAtivoVariacao'));

module.exports = router;
