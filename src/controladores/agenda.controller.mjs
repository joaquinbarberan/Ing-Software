import { enTransaccion } from '../conexion.bd.mjs';
import reservaModelo from '../modelos/reservas.model.mjs';
import clienteModelo from '../modelos/clientes.model.mjs';
import catalogoModelo from '../modelos/catalogos.model.mjs';
import salaModelo from '../modelos/salas.model.mjs';
import eventoModelo from '../modelos/eventos.model.mjs';
import cajaModelo from '../modelos/caja.model.mjs';
import { ESTADOS_TERMINALES } from '../bd/esquema.mjs';
import { tienePermiso } from '../middleware/permisos.mjs';
import { ErrorNegocio, manejar, entero, importe, hoy, REGEX_FECHA, REGEX_HORA } from '../utilidades/errores.mjs';
import {
  precioPara, senaPara, calcularLiquidacion, horarioLibreMasCercano, horariosLibres, aHora,
  HORA_APERTURA, HORA_CIERRE, PORCENTAJE_SENA
} from '../utilidades/calculos.mjs';
import solicitudModelo from '../modelos/solicitudes.model.mjs';

// =====================================================================================
// GestorAgenda — clase de control del módulo M1 (Figura 5 — Diagrama de clases).
// Concentra la coordinación del módulo, incluida la verificación de superposición (RN01):
// una reserva individual no puede saber si se pisa con otra, por eso la regla vive acá.
// =====================================================================================

// --- Validaciones comunes ---

function validarFranja(fecha, horaInicio, horaFin) {
  if (!REGEX_FECHA.test(fecha || '')) throw new ErrorNegocio(400, 'Ingresá una fecha válida.');
  if (!REGEX_HORA.test(horaInicio || '') || !REGEX_HORA.test(horaFin || '')) {
    throw new ErrorNegocio(400, 'Ingresá la hora de inicio y de fin.');
  }
  const inicio = horaInicio.slice(0, 5);
  const fin = horaFin.slice(0, 5);
  if (fin <= inicio) throw new ErrorNegocio(400, 'La hora de fin debe ser posterior a la de inicio.');
  if (inicio < HORA_APERTURA || fin > HORA_CIERRE) {
    throw new ErrorNegocio(400, `El salón atiende de ${HORA_APERTURA} a ${HORA_CIERRE} hs.`);
  }
  // Flujo A3 de CU-01: no se puede consultar ni reservar una fecha pasada
  if (fecha < hoy()) throw new ErrorNegocio(400, 'La fecha es anterior a la actual. Corregila antes de continuar.');
  return { inicio, fin };
}

async function obtenerSalaValida(salaId) {
  const sala = await salaModelo.obtenerPorId(entero(salaId));
  if (!sala) throw new ErrorNegocio(400, 'Seleccioná una sala válida.');
  return sala;
}

// Expira las preseñadas vencidas antes de mirar la agenda, así la consulta nunca
// informa como ocupada una fecha que ya debería estar libre (RN03).
async function expirarPresenadas() {
  const vencidas = await reservaModelo.expirarPresenadas();
  for (const id of vencidas) {
    await reservaModelo.registrarHistorial(id, null, 'expiracion', 'Pasaron 72 horas sin registrar la seña. La fecha quedó liberada.');
  }
  return vencidas;
}

// Calcula importe y seña según el paquete (CU-12 Generar presupuesto)
async function calcularPresupuesto({ paqueteId, personas, importeManual, usuario }) {
  const paquete = await catalogoModelo.obtenerPaquete(entero(paqueteId));
  if (!paquete || !paquete.activo) throw new ErrorNegocio(400, 'Seleccioná un paquete vigente.');

  let importeEstimado;
  if (paquete.es_personalizado) {
    // Flujo A2 de CU-02: el paquete a medida requiere perfil Administración
    if (!tienePermiso(usuario, 'administracion')) {
      throw new ErrorNegocio(403, 'El paquete personalizado sólo puede cargarlo Administración.');
    }
    importeEstimado = importe(importeManual);
    if (!(importeEstimado > 0)) throw new ErrorNegocio(400, 'Ingresá el importe del paquete personalizado.');
  } else {
    importeEstimado = precioPara(paquete, personas);
  }

  return { paquete, importe_estimado: importeEstimado, sena_requerida: senaPara(importeEstimado) };
}

