import { Router } from 'express';
import eventoControlador from '../controladores/eventos.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

// Rutas del módulo M3 — Gestión de Evento (montadas en /api/v1)
const enrutador = Router();

const SALON = ['encargado', 'administracion'];

// CU-07, CU-08 y CU-09: operación del evento del día
enrutador.get('/eventos/dia', eventoControlador.eventosDelDia);
enrutador.post('/reservas/:id/habilitar', permitir(...SALON), eventoControlador.habilitar);
enrutador.put('/reservas/:id/asistentes', permitir(...SALON), eventoControlador.registrarAsistentes);
enrutador.post('/reservas/:id/consumos', permitir(...SALON), eventoControlador.registrarConsumo);
enrutador.post('/consumos/:id/anular', permitir(...SALON), eventoControlador.anularConsumo);

// CU-10 Asignar coordinadores (Administración)
enrutador.get('/coordinadores/grilla', eventoControlador.grilla);
enrutador.post('/reservas/:id/coordinadores', permitir('administracion'), eventoControlador.asignarCoordinador);
enrutador.delete('/asignaciones/:id', permitir('administracion'), eventoControlador.quitarAsignacion);

// CU-11 Gestionar insumos del evento (Administración)
enrutador.get('/insumos/pedidos', permitir('administracion'), eventoControlador.resumenPedidos);
enrutador.post('/reservas/:id/insumos/generar', permitir('administracion'), eventoControlador.generarPedido);
enrutador.post('/pedidos-insumos/:id/recibir', permitir('administracion'), eventoControlador.recibirInsumo);

export default enrutador;
