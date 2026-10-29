import { enTransaccion } from '../conexion.bd.mjs';
import reservaModelo from '../modelos/reservas.model.mjs';
import eventoModelo from '../modelos/eventos.model.mjs';
import catalogoModelo from '../modelos/catalogos.model.mjs';
import { detalleReserva } from './agenda.controller.mjs';
import { ESTADOS_TERMINALES } from '../bd/esquema.mjs';
import { ErrorNegocio, manejar, entero, importe, hoy, REGEX_FECHA } from '../utilidades/errores.mjs';
import { redondear } from '../utilidades/calculos.mjs';

// Controlador del módulo M3 — Gestión de Evento
// CU-07 Habilitar evento del día · CU-08 Registrar asistentes reales · CU-09 Registrar consumos adicionales
// CU-10 Asignar coordinadores · CU-11 Gestionar insumos del evento

// Un coordinador cada 15 invitados (criterio relevado con Administración)
const INVITADOS_POR_COORDINADOR = 15;

async function reservaEnCurso(id, bd) {
  const reserva = await reservaModelo.obtenerPorId(id, bd);
  if (!reserva) throw new ErrorNegocio(404, 'La reserva no existe.');
  if (reserva.estado !== 'en_curso') {
    throw new ErrorNegocio(409, 'Primero hay que habilitar el evento del día. Sólo se cargan datos de un evento en curso.');
  }
  return reserva;
}

async function reservaNoTerminal(id) {
  const reserva = await reservaModelo.obtenerPorId(id);
  if (!reserva) throw new ErrorNegocio(404, 'La reserva no existe.');
  if (ESTADOS_TERMINALES.includes(reserva.estado)) {
    throw new ErrorNegocio(409, 'La reserva está cerrada y se muestra en sólo lectura.');
  }
  return reserva;
}