function validarPersonas(valor, sala) {
  const personas = entero(valor);
  if (!(personas > 0)) throw new ErrorNegocio(400, 'Ingresá la cantidad de personas contratadas.');
  const capacidad = sala.capacidad_ninos + sala.capacidad_adultos;
  if (capacidad > 0 && personas > capacidad) {
    throw new ErrorNegocio(400, `La ${sala.nombre} admite hasta ${capacidad} personas.`);
  }
  return personas;
}

function describirOcupacion(reserva) {
  return `${reserva.sala_nombre} ya tiene un evento de ${reserva.hora_inicio} a ${reserva.hora_fin} (${reserva.cliente_apellido}, ${reserva.estado}).`;
}

// Detalle completo de la reserva con todo lo que cuelga de ella (evento, caja, etc.)
async function detalleReserva(id) {
  const reserva = await reservaModelo.obtenerPorId(id);
  if (!reserva) return null;

  const [evento, consumos, pagos, asignaciones, pedido, liquidacion, historial, totalAdicionales, totalPagado] = await Promise.all([
    eventoModelo.obtenerPorReserva(id),
    eventoModelo.listarConsumos(id),
    cajaModelo.listarPagos(id),
    eventoModelo.listarAsignaciones(id),
    eventoModelo.listarPedido(id),
    cajaModelo.obtenerLiquidacion(id),
    reservaModelo.obtenerHistorial(id),
    eventoModelo.totalConsumos(id),
    cajaModelo.totalPagado(id)
  ]);

  return {
    ...reserva,
    solo_lectura: ESTADOS_TERMINALES.includes(reserva.estado),
    evento: evento || null,
    consumos,
    pagos,
    asignaciones,
    pedido_insumos: pedido,
    liquidacion: liquidacion || null,
    historial,
    // Estado de cuenta en vivo (si ya hay liquidación emitida, la foto guardada manda)
    cuenta: calcularLiquidacion({ reserva, evento, totalAdicionales, totalPagado })
  };
}


// =====================================================================================
// Horarios libres (mejora de reservas, ver CAMBIOS.md).
// En lugar de que el usuario tipee hora y minutos y pruebe hasta acertar, el sistema
// calcula todos los horarios de inicio en los que el evento entra sin superponerse (RN01).
// =====================================================================================

// Hora mínima de inicio: si la fecha es hoy no se ofrecen horarios que ya pasaron
// (más un margen para preparar el salón). Para otra fecha, la apertura.
function minimoInicio(fecha, margenMinutos) {
  if (fecha !== hoy()) return HORA_APERTURA;
  const ahora = new Date();
  return aHora(Math.min(23 * 60 + 59, ahora.getHours() * 60 + ahora.getMinutes() + margenMinutos));
}

// Duración del evento: la del paquete elegido o, si no hay paquete, la indicada en horas (4 por defecto)
async function duracionPedida({ paqueteId, horas, soloPublicos = false }) {
  if (paqueteId) {
    const paquete = await catalogoModelo.obtenerPaquete(entero(paqueteId));
    if (!paquete || !paquete.activo || (soloPublicos && paquete.es_personalizado)) {
      throw new ErrorNegocio(400, 'Elegí un paquete vigente.');
    }
    return { paquete, minutos: paquete.duracion_horas * 60 };
  }
  const valor = horas === undefined || horas === '' ? 4 : Number(horas);
  if (!(valor >= 1 && valor <= 14)) throw new ErrorNegocio(400, 'La duración debe estar entre 1 y 14 horas.');
  return { paquete: null, minutos: Math.round(valor * 60) };
}

function capacidadDe(sala) {
  return sala.capacidad_ninos + sala.capacidad_adultos;
}

// Salas donde entran las personas indicadas (capacidad 0 = sin límite cargado)
function salasParaPersonas(salas, personas) {
  if (!(personas > 0)) return salas;
  return salas.filter(sala => capacidadDe(sala) === 0 || capacidadDe(sala) >= personas);
}

