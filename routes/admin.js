/**
 * routes/admin.js
 * Rotas do administrador (criar vendedores). Só o papel "admin" entra.
 */
const express = require('express');
const c = require('../container');
const ligar = require('../utils/ligar');
const { exigirPapel } = require('../middlewares/auth');
const { PAPEIS } = require('../domain/Usuario');

const router = express.Router();
router.use('/admin', exigirPapel(PAPEIS.ADMIN));

router.get('/admin', ligar(c.admin, 'tela'));
router.post('/admin/vendedores', ligar(c.admin, 'criarVendedor'));

module.exports = router;
