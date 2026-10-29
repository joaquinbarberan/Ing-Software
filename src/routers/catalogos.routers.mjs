import { Router } from 'express';
import catalogoControlador from '../controladores/catalogos.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

// Rutas de configuración de catálogos (montadas en /api/v1/catalogos).
// Todos pueden consultarlos; sólo Administración y Gerencia los modifican.
const enrutador = Router();

const ADMIN = permitir('administracion');

enrutador.get('/paquetes', catalogoControlador.listarPaquetes);
enrutador.post('/paquetes', ADMIN, catalogoControlador.guardarPaquete);
enrutador.put('/paquetes/:id', ADMIN, catalogoControlador.guardarPaquete);

enrutador.get('/adicionales', catalogoControlador.listarAdicionales);
enrutador.post('/adicionales', ADMIN, catalogoControlador.guardarAdicional);
enrutador.put('/adicionales/:id', ADMIN, catalogoControlador.guardarAdicional);

enrutador.get('/insumos', catalogoControlador.listarInsumos);
enrutador.post('/insumos', ADMIN, catalogoControlador.guardarInsumo);
enrutador.put('/insumos/:id', ADMIN, catalogoControlador.guardarInsumo);

enrutador.get('/coordinadores', catalogoControlador.listarCoordinadores);
enrutador.post('/coordinadores', ADMIN, catalogoControlador.guardarCoordinador);
enrutador.put('/coordinadores/:id', ADMIN, catalogoControlador.guardarCoordinador);

export default enrutador;