// Devuelve, para cada fecha del período, los horarios libres de cada sala.
// Hace UNA sola consulta a la base para todo el período, así el calendario mensual responde rápido (R04.6).
async function horariosDelPeriodo(desde, hasta, salas, minutos, { margenHoy = 0, excluirId = null, paso = 30 } = {}) {
  const ocupadas = (await reservaModelo.obtenerFranjasOcupadas(desde, hasta)).filter(r => r.id !== excluirId);
  const porFecha = new Map();
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    const minimo = minimoInicio(fecha, margenHoy);
    porFecha.set(fecha, salas.map(sala => ({
      sala,
      horarios: fecha < hoy() ? [] : horariosLibres(
        ocupadas.filter(r => r.sala_id === sala.id && r.fecha === fecha), minutos, minimo, paso)
    })));
  }
  return porFecha;
}

function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  const nueva = new Date(Date.UTC(a, m - 1, d + dias));
  return nueva.toISOString().slice(0, 10);
}

function ultimoDiaDelMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

// En la web pública se pide un margen de 2 horas para reservar en el mismo día,
// y los horarios se ofrecen cada una hora (más los que quedan justo al terminar otro evento)
const MARGEN_PUBLICO_MINUTOS = 120;
const PASO_PUBLICO_MINUTOS = 60;

function salaPublica(sala) {
  return {
    id: sala.id, nombre: sala.nombre, capacidad: capacidadDe(sala),
    capacidad_ninos: sala.capacidad_ninos, capacidad_adultos: sala.capacidad_adultos,
    imagen: sala.imagen, alt_imagen: sala.alt_imagen
  };
}

