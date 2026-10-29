import { Router } from 'express';
import agendaControlador from '../controladores/agenda.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

// Rutas del módulo M1 — Agenda y Reservas (montadas en /api/v1, todas requieren sesión)
const enrutador = Router();

const VENTAS = ['ventas', 'administracion'];

// CU-04 Visualizar agenda y CU-01 Consultar disponibilidad (el Encargado de Salón también puede mirar)
enrutador.get('/agenda', agendaControlador.obtenerAgenda);
enrutador.get('/agenda/disponibilidad', agendaControlador.consultarDisponibilidad);

// CU-12 Generar presupuesto (antes de /:id para que no lo tome como identificador)
enrutador.get('/reservas/presupuesto', permitir(...VENTAS), agendaControlador.presupuesto);

// CU-02 Registrar reserva y CU-03 Modificar o cancelar reserva
enrutador.post('/reservas', permitir(...VENTAS), agendaControlador.registrarReserva);
enrutador.get('/reservas/:id', agendaControlador.obtenerReserva);
enrutador.put('/reservas/:id', permitir(...VENTAS), agendaControlador.modificarReserva);
enrutador.post('/reservas/:id/cancelar', permitir(...VENTAS), agendaControlador.cancelarReserva);

export default enrutador;
