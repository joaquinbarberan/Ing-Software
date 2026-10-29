import { Router } from 'express';
import cajaControlador from '../controladores/caja.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

// Rutas del módulo M4 — Caja y Cobros (montadas en /api/v1)
const enrutador = Router();

const CAJA = ['ventas', 'encargado', 'administracion'];

// CU-13 Registrar seña y pagos
enrutador.post('/reservas/:id/pagos', permitir(...CAJA), cajaControlador.registrarPago);
// Anular un pago es una corrección sensible: sólo Administración y Gerencia
enrutador.post('/pagos/:id/anular', permitir('administracion'), cajaControlador.anularPago);
enrutador.get('/caja/movimientos', permitir(...CAJA), cajaControlador.movimientos);
enrutador.get('/caja/pendientes', permitir(...CAJA), cajaControlador.pendientes);

// CU-14 Emitir liquidación final
enrutador.post('/reservas/:id/liquidacion', permitir('encargado', 'administracion'), cajaControlador.emitirLiquidacion);

// CU-15 Emitir reportes de ingresos (RNF05: sólo Gerencia y Administración)
enrutador.get('/reportes', permitir('administracion'), cajaControlador.reportes);

export default enrutador;