const agendaControlador = {

  // CU-01 · Consultar disponibilidad
  // GET /api/v1/agenda/disponibilidad?fecha=AAAA-MM-DD&desde=HH:MM&hasta=HH:MM&sala_id=1
  consultarDisponibilidad: manejar(async (peticion, respuesta) => {
    const { fecha, desde, hasta, sala_id: salaId } = peticion.query;
    const { inicio, fin } = validarFranja(fecha, desde, hasta);
    const sala = await obtenerSalaValida(salaId);

    await expirarPresenadas();

    // Paso 5: se recuperan las reservas preseñadas y confirmadas que se superponen con la franja
    const superpuestas = await reservaModelo.buscarSuperpuestas(sala.id, fecha, inicio, fin);
    // Paso 7: los eventos ya agendados ese día (en todas las salas, para tener el panorama)
    const delDia = await reservaModelo.obtenerPorPeriodo(fecha, fecha, { incluirTerminales: false });

    const resultado = {
      fecha, hora_inicio: inicio, hora_fin: fin,
      sala: { id: sala.id, nombre: sala.nombre },
      disponible: superpuestas.length === 0,
      ocupada_por: superpuestas,
      eventos_del_dia: delDia,
      sugerencia: null
    };

    // Flujo A2: si la franja está ocupada, se sugiere el horario libre más cercano del mismo día
    if (!resultado.disponible) {
      const ocupadasSala = delDia.filter(r => r.sala_id === sala.id);
      const ahora = new Date();
      const minimo = fecha === hoy() ? `${String(ahora.getHours() + 1).padStart(2, '0')}:00` : HORA_APERTURA;
      resultado.sugerencia = horarioLibreMasCercano(ocupadasSala, inicio, fin, minimo);
    }

    respuesta.json(resultado);
  }),

  // Consulta pública para la web del salón: sólo devuelve las franjas ocupadas, sin datos de clientes.
  // El cliente no reserva por su cuenta (queda fuera de la frontera del sistema, sección 10.3):
  // ve qué horarios están libres y la reserva la sigue cargando el área de Ventas.
  // GET /disponibilidad?fecha=AAAA-MM-DD&sala_id=1
  disponibilidadPublica: manejar(async (peticion, respuesta) => {
    const { fecha, sala_id: salaId } = peticion.query;
    if (!REGEX_FECHA.test(fecha || '')) throw new ErrorNegocio(400, 'Elegí una fecha.');
    if (fecha < hoy()) throw new ErrorNegocio(400, 'La fecha ya pasó.');
    const sala = await obtenerSalaValida(salaId);
    await expirarPresenadas();
    const ocupadas = await reservaModelo.obtenerVigentesDeSala(sala.id, fecha);
    respuesta.json({
      fecha,
      sala: sala.nombre,
      horario: { apertura: HORA_APERTURA, cierre: HORA_CIERRE },
      ocupadas: ocupadas.map(r => ({ hora_inicio: r.hora_inicio, hora_fin: r.hora_fin }))
    });
  }),


  // Horarios libres de una sala en una fecha, para elegirlos con un clic en "Nueva reserva"
  // y al modificar una reserva (excluir_id = la propia reserva, que no se pisa consigo misma).
  // GET /api/v1/agenda/horarios?fecha=&sala_id=&paquete_id=|duracion=&excluir_id=
  horariosDisponibles: manejar(async (peticion, respuesta) => {
    const { fecha, sala_id: salaId, paquete_id: paqueteId, duracion, excluir_id: excluirId } = peticion.query;
    if (!REGEX_FECHA.test(fecha || '')) throw new ErrorNegocio(400, 'Elegí una fecha.');
    const sala = await obtenerSalaValida(salaId);
    const { minutos } = await duracionPedida({ paqueteId, horas: duracion });
    await expirarPresenadas();
    const porFecha = await horariosDelPeriodo(fecha, fecha, [sala], minutos, {
      margenHoy: 0, excluirId: excluirId ? entero(excluirId) : null
    });
    respuesta.json({
      fecha, sala_id: sala.id, duracion_minutos: minutos,
      horario: { apertura: HORA_APERTURA, cierre: HORA_CIERRE },
      horarios: porFecha.get(fecha)[0].horarios
    });
  }),

  // --- API PÚBLICA de la página de reservas (sin datos de clientes) ---

  // Paquetes que el cliente puede elegir en la web (el personalizado lo arma Administración)
  // GET /paquetes
  paquetesPublicos: manejar(async (peticion, respuesta) => {
    const paquetes = await catalogoModelo.listarPaquetes({ soloActivos: true });
    respuesta.json(paquetes.filter(p => !p.es_personalizado).map(p => ({
      id: p.id, nombre: p.nombre, descripcion: p.descripcion, precio_base: p.precio_base,
      personas_incluidas: p.personas_incluidas, duracion_horas: p.duracion_horas,
      tarifa_excedente: p.tarifa_excedente, porcentaje_sena: PORCENTAJE_SENA
    })));
  }),

  // Calendario del mes: para cada día, cuántos horarios quedan libres en las salas donde entran los invitados.
  // GET /disponibilidad/mes?mes=AAAA-MM&paquete_id=&personas=
  calendarioPublico: manejar(async (peticion, respuesta) => {
    const { mes, paquete_id: paqueteId } = peticion.query;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) throw new ErrorNegocio(400, 'Indicá el mes (AAAA-MM).');
    const limite = sumarDias(hoy(), 540);
    if (`${mes}-01` > limite) throw new ErrorNegocio(400, 'Todavía no se toman reservas para esa fecha.');

    const { minutos } = await duracionPedida({ paqueteId, horas: peticion.query.duracion, soloPublicos: true });
    const salas = salasParaPersonas(await salaModelo.obtenerTodas(), entero(peticion.query.personas));
    await expirarPresenadas();

    const desde = `${mes}-01`;
    const porFecha = await horariosDelPeriodo(desde, ultimoDiaDelMes(mes), salas, minutos, { margenHoy: MARGEN_PUBLICO_MINUTOS, paso: PASO_PUBLICO_MINUTOS });

    const dias = [...porFecha.entries()].map(([fecha, lista]) => {
      const libres = lista.reduce((total, item) => total + item.horarios.length, 0);
      const salasLibres = lista.filter(item => item.horarios.length > 0).length;
      let estado = 'libre';
      if (fecha < hoy()) estado = 'pasado';
      else if (libres === 0) estado = 'completo';
      else if (libres <= 4) estado = 'pocos';
      return { fecha, estado, horarios_libres: libres, salas_libres: salasLibres };
    });

    respuesta.json({ mes, duracion_minutos: minutos, salas_consideradas: salas.length, dias });
  }),

  // Horarios libres de un día, sala por sala, listos para elegir con un clic.
  // GET /disponibilidad/dia?fecha=&paquete_id=&personas=
  horariosPublicos: manejar(async (peticion, respuesta) => {
    const { fecha, paquete_id: paqueteId } = peticion.query;
    if (!REGEX_FECHA.test(fecha || '')) throw new ErrorNegocio(400, 'Elegí una fecha.');
    if (fecha < hoy()) throw new ErrorNegocio(400, 'La fecha ya pasó.');
    const { minutos } = await duracionPedida({ paqueteId, horas: peticion.query.duracion, soloPublicos: true });
    const todas = await salaModelo.obtenerTodas();
    const salas = salasParaPersonas(todas, entero(peticion.query.personas));
    await expirarPresenadas();
    const porFecha = await horariosDelPeriodo(fecha, fecha, salas, minutos, { margenHoy: MARGEN_PUBLICO_MINUTOS, paso: PASO_PUBLICO_MINUTOS });
    respuesta.json({
      fecha, duracion_minutos: minutos,
      horario: { apertura: HORA_APERTURA, cierre: HORA_CIERRE },
      salas: porFecha.get(fecha).map(({ sala, horarios }) => ({ ...salaPublica(sala), horarios })),
      // Salas que existen pero donde no entran los invitados indicados
      salas_chicas: todas.filter(s => !salas.includes(s)).map(s => ({ id: s.id, nombre: s.nombre, capacidad: capacidadDe(s) }))
    });
  }),

  // CU-04 · Visualizar agenda
  // GET /api/v1/agenda?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&sala_id=
  obtenerAgenda: manejar(async (peticion, respuesta) => {
    const { desde, hasta, sala_id: salaId } = peticion.query;
    if (!REGEX_FECHA.test(desde || '') || !REGEX_FECHA.test(hasta || '')) {
      throw new ErrorNegocio(400, 'Indicá el período a consultar.');
    }
    await expirarPresenadas();
    const reservas = await reservaModelo.obtenerPorPeriodo(desde, hasta, { salaId: salaId ? entero(salaId) : null });
    respuesta.json(reservas);
  }),

  // CU-12 · Generar presupuesto (se usa en vivo mientras se completa el formulario de reserva)
  // GET /api/v1/reservas/presupuesto?paquete_id=&personas=&importe_manual=
  presupuesto: manejar(async (peticion, respuesta) => {
    const personas = entero(peticion.query.personas);
    if (!(personas > 0)) throw new ErrorNegocio(400, 'Ingresá la cantidad de personas.');
    const calculo = await calcularPresupuesto({
      paqueteId: peticion.query.paquete_id, personas, importeManual: peticion.query.importe_manual, usuario: peticion.usuario
    });
    respuesta.json({
      paquete: calculo.paquete.nombre,
      personas,
      importe_estimado: calculo.importe_estimado,
      sena_requerida: calculo.sena_requerida,
      porcentaje_sena: PORCENTAJE_SENA
    });
  }),

  // CU-02 · Registrar reserva
  // POST /api/v1/reservas
  registrarReserva: manejar(async (peticion, respuesta) => {
    const datos = peticion.body;
    const usuario = peticion.usuario;

    // E2: datos obligatorios
    const clienteId = entero(datos.cliente_id);
    if (!(clienteId > 0)) throw new ErrorNegocio(400, 'Buscá o registrá al cliente antes de guardar.');
    const cliente = await clienteModelo.obtenerPorId(clienteId);
    if (!cliente) throw new ErrorNegocio(400, 'El cliente indicado no existe.');

    const { inicio, fin } = validarFranja(datos.fecha, datos.hora_inicio, datos.hora_fin);
    const sala = await obtenerSalaValida(datos.sala_id);
    const personas = validarPersonas(datos.personas_contratadas, sala);
    const calculo = await calcularPresupuesto({ paqueteId: datos.paquete_id, personas, importeManual: datos.importe_manual, usuario });

    await expirarPresenadas();

    const nuevoId = await enTransaccion(async (bd) => {
      // Paso 8: se verifica NUEVAMENTE la superposición, con la sala y fecha bloqueadas
      // para que otro operador no pueda tomar la franja entre la verificación y el alta.
      await reservaModelo.bloquearSalaFecha(sala.id, datos.fecha, bd);
      const superpuestas = await reservaModelo.buscarSuperpuestas(sala.id, datos.fecha, inicio, fin, null, bd);
      if (superpuestas.length > 0) {
        // E1: superposición detectada al guardar
        throw new ErrorNegocio(409, `La franja ya no está disponible: ${describirOcupacion(superpuestas[0])}`, {
          conflicto: superpuestas[0]
        });
      }

      // Paso 9: la reserva nace Preseñada
      const id = await reservaModelo.crear({
        sala_id: sala.id, cliente_id: cliente.id, paquete_id: calculo.paquete.id,
        fecha: datos.fecha, hora_inicio: inicio, hora_fin: fin,
        personas_contratadas: personas, importe_estimado: calculo.importe_estimado,
        sena_requerida: calculo.sena_requerida, observaciones: datos.observaciones, creado_por: usuario.id
      }, bd);

      // R02.7: queda registrado qué usuario dio de alta la reserva, con fecha y hora
      await reservaModelo.registrarHistorial(id, usuario.id, 'alta',
        `Reserva creada en ${sala.nombre} para el ${datos.fecha} de ${inicio} a ${fin}. Paquete ${calculo.paquete.nombre}, ${personas} personas.`, bd);

      // Si la reserva nace de una solicitud de la web, la solicitud queda marcada como atendida
      // dentro de la misma transacción (si algo falla, no queda una a medias).
      const solicitudId = entero(datos.solicitud_id);
      if (solicitudId > 0) {
        const marcada = await solicitudModelo.marcarConvertida(solicitudId, id, usuario.id, bd);
        if (!marcada) throw new ErrorNegocio(409, 'Esa solicitud web ya fue atendida por otro usuario. Revisá la bandeja de solicitudes.');
        await reservaModelo.registrarHistorial(id, usuario.id, 'solicitud_web',
          `Reserva generada a partir de la solicitud web N.º ${solicitudId}.`, bd);
      }
      return id;
    });

    respuesta.status(201).json(await detalleReserva(nuevoId));
  }),

  // GET /api/v1/reservas/:id
  obtenerReserva: manejar(async (peticion, respuesta) => {
    const detalle = await detalleReserva(entero(peticion.params.id));
    if (!detalle) throw new ErrorNegocio(404, 'La reserva no existe.');
    respuesta.json(detalle);
  }),

  // CU-03 · Modificar reserva (flujo principal y A3)
  // PUT /api/v1/reservas/:id
  modificarReserva: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const datos = peticion.body;
    const usuario = peticion.usuario;

    await expirarPresenadas();

    await enTransaccion(async (bd) => {
      const actual = await reservaModelo.obtenerPorId(id, bd);
      if (!actual) throw new ErrorNegocio(404, 'La reserva no existe.');
      // RN08 / R03.8: sólo se modifica una reserva Preseñada o Confirmada
      if (!['presenada', 'confirmada'].includes(actual.estado)) {
        throw new ErrorNegocio(409, 'La reserva está en un estado que no admite modificaciones.');
      }

      const fecha = datos.fecha || actual.fecha;
      const horaInicio = (datos.hora_inicio || actual.hora_inicio).slice(0, 5);
      const horaFin = (datos.hora_fin || actual.hora_fin).slice(0, 5);
      const salaId = datos.sala_id ? entero(datos.sala_id) : actual.sala_id;
      const cambiaFranja = fecha !== actual.fecha || horaInicio !== actual.hora_inicio ||
                           horaFin !== actual.hora_fin || salaId !== actual.sala_id;

      const sala = await obtenerSalaValida(salaId);
      if (cambiaFranja) validarFranja(fecha, horaInicio, horaFin);
      const personas = validarPersonas(datos.personas_contratadas ?? actual.personas_contratadas, sala);

      // Recalculo del importe: si el paquete es personalizado se mantiene el importe salvo que Administración lo cambie
      let importeEstimado = Number(actual.importe_estimado);
      if (actual.paquete_personalizado) {
        if (datos.importe_manual !== undefined && datos.importe_manual !== '' && Number(datos.importe_manual) !== importeEstimado) {
          const calculo = await calcularPresupuesto({ paqueteId: actual.paquete_id, personas, importeManual: datos.importe_manual, usuario });
          importeEstimado = calculo.importe_estimado;
        }
      } else {
        const paquete = await catalogoModelo.obtenerPaquete(actual.paquete_id, bd);
        importeEstimado = precioPara(paquete, personas);
      }

      // A3: si sólo cambia la cantidad de personas se omite la verificación de superposición
      if (cambiaFranja) {
        await reservaModelo.bloquearSalaFecha(salaId, fecha, bd);
        const superpuestas = await reservaModelo.buscarSuperpuestas(salaId, fecha, horaInicio, horaFin, id, bd);
        if (superpuestas.length > 0) {
          // E1: la nueva franja está ocupada, la reserva queda en su franja original
          throw new ErrorNegocio(409, `No se aplicó el cambio: ${describirOcupacion(superpuestas[0])}`, { conflicto: superpuestas[0] });
        }
      }

      await reservaModelo.actualizarDatos(id, {
        sala_id: salaId, fecha, hora_inicio: horaInicio, hora_fin: horaFin, personas_contratadas: personas,
        importe_estimado: importeEstimado, sena_requerida: senaPara(importeEstimado),
        observaciones: datos.observaciones ?? actual.observaciones
      }, bd);

      // R03.6: se registra usuario, fecha, hora y qué cambió
      const cambios = [];
      if (salaId !== actual.sala_id) cambios.push(`sala ${actual.sala_nombre} a ${sala.nombre}`);
      if (fecha !== actual.fecha) cambios.push(`fecha ${actual.fecha} a ${fecha}`);
      if (horaInicio !== actual.hora_inicio || horaFin !== actual.hora_fin) {
        cambios.push(`horario ${actual.hora_inicio}-${actual.hora_fin} a ${horaInicio}-${horaFin}`);
      }
      if (personas !== actual.personas_contratadas) cambios.push(`personas ${actual.personas_contratadas} a ${personas}`);
      if (importeEstimado !== Number(actual.importe_estimado)) cambios.push(`importe $${actual.importe_estimado} a $${importeEstimado}`);
      if ((datos.observaciones ?? actual.observaciones) !== actual.observaciones) cambios.push('observaciones');
      const motivo = (datos.motivo || '').trim();

      await reservaModelo.registrarHistorial(id, usuario.id, 'modificacion',
        (cambios.length ? cambios.join('; ') : 'Sin cambios') + (motivo ? `. Motivo: ${motivo}` : ''), bd);
    });

    respuesta.json(await detalleReserva(id));
  }),

  // CU-03 · Cancelar reserva (flujo A1)
  // POST /api/v1/reservas/:id/cancelar   { motivo }
  cancelarReserva: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const motivo = (peticion.body.motivo || '').trim();
    // E2: el motivo es obligatorio
    if (!motivo) throw new ErrorNegocio(400, 'Ingresá el motivo de la cancelación.');

    await enTransaccion(async (bd) => {
      const actual = await reservaModelo.obtenerPorId(id, bd);
      if (!actual) throw new ErrorNegocio(404, 'La reserva no existe.');
      if (!['presenada', 'confirmada'].includes(actual.estado)) {
        throw new ErrorNegocio(409, 'La reserva está en un estado que no admite cancelación.');
      }
      // R03.5: la fecha se libera de inmediato porque Cancelada deja de bloquear la franja
      await reservaModelo.cancelar(id, motivo, bd);
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'cancelacion', `Motivo: ${motivo}`, bd);
    });

    respuesta.json(await detalleReserva(id));
  })
};

export { detalleReserva, expirarPresenadas };
export default agendaControlador;
