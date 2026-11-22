/**
 * routes/vendedor.js
 * Rotas do vendedor: tela "Abrir venda" e a API de busca por código de barras.
 * O middleware exigirPapel bloqueia no servidor quem não é vendedor.
 */
const express = require('express');
const c = require('../container');
const ligar = require('../utils/ligar');
const { exigirPapel } = require('../middlewares/auth');

const router = express.Router();
router.use(['/vendedor', '/api'], exigirPapel('vendedor')); // vale para todas as rotas abaixo

router.get('/vendedor/venda', ligar(c.venda, 'tela'));
router.post('/vendedor/venda/cliente', ligar(c.venda, 'definirCliente'));
router.post('/vendedor/venda/adicionar', ligar(c.venda, 'adicionar'));
router.post('/vendedor/venda/codigo', ligar(c.venda, 'bipar'));
router.post('/vendedor/venda/remover', ligar(c.venda, 'remover'));
router.post('/vendedor/venda/finalizar', ligar(c.venda, 'finalizar'));

// Preenche o cadastro de produto a partir do código de barras.
router.get('/api/produto-por-codigo/:codigo', ligar(c.produtoApi, 'porCodigo'));

module.exports = router;