const eventoControlador = {

  // Vista del día para el Encargado de Salón
  // GET /api/v1/eventos/dia?fecha=AAAA-MM-DD
  eventosDelDia: manejar(async (peticion, respuesta) => {
    const fecha = REGEX_FECHA.test(peticion.query.fecha || '') ? peticion.query.fecha : hoy();
    const reservas = await reservaModelo.obtenerPorPeriodo(fecha, fecha, { incluirTerminales: true });
    const vigentes = reservas.filter(r => ['presenada', 'confirmada', 'en_curso', 'realizada'].includes(r.estado));
    const detalles = await Promise.all(vigentes.map(r => detalleReserva(r.id)));
    respuesta.json({ fecha, es_hoy: fecha === hoy(), reservas: detalles });
  }),

  // CU-07 · Habilitar evento del día — transición Confirmada → En curso [llegó la fecha]
  // POST /api/v1/reservas/:id/habilitar
  habilitar: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    await enTransaccion(async (bd) => {
      const reserva = await reservaModelo.obtenerPorId(id, bd);
      if (!reserva) throw new ErrorNegocio(404, 'La reserva no existe.');
      if (reserva.estado === 'presenada') {
        throw new ErrorNegocio(409, 'La reserva todavía no tiene la seña registrada. Registrala en Caja para confirmarla.');
      }
      if (reserva.estado !== 'confirmada') throw new ErrorNegocio(409, 'Sólo se habilita un evento confirmado.');
      if (reserva.fecha !== hoy()) throw new ErrorNegocio(409, `El evento es el ${reserva.fecha}. Sólo se habilita el mismo día.`);

      await eventoModelo.crear(id, peticion.usuario.id, bd);
      await reservaModelo.cambiarEstado(id, 'en_curso', bd);
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'habilitacion', 'Evento habilitado. La reserva pasó a En curso.', bd);
    });
    respuesta.json(await detalleReserva(id));
  }),

  // CU-08 · Registrar asistentes reales (RF07: el excedente se calcula automáticamente)
  // PUT /api/v1/reservas/:id/asistentes   { ninos, adultos }
  registrarAsistentes: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const ninos = entero(peticion.body.ninos);
    const adultos = entero(peticion.body.adultos);
    if (!(ninos >= 0) || !(adultos >= 0)) throw new ErrorNegocio(400, 'Ingresá la cantidad de niños y de adultos (0 o más).');

    await enTransaccion(async (bd) => {
      const reserva = await reservaEnCurso(id, bd);
      await eventoModelo.actualizarAsistentes(id, ninos, adultos, peticion.usuario.id, bd);
      const excedente = Math.max(0, ninos + adultos - reserva.personas_contratadas);
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'asistentes',
        `Asistentes reales: ${ninos} niños y ${adultos} adultos (contratadas ${reserva.personas_contratadas}, excedente ${excedente}).`, bd);
    });
    respuesta.json(await detalleReserva(id));
  }),

  // CU-09 · Registrar consumos adicionales (comanda digital)
  // POST /api/v1/reservas/:id/consumos   { adicional_id, cantidad }  o  { descripcion, precio_unitario, cantidad }
  registrarConsumo: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const cuerpo = peticion.body;
    const cantidad = Number(cuerpo.cantidad ?? 1);
    if (!(cantidad > 0)) throw new ErrorNegocio(400, 'La cantidad debe ser mayor a cero.');

    let descripcion;
    let precioUnitario;
    let adicionalId = null;
    if (cuerpo.adicional_id) {
      const adicional = await catalogoModelo.obtenerAdicional(entero(cuerpo.adicional_id));
      if (!adicional || !adicional.activo) throw new ErrorNegocio(400, 'El adicional elegido no está disponible.');
      adicionalId = adicional.id;
      descripcion = adicional.nombre;
      precioUnitario = Number(adicional.precio);
    } else {
      // Consumo libre que no está en el catálogo
      descripcion = (cuerpo.descripcion || '').trim();
      precioUnitario = importe(cuerpo.precio_unitario);
      if (!descripcion) throw new ErrorNegocio(400, 'Indicá qué se consumió.');
      if (!(precioUnitario > 0)) throw new ErrorNegocio(400, 'Indicá el precio unitario.');
    }

    await enTransaccion(async (bd) => {
      await reservaEnCurso(id, bd);
      await eventoModelo.crearConsumo({
        reserva_id: id, adicional_id: adicionalId, descripcion, cantidad, precio_unitario: precioUnitario,
        registrado_por: peticion.usuario.id
      }, bd);
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'consumo',
        `${cantidad} × ${descripcion} ($${redondear(cantidad * precioUnitario)})`, bd);
    });
    respuesta.status(201).json(await detalleReserva(id));
  }),

  // Un consumo cargado por error no se borra: se anula con motivo (RN09)
  // POST /api/v1/consumos/:id/anular   { motivo }
  anularConsumo: manejar(async (peticion, respuesta) => {
    const motivo = (peticion.body.motivo || '').trim();
    if (!motivo) throw new ErrorNegocio(400, 'Ingresá el motivo de la anulación.');
    const consumo = await eventoModelo.obtenerConsumo(entero(peticion.params.id));
    if (!consumo) throw new ErrorNegocio(404, 'El consumo no existe.');
    if (consumo.anulado) throw new ErrorNegocio(409, 'El consumo ya estaba anulado.');

    await enTransaccion(async (bd) => {
      await reservaEnCurso(consumo.reserva_id, bd);
      await eventoModelo.anularConsumo(consumo.id, motivo, peticion.usuario.id, bd);
      await reservaModelo.registrarHistorial(consumo.reserva_id, peticion.usuario.id, 'anulacion_consumo',
        `Anulado: ${consumo.cantidad} × ${consumo.descripcion}. Motivo: ${motivo}`, bd);
    });
    respuesta.json(await detalleReserva(consumo.reserva_id));
  }),

  // --- CU-10 · Asignar coordinadores ---

  // Grilla de asignaciones del período (por defecto, el fin de semana próximo)
  // GET /api/v1/coordinadores/grilla?desde=&hasta=
  grilla: manejar(async (peticion, respuesta) => {
    const { desde, hasta } = peticion.query;
    if (!REGEX_FECHA.test(desde || '') || !REGEX_FECHA.test(hasta || '')) throw new ErrorNegocio(400, 'Indicá el período.');
    const [reservas, asignaciones, coordinadores] = await Promise.all([
      reservaModelo.obtenerPorPeriodo(desde, hasta, { incluirTerminales: false }),
      eventoModelo.grillaAsignaciones(desde, hasta),
      catalogoModelo.listarCoordinadores({ soloActivos: true })
    ]);
    respuesta.json({
      reservas: reservas.map(r => ({
        ...r,
        coordinadores_sugeridos: Math.max(1, Math.ceil(r.personas_contratadas / INVITADOS_POR_COORDINADOR)),
        asignados: asignaciones.filter(a => a.reserva_id === r.id)
      })),
      coordinadores: coordinadores.map(c => {
        const propias = asignaciones.filter(a => a.coordinador_id === c.id);
        const horas = propias.reduce((suma, a) => suma + Number(a.horas), 0);
        return { ...c, eventos: propias.length, horas, a_liquidar: redondear(horas * Number(c.tarifa_hora)) };
      })
    });
  }),

  // POST /api/v1/reservas/:id/coordinadores   { coordinador_id }
  asignarCoordinador: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const reserva = await reservaNoTerminal(id);
    const coordinador = await catalogoModelo.obtenerCoordinador(entero(peticion.body.coordinador_id));
    if (!coordinador || !coordinador.activo) throw new ErrorNegocio(400, 'Elegí un coordinador activo.');

    // Un coordinador no puede estar en dos eventos al mismo tiempo
    const ocupado = await eventoModelo.coordinadorOcupado(coordinador.id, reserva.fecha, reserva.hora_inicio, reserva.hora_fin, id);
    if (ocupado) {
      throw new ErrorNegocio(409, `${coordinador.nombre} ya está asignado en ${ocupado.sala_nombre} de ${ocupado.hora_inicio} a ${ocupado.hora_fin}.`);
    }

    await enTransaccion(async (bd) => {
      await eventoModelo.asignarCoordinador(id, coordinador.id, peticion.usuario.id, bd);
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'coordinador', `Asignado: ${coordinador.nombre}`, bd);
    });
    respuesta.status(201).json(await detalleReserva(id));
  }),

  // DELETE /api/v1/asignaciones/:id
  quitarAsignacion: manejar(async (peticion, respuesta) => {
    const asignacion = await eventoModelo.quitarAsignacion(entero(peticion.params.id));
    if (!asignacion) throw new ErrorNegocio(404, 'La asignación no existe.');
    const coordinador = await catalogoModelo.obtenerCoordinador(asignacion.coordinador_id);
    await reservaModelo.registrarHistorial(asignacion.reserva_id, peticion.usuario.id, 'coordinador', `Quitado: ${coordinador.nombre}`);
    respuesta.json(await detalleReserva(asignacion.reserva_id));
  }),

  // --- CU-11 · Gestionar insumos del evento ---

  // RF13: genera el pedido a partir del paquete y la cantidad de invitados contratada
  // POST /api/v1/reservas/:id/insumos/generar
  generarPedido: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const reserva = await reservaNoTerminal(id);
    const insumos = await eventoModelo.insumosDelPaquete(reserva.paquete_id);
    if (insumos.length === 0) {
      throw new ErrorNegocio(409, `El paquete ${reserva.paquete_nombre} no tiene insumos configurados. Cargalos en Configuración > Paquetes.`);
    }

    await enTransaccion(async (bd) => {
      for (const insumo of insumos) {
        // Se redondea hacia arriba: no se compra media bolsa de hielo
        const cantidad = Math.ceil(Number(insumo.cantidad_por_persona) * reserva.personas_contratadas);
        await eventoModelo.guardarLineaPedido(id, insumo.insumo_id, cantidad, redondear(cantidad * Number(insumo.costo_unitario)), peticion.usuario.id, bd);
      }
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'insumos',
        `Pedido de insumos generado para ${reserva.personas_contratadas} personas.`, bd);
    });
    respuesta.json(await detalleReserva(id));
  }),

  // RF14: registra la recepción del insumo y su costo real
  // POST /api/v1/pedidos-insumos/:id/recibir   { costo_real }
  recibirInsumo: manejar(async (peticion, respuesta) => {
    const linea = await eventoModelo.obtenerLineaPedido(entero(peticion.params.id));
    if (!linea) throw new ErrorNegocio(404, 'La línea del pedido no existe.');
    if (linea.recibido) throw new ErrorNegocio(409, 'Ese insumo ya figura como recibido.');
    await reservaNoTerminal(linea.reserva_id);
    const costoReal = peticion.body.costo_real === undefined || peticion.body.costo_real === ''
      ? Number(linea.costo_estimado)
      : importe(peticion.body.costo_real);
    if (!(costoReal >= 0)) throw new ErrorNegocio(400, 'Ingresá el costo real del insumo.');

    await eventoModelo.registrarRecepcion(linea.id, costoReal, peticion.usuario.id);
    respuesta.json(await detalleReserva(linea.reserva_id));
  }),

  // Resumen de próximas reservas con el estado de su pedido
  // GET /api/v1/insumos/pedidos?desde=&hasta=
  resumenPedidos: manejar(async (peticion, respuesta) => {
    const { desde, hasta } = peticion.query;
    if (!REGEX_FECHA.test(desde || '') || !REGEX_FECHA.test(hasta || '')) throw new ErrorNegocio(400, 'Indicá el período.');
    const [reservas, resumen] = await Promise.all([
      reservaModelo.obtenerPorPeriodo(desde, hasta, { incluirTerminales: false }),
      eventoModelo.resumenPedidos(desde, hasta)
    ]);
    const porReserva = Object.fromEntries(resumen.map(fila => [fila.reserva_id, fila]));
    respuesta.json(reservas.map(r => ({ ...r, pedido: porReserva[r.id] })));
  })
};

export default eventoControlador;
