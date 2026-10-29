import { Router } from 'express';
import clienteControlador from '../controladores/clientes.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

// Rutas del módulo M2 — Clientes (montadas en /api/v1/clientes)
const enrutador = Router();

const PUEDEN_EDITAR = ['ventas', 'administracion'];

enrutador.get('/', clienteControlador.listar);
enrutador.get('/dni/:dni', clienteControlador.buscarPorDni);
enrutador.get('/:id', clienteControlador.obtener);
enrutador.post('/', permitir(...PUEDEN_EDITAR), clienteControlador.crear);
enrutador.put('/:id', permitir(...PUEDEN_EDITAR), clienteControlador.actualizar);

export default enrutador;
