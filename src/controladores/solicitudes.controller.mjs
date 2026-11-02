
import solicitudModelo from '../modelos/solicitudes.model.mjs';
import reservaModelo from '../modelos/reservas.model.mjs';
import salaModelo from '../modelos/salas.model.mjs';
import catalogoModelo from '../modelos/catalogos.model.mjs';
import { enTransaccion } from '../conexion.bd.mjs';
import clienteModelo from '../modelos/clientes.model.mjs';

import {
  ErrorNegocio,
  manejar,
  entero,
  hoy,
  REGEX_FECHA,
  REGEX_HORA
} from '../utilidades/errores.mjs';

import {
  precioPara,
  senaPara,
  aMinutos,
  aHora,
  HORA_APERTURA,
  HORA_CIERRE
} from '../utilidades/calculos.mjs';

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_NOMBRE = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ' -]{2,100}$/;

const MAXIMO_PENDIENTES_POR_DNI = 3;
const VENTANA_MS = 10 * 60 * 1000;
const MAXIMO_POR_VENTANA = 5;

const DURACION_MINUTOS = 150;
const NINOS_INCLUIDOS = 30;
const PORCENTAJE_72_HORAS = 72;

const enviosPorIp = new Map();

function superaLimite(ip) {
  const ahora = Date.now();

  const recientes = (enviosPorIp.get(ip) || [])
    .filter(marca => ahora - marca < VENTANA_MS);

  recientes.push(ahora);
  enviosPorIp.set(ip, recientes);

  if (enviosPorIp.size > 5000) {
    enviosPorIp.clear();
  }

  return recientes.length > MAXIMO_POR_VENTANA;
}

function ipDe(peticion) {
  return String(
    peticion.headers['x-forwarded-for'] ||
    peticion.socket?.remoteAddress ||
    ''
  ).split(',')[0].trim();
}

function texto(valor, largo) {
  return String(valor ?? '').trim().slice(0, largo);
}

function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

function fechaValida(fecha) {
  if (!REGEX_FECHA.test(fecha || '')) return false;

  const [anio, mes, dia] = fecha.split('-').map(Number);
  const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));

  return fechaUTC.getUTCFullYear() === anio &&
    fechaUTC.getUTCMonth() === mes - 1 &&
    fechaUTC.getUTCDate() === dia;
}

function esFinDeSemana(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);

  const diaSemana = new Date(
    Date.UTC(anio, mes - 1, dia)
  ).getUTCDay();

  return diaSemana === 0 || diaSemana === 5 || diaSemana === 6;
}

function obtenerPrecioSala(sala, fecha) {
  const precio = Number(
    esFinDeSemana(fecha)
      ? sala.precio_viernes_domingo
      : sala.precio_lunes_jueves
  );

  if (!Number.isFinite(precio) || precio < 0) {
    throw new ErrorNegocio(
      400,
      'La sala no tiene una tarifa válida configurada.'
    );
  }

  return precio;
}

function obtenerFechaHora(fecha, hora) {
  // Córdoba utiliza UTC-3.
  return Date.parse(`${fecha}T${hora}:00-03:00`);
}


// --------------------------------------------------
// VALIDACIÓN DE ADICIONALES
// --------------------------------------------------

