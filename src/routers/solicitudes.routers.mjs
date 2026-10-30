import { Router } from 'express';
import solicitudControlador from '../controladores/solicitudes.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

// Bandeja de solicitudes web (montada en /api/v1/solicitudes, requiere sesión).
// La ven quienes registran reservas: Ventas y Administración (Gerencia siempre).
const enrutador = Router();
const VENTAS = ['ventas', 'administracion'];

enrutador.get('/', permitir(...VENTAS), solicitudControlador.listar);
enrutador.get('/cantidad', permitir(...VENTAS), solicitudControlador.cantidad);
enrutador.get('/:id', permitir(...VENTAS), solicitudControlador.obtener);
enrutador.post('/:id/descartar', permitir(...VENTAS), solicitudControlador.descartar);

export default enrutador;
