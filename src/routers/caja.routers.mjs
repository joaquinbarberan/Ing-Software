import { Router } from 'express';
import multer from 'multer';
import cajaControlador from '../controladores/caja.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

// Rutas del módulo M4 — Caja y Cobros (montadas en /api/v1)
const enrutador = Router();

const CAJA = ['ventas', 'encargado', 'administracion'];

// El PDF se recibe en memoria y se guarda en la base. Límite de 4 MB: Vercel no acepta peticiones de más de 4,5 MB.
const subirPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } }).single('archivo');

// CU-13 Registrar seña y pagos
enrutador.post('/reservas/:id/pagos', permitir(...CAJA), cajaControlador.registrarPago);
// Mercado Pago: link de pago de la seña o el saldo, y verificación manual de pagos
enrutador.get('/mercadopago/estado', cajaControlador.estadoMercadoPago);
enrutador.post('/reservas/:id/mercadopago', permitir(...CAJA), cajaControlador.linkMercadoPago);
enrutador.post('/reservas/:id/mercadopago/verificar', permitir(...CAJA), cajaControlador.verificarMercadoPago);
// Comprobante en PDF de un pago
enrutador.post('/pagos/:id/comprobante-pdf', permitir(...CAJA), subirPdf, cajaControlador.subirComprobantePdf);
enrutador.get('/pagos/:id/comprobante-pdf', permitir(...CAJA), cajaControlador.verComprobantePdf);
// Anular un pago es una corrección sensible: sólo Administración y Gerencia
enrutador.post('/pagos/:id/anular', permitir('administracion'), cajaControlador.anularPago);
enrutador.get('/caja/movimientos', permitir(...CAJA), cajaControlador.movimientos);
enrutador.get('/caja/pendientes', permitir(...CAJA), cajaControlador.pendientes);

// CU-14 Emitir liquidación final
enrutador.post('/reservas/:id/liquidacion', permitir('encargado', 'administracion'), cajaControlador.emitirLiquidacion);

// CU-15 Emitir reportes de ingresos (RNF05: sólo Gerencia y Administración)
enrutador.get('/reportes', permitir('administracion'), cajaControlador.reportes);

export default enrutador;