async function validarAdicionales(seleccionados, fecha, horaInicio) {
  if (!Array.isArray(seleccionados) || seleccionados.length > 20) {
    throw new ErrorNegocio(400, 'La selección de adicionales no es válida.');
  }

  const catalogo = await catalogoModelo.listarAdicionales({
    soloActivos: true
  });

  const usados = new Set();
  const fechaEvento = obtenerFechaHora(fecha, horaInicio);

  const resultado = [];

  for (const seleccionado of seleccionados) {
    const id = entero(seleccionado.id);

    if (!(id > 0) || usados.has(id)) {
      throw new ErrorNegocio(400, 'Hay adicionales inválidos o repetidos.');
    }

    usados.add(id);

    const adicional = catalogo.find(
      item => Number(item.id) === id
    );

    if (!adicional) {
      throw new ErrorNegocio(
        400,
        'Uno de los adicionales seleccionados ya no está disponible.'
      );
    }

    const modalidad = adicional.modalidad_cobro || 'cantidad';
    const minimo = Number(adicional.cantidad_minima) || 1;

    let cantidad;

    if (modalidad === 'por_evento') {
      cantidad = 1;
    } else {
      cantidad = Number(seleccionado.cantidad);

      if (
        !Number.isInteger(cantidad) ||
        cantidad < minimo ||
        cantidad > 1000
      ) {
        throw new ErrorNegocio(
          400,
          `${adicional.nombre}: la cantidad mínima es ${minimo}.`
        );
      }
    }

    const anticipacion = Number(adicional.anticipacion_horas) || 72;

    if (
      !Number.isFinite(fechaEvento) ||
      fechaEvento - Date.now() < anticipacion * 60 * 60 * 1000
    ) {
      throw new ErrorNegocio(
        400,
        `${adicional.nombre} debe encargarse con ${anticipacion} horas de anticipación.`
      );
    }

    const precio = Number(adicional.precio);

    if (!Number.isFinite(precio) || precio < 0) {
      throw new ErrorNegocio(
        400,
        `El precio de ${adicional.nombre} no es válido.`
      );
    }

    resultado.push({
      adicional_id: adicional.id,
      nombre: adicional.nombre,
      unidad: adicional.unidad,
      modalidad_cobro: modalidad,
      cantidad,
      precio_unitario: precio,
      subtotal: redondear(precio * cantidad),
      anticipacion_horas: anticipacion,
      anulable: adicional.anulable
    });
  }

  return resultado;
}


// --------------------------------------------------
// CONSULTA DE DISPONIBILIDAD DE SOLICITUDES
// --------------------------------------------------

async function conDisponibilidad(solicitud) {
  if (solicitud.estado !== 'pendiente') return solicitud;

  if (solicitud.fecha < hoy()) {
    return {
      ...solicitud,
      vencida: true,
      disponible: false
    };
  }

  const superpuestas = await reservaModelo.buscarSuperpuestas(
    solicitud.sala_id,
    solicitud.fecha,
    solicitud.hora_inicio,
    solicitud.hora_fin
  );

  return {
    ...solicitud,
    vencida: false,
    disponible: superpuestas.length === 0,
    ocupada_por: superpuestas.length
      ? `${superpuestas[0].hora_inicio} a ${superpuestas[0].hora_fin} (${superpuestas[0].estado})`
      : null
  };
}


// --------------------------------------------------
// CONTROLADOR
// --------------------------------------------------

