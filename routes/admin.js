/**
 * routes/admin.js
 * Rotas do administrador (criar vendedores). Só o papel "admin" entra.
 */
const express = require('express');
const c = require('../container');
const ligar = require('../utils/ligar');
const { exigirPapel } = require('../middlewares/auth');

const router = express.Router();
router.use('/admin', exigirPapel('admin'));

router.get('/admin', ligar(c.admin, 'tela'));
router.post('/admin/vendedores', ligar(c.admin, 'criarVendedor'));

module.exports = router;