const solicitudControlador = {

  // POST /solicitudes
  crear: manejar(async (peticion, respuesta) => {
    const cuerpo = peticion.body || {};

    // Protección contra robots.
    if (cuerpo.sitio_web) {
      return respuesta.status(201).json({
        id: 0,
        mensaje: 'Solicitud enviada.'
      });
    }

    if (superaLimite(ipDe(peticion))) {
      throw new ErrorNegocio(
        429,
        'Enviaste muchas solicitudes seguidas. Esperá unos minutos o escribinos por WhatsApp.'
      );
    }

    // 1. Validar datos personales.

    const datos = {
      nombre: texto(cuerpo.nombre, 100),
      apellido: texto(cuerpo.apellido, 100),
      dni: String(cuerpo.dni || '').replace(/\D/g, ''),
      telefono: texto(cuerpo.telefono, 40),
      email: texto(cuerpo.email, 150).toLowerCase(),
      comentarios: texto(cuerpo.comentarios, 500)
    };

    if (!REGEX_NOMBRE.test(datos.nombre)) {
      throw new ErrorNegocio(400, 'Ingresá tu nombre correctamente.', {
        campo: 'nombre'
      });
    }

    if (!REGEX_NOMBRE.test(datos.apellido)) {
      throw new ErrorNegocio(400, 'Ingresá tu apellido correctamente.', {
        campo: 'apellido'
      });
    }

    if (datos.dni.length < 7 || datos.dni.length > 8) {
      throw new ErrorNegocio(400, 'Ingresá un DNI válido.', {
        campo: 'dni'
      });
    }

    if (datos.telefono.replace(/\D/g, '').length < 8) {
      throw new ErrorNegocio(400, 'Ingresá un teléfono válido.', {
        campo: 'telefono'
      });
    }

    if (datos.email && !REGEX_EMAIL.test(datos.email)) {
      throw new ErrorNegocio(400, 'El correo electrónico no es válido.', {
        campo: 'email'
      });
    }

    // 2. Validar niños y adultos.

    const ninos = entero(cuerpo.ninos);
    const adultos = entero(cuerpo.adultos);

    if (
      !Number.isInteger(ninos) ||
      !Number.isInteger(adultos) ||
      ninos < 0 ||
      adultos < 0 ||
      ninos + adultos < 1 ||
      ninos + adultos > 200
    ) {
      throw new ErrorNegocio(
        400,
        'Ingresá una cantidad válida de niños y adultos.'
      );
    }

    const personas = ninos + adultos;

    // 3. Obtener sala.

    const sala = await salaModelo.obtenerPorId(
      entero(cuerpo.sala_id)
    );

    if (!sala) {
      throw new ErrorNegocio(400, 'Seleccioná una sala válida.');
    }

    if (
      sala.capacidad_ninos > 0 &&
      ninos > sala.capacidad_ninos
    ) {
      throw new ErrorNegocio(
        400,
        `La ${sala.nombre} admite hasta ${sala.capacidad_ninos} niños.`
      );
    }

    if (
      sala.capacidad_adultos > 0 &&
      adultos > sala.capacidad_adultos
    ) {
      throw new ErrorNegocio(
        400,
        `La ${sala.nombre} admite hasta ${sala.capacidad_adultos} adultos.`
      );
    }

    // 4. Validar fecha y horario.

    const fecha = cuerpo.fecha;

    if (
      !fechaValida(fecha) ||
      !REGEX_HORA.test(cuerpo.hora_inicio || '')
    ) {
      throw new ErrorNegocio(
        400,
        'Elegí una fecha y un horario válidos.'
      );
    }

    if (fecha < hoy()) {
      throw new ErrorNegocio(400, 'La fecha ya pasó.');
    }

    const horaInicio = cuerpo.hora_inicio.slice(0, 5);

    const finMinutos =
      aMinutos(horaInicio) + DURACION_MINUTOS;

    const horaFin = aHora(finMinutos);

    if (
      horaInicio < HORA_APERTURA ||
      finMinutos > aMinutos(HORA_CIERRE)
    ) {
      throw new ErrorNegocio(
        400,
        `La fiesta debe entrar dentro del horario de atención (${HORA_APERTURA} a ${HORA_CIERRE} hs).`
      );
    }

    const fechaHoraEvento = obtenerFechaHora(fecha, horaInicio);

    // En el mismo día se requieren al menos 2 horas para solicitar.
    if (fechaHoraEvento - Date.now() < 120 * 60 * 1000) {
      throw new ErrorNegocio(
        400,
        'Para reservar en el día necesitás hacerlo con al menos 2 horas de anticipación.'
      );
    }

    // 5. Consultar el precio real de la sala.

    const precioSala = obtenerPrecioSala(sala, fecha);

    // 6. Validar adicionales usando los precios actuales del catálogo.

    const adicionales = await validarAdicionales(
      cuerpo.adicionales || [],
      fecha,
      horaInicio
    );

    const totalAdicionales = redondear(
      adicionales.reduce((total, item) => total + item.subtotal, 0)
    );

    // 7. Calcular niños excedentes.

    const ninosExcedentes = Math.max(
      0,
      ninos - NINOS_INCLUIDOS
    );

    const coordinadorExtra = adicionales.some(
      item => item.nombre.trim().toLowerCase() === 'coordinador extra'
    );

    const precioPorNino = coordinadorExtra ? 4000 : 5500;

    const cargoNinos = redondear(
      ninosExcedentes * precioPorNino
    );

    // 8. Calcular presupuesto y seña.

    const importeEstimado = redondear(
      precioSala + totalAdicionales + cargoNinos
    );

    const senaRequerida = senaPara(importeEstimado);

    // 9. Verificar nuevamente que la franja esté libre.

    const superpuestas = await reservaModelo.buscarSuperpuestas(
      sala.id,
      fecha,
      horaInicio,
      horaFin
    );

    if (superpuestas.length > 0) {
      throw new ErrorNegocio(
        409,
        'Ese horario se acaba de ocupar. Elegí otro, por favor.',
        { codigo: 'horario_ocupado' }
      );
    }

    // 10. Crear solicitud y sus adicionales en una sola transacción.

    const solicitud = {
      ...datos,
      sala_id: sala.id,
      paquete_id: null,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      personas,
      ninos,
      adultos,
      precio_sala_estimado: precioSala,
      importe_estimado: importeEstimado,
      sena_requerida: senaRequerida
    };

    let id = await solicitudModelo.buscarPendienteIgual(
      solicitud,
      adicionales
    );

    if (!id) {
      const pendientes =
        await solicitudModelo.contarPendientesDeDni(datos.dni);

      if (pendientes >= MAXIMO_PENDIENTES_POR_DNI) {
        throw new ErrorNegocio(
          429,
          'Ya tenés varias solicitudes pendientes. Nuestro equipo te va a contactar.'
        );
      }

      id = await enTransaccion(async bd => {
        const nuevoId = await solicitudModelo.crear(
          solicitud,
          bd
        );

        await solicitudModelo.guardarAdicionales(
          nuevoId,
          adicionales,
          bd
        );

        return nuevoId;
      });
    }

    // 11. Respuesta al frontend.

    respuesta.status(201).json({
      id,
      mensaje: 'Solicitud enviada correctamente.',
      resumen: {
        sala: sala.nombre,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        ninos,
        adultos,
        precio_sala: precioSala,
        ninos_excedentes: ninosExcedentes,
        cargo_ninos: cargoNinos,
        adicionales,
        total_adicionales: totalAdicionales,
        importe_estimado: importeEstimado,
        sena_requerida: senaRequerida
      }
    });
  }),

  // GET /api/v1/solicitudes
  listar: manejar(async (peticion, respuesta) => {
    const estado = [
      'pendiente',
      'convertida',
      'descartada'
    ].includes(peticion.query.estado)
      ? peticion.query.estado
      : (peticion.query.estado === 'todas' ? null : 'pendiente');

    const lista = await solicitudModelo.listar(estado);

    respuesta.json(
      await Promise.all(lista.map(conDisponibilidad))
    );
  }),

  // GET /api/v1/solicitudes/cantidad
  cantidad: manejar(async (peticion, respuesta) => {
    respuesta.json({
      pendientes: await solicitudModelo.contarPendientes()
    });
  }),

  // GET /api/v1/solicitudes/:id
  obtener: manejar(async (peticion, respuesta) => {
    const solicitud = await solicitudModelo.obtenerPorId(
      entero(peticion.params.id)
    );

    if (!solicitud) {
      throw new ErrorNegocio(404, 'La solicitud no existe.');
    }

    respuesta.json(await conDisponibilidad(solicitud));
  }),

  // Convierte una solicitud web en una reserva real.
  convertir: manejar(async (peticion, respuesta) => {
    const solicitudId = entero(peticion.params.id);
    const usuarioId = peticion.usuario.id;

    const reservaId = await enTransaccion(async bd => {
      const solicitud = await solicitudModelo.obtenerPorId(
        solicitudId, bd
      );

      if (!solicitud) {
        throw new ErrorNegocio(404, 'La solicitud no existe.');
      }

      if (solicitud.estado !== 'pendiente') {
        throw new ErrorNegocio(409, 'La solicitud ya fue atendida.');
      }

      if (solicitud.fecha < hoy()) {
        throw new ErrorNegocio(400, 'La fecha solicitada ya pasó.');
      }

      // Recuperar los datos de la sala.
      const sala = await salaModelo.obtenerPorId(
        solicitud.sala_id, bd
      );

      if (!sala) {
        throw new ErrorNegocio(400, 'La sala ya no está disponible.');
      }

      const personas = Number(solicitud.personas);
      const ninos = solicitud.ninos == null
        ? null : Number(solicitud.ninos);
      const adultos = solicitud.adultos == null
        ? null : Number(solicitud.adultos);

      // Mantener compatibilidad con solicitudes antiguas.
      let importeEstimado = Number(solicitud.importe_estimado);
      let senaRequerida = Number(solicitud.sena_requerida);

      if (!Number.isFinite(importeEstimado) ||
          !Number.isFinite(senaRequerida)) {

        if (!solicitud.paquete_id) {
          throw new ErrorNegocio(
            400,
            'La solicitud no tiene un presupuesto válido.'
          );
        }

        const paquete = await catalogoModelo.obtenerPaquete(
          solicitud.paquete_id, bd
        );

        if (!paquete) {
          throw new ErrorNegocio(
            400,
            'No se pudo recuperar el presupuesto histórico.'
          );
        }

        importeEstimado = precioPara(paquete, personas);
        senaRequerida = senaPara(importeEstimado);
      }

      const precioSala = solicitud.precio_sala_estimado == null
        ? null : Number(solicitud.precio_sala_estimado);

      // Bloquear sala y fecha para evitar reservas simultáneas.
      await reservaModelo.bloquearSalaFecha(
        sala.id, solicitud.fecha, bd
      );

      const ocupadas = await reservaModelo.buscarSuperpuestas(
        sala.id,
        solicitud.fecha,
        solicitud.hora_inicio,
        solicitud.hora_fin,
        null,
        bd
      );

      if (ocupadas.length) {
        throw new ErrorNegocio(
          409,
          'El horario ya está ocupado. Contactá al cliente para ofrecer otra fecha.'
        );
      }

      // Buscar o registrar el cliente.
      let cliente = await clienteModelo.obtenerPorDni(
        solicitud.dni, bd
      );

      if (!cliente) {
        cliente = await clienteModelo.crear({
          nombre: solicitud.nombre,
          apellido: solicitud.apellido,
          dni: solicitud.dni,
          telefono: solicitud.telefono,
          email: solicitud.email,
          creado_por: usuarioId
        }, bd);
      }

      // Crear la reserva.
      const id = await reservaModelo.crear({
        sala_id: sala.id,
        cliente_id: cliente.id,
        paquete_id: solicitud.paquete_id ?? null,
        fecha: solicitud.fecha,
        hora_inicio: solicitud.hora_inicio,
        hora_fin: solicitud.hora_fin,
        personas_contratadas: personas,
        ninos_contratados: ninos,
        adultos_contratados: adultos,
        precio_sala_aplicado: precioSala,
        importe_estimado: importeEstimado,
        sena_requerida: senaRequerida,
        observaciones: solicitud.comentarios,
        creado_por: usuarioId
      }, bd);

      // Marcar solicitud convertida y trasladar sus adicionales.
      const marcada = await solicitudModelo.marcarConvertida(
        solicitudId, id, usuarioId, bd
      );

      if (!marcada) {
        throw new ErrorNegocio(
          409,
          'La solicitud ya fue convertida por otro usuario.'
        );
      }

      await reservaModelo.registrarHistorial(
        id,
        usuarioId,
        'solicitud_web',
        `Reserva creada a partir de la solicitud web N.º ${solicitudId}.`,
        bd
      );

      return id;
    });

    respuesta.status(201).json({
      mensaje: 'Solicitud convertida en reserva correctamente.',
      reserva_id: reservaId
    });
  }),

  // POST /api/v1/solicitudes/:id/descartar
  descartar: manejar(async (peticion, respuesta) => {
    const motivo = texto(peticion.body.motivo, 300);

    if (!motivo) {
      throw new ErrorNegocio(
        400,
        'Indicá el motivo del descarte.'
      );
    }

    const ok = await solicitudModelo.descartar(
      entero(peticion.params.id),
      motivo,
      peticion.usuario.id
    );

    if (!ok) {
      throw new ErrorNegocio(
        409,
        'La solicitud ya fue atendida o no existe.'
      );
    }

    respuesta.json({
      mensaje: 'Solicitud descartada.'
    });
  })
};

export default solicitudControlador;
