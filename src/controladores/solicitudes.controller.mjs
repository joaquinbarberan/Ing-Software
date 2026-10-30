import solicitudModelo from '../modelos/solicitudes.model.mjs';
import reservaModelo from '../modelos/reservas.model.mjs';
import salaModelo from '../modelos/salas.model.mjs';
import catalogoModelo from '../modelos/catalogos.model.mjs';
import { ErrorNegocio, manejar, entero, hoy, REGEX_FECHA, REGEX_HORA } from '../utilidades/errores.mjs';
import { precioPara, senaPara, aMinutos, aHora, HORA_APERTURA, HORA_CIERRE } from '../utilidades/calculos.mjs';

// =====================================================================================
// Solicitudes de reserva desde la página web (ver CAMBIOS.md).
//
// El cliente elige paquete, fecha y horario en la web y deja sus datos. Eso genera una
// SOLICITUD, no una reserva: no ocupa la franja ni cambia la agenda. El área de Ventas la ve
// en la bandeja "Solicitudes web" del sistema y, con un clic, abre "Nueva reserva" con todo
// precargado (CU-02, que sigue verificando la superposición al guardar). Así se respeta la
// frontera del sistema del informe (sección 10.3): quien registra la reserva sigue siendo Ventas.
// =====================================================================================

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_NOMBRE = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ' -]{2,100}$/;
const MAXIMO_PENDIENTES_POR_DNI = 3;

// Límite simple contra envíos masivos: hasta 5 solicitudes cada 10 minutos por dirección IP.
// Vive en memoria (en Vercel se reinicia con cada instancia), alcanza para frenar abusos básicos.
const VENTANA_MS = 10 * 60 * 1000;
const MAXIMO_POR_VENTANA = 5;
const enviosPorIp = new Map();

function superaLimite(ip) {
  const ahora = Date.now();
  const recientes = (enviosPorIp.get(ip) || []).filter(marca => ahora - marca < VENTANA_MS);
  recientes.push(ahora);
  enviosPorIp.set(ip, recientes);
  if (enviosPorIp.size > 5000) enviosPorIp.clear(); // no dejar crecer la memoria indefinidamente
  return recientes.length > MAXIMO_POR_VENTANA;
}

function ipDe(peticion) {
  return String(peticion.headers['x-forwarded-for'] || peticion.socket?.remoteAddress || '').split(',')[0].trim();
}

function texto(valor, largo) {
  return String(valor ?? '').trim().slice(0, largo);
}

// Agrega a cada solicitud si su franja sigue libre hoy (puede haberse ocupado desde que la pidieron)
async function conDisponibilidad(solicitud) {
  if (solicitud.estado !== 'pendiente') return solicitud;
  if (solicitud.fecha < hoy()) return { ...solicitud, vencida: true, disponible: false };
  const superpuestas = await reservaModelo.buscarSuperpuestas(
    solicitud.sala_id, solicitud.fecha, solicitud.hora_inicio, solicitud.hora_fin);
  return {
    ...solicitud,
    vencida: false,
    disponible: superpuestas.length === 0,
    ocupada_por: superpuestas.length ? `${superpuestas[0].hora_inicio} a ${superpuestas[0].hora_fin} (${superpuestas[0].estado})` : null
  };
}

const solicitudControlador = {

  // --- PÚBLICO ---
  // POST /solicitudes
  // { paquete_id, personas, fecha, hora_inicio, sala_id, nombre, apellido, dni, telefono, email, comentarios, sitio_web }
  crear: manejar(async (peticion, respuesta) => {
    const cuerpo = peticion.body || {};

    // Campo trampa: es invisible para las personas; si viene completo lo llenó un robot.
    // Se responde como si estuviera todo bien, pero no se guarda nada.
    if (cuerpo.sitio_web) return respuesta.status(201).json({ id: 0, mensaje: 'Solicitud enviada.' });

    if (superaLimite(ipDe(peticion))) {
      throw new ErrorNegocio(429, 'Enviaste muchas solicitudes seguidas. Esperá unos minutos o escribinos por WhatsApp.');
    }

    // Datos del cliente
    const datos = {
      nombre: texto(cuerpo.nombre, 100),
      apellido: texto(cuerpo.apellido, 100),
      dni: String(cuerpo.dni || '').replace(/\D/g, ''),
      telefono: texto(cuerpo.telefono, 40),
      email: texto(cuerpo.email, 150).toLowerCase(),
      comentarios: texto(cuerpo.comentarios, 500)
    };
    if (!REGEX_NOMBRE.test(datos.nombre)) throw new ErrorNegocio(400, 'Ingresá tu nombre (sólo letras).', { campo: 'nombre' });
    if (!REGEX_NOMBRE.test(datos.apellido)) throw new ErrorNegocio(400, 'Ingresá tu apellido (sólo letras).', { campo: 'apellido' });
    if (datos.dni.length < 7 || datos.dni.length > 8) throw new ErrorNegocio(400, 'Ingresá un DNI válido (7 u 8 números).', { campo: 'dni' });
    if (datos.telefono.replace(/\D/g, '').length < 8) throw new ErrorNegocio(400, 'Ingresá un teléfono válido, con característica.', { campo: 'telefono' });
    if (datos.email && !REGEX_EMAIL.test(datos.email)) throw new ErrorNegocio(400, 'El correo electrónico no es válido.', { campo: 'email' });

    // Paquete, sala e invitados
    const paquete = await catalogoModelo.obtenerPaquete(entero(cuerpo.paquete_id));
    if (!paquete || !paquete.activo || paquete.es_personalizado) throw new ErrorNegocio(400, 'Elegí un paquete.');
    const sala = await salaModelo.obtenerPorId(entero(cuerpo.sala_id));
    if (!sala) throw new ErrorNegocio(400, 'Elegí una sala.');
    const personas = entero(cuerpo.personas);
    const capacidad = sala.capacidad_ninos + sala.capacidad_adultos;
    if (!(personas > 0)) throw new ErrorNegocio(400, 'Indicá cuántos invitados van a ser.');
    if (capacidad > 0 && personas > capacidad) throw new ErrorNegocio(400, `En la ${sala.nombre} entran hasta ${capacidad} personas.`);

    // Fecha y horario: el fin lo define la duración del paquete
    const fecha = cuerpo.fecha;
    if (!REGEX_FECHA.test(fecha || '') || !REGEX_HORA.test(cuerpo.hora_inicio || '')) throw new ErrorNegocio(400, 'Elegí la fecha y el horario.');
    if (fecha < hoy()) throw new ErrorNegocio(400, 'La fecha ya pasó.');
    const horaInicio = cuerpo.hora_inicio.slice(0, 5);
    const fin = aMinutos(horaInicio) + paquete.duracion_horas * 60;
    const horaFin = aHora(fin);
    if (horaInicio < HORA_APERTURA || fin > aMinutos(HORA_CIERRE)) {
      throw new ErrorNegocio(400, `El salón atiende de ${HORA_APERTURA} a ${HORA_CIERRE} hs.`);
    }

    // Se vuelve a verificar que el horario siga libre (otra persona pudo haberlo tomado mientras completaba el formulario)
    const superpuestas = await reservaModelo.buscarSuperpuestas(sala.id, fecha, horaInicio, horaFin);
    if (superpuestas.length > 0) {
      throw new ErrorNegocio(409, 'Ese horario se acaba de ocupar. Elegí otro, por favor.', { codigo: 'horario_ocupado' });
    }

    const solicitud = { ...datos, sala_id: sala.id, paquete_id: paquete.id, fecha, hora_inicio: horaInicio, hora_fin: horaFin, personas };

    // Doble clic o reenvío: se devuelve la misma solicitud en lugar de crear otra
    let id = await solicitudModelo.buscarPendienteIgual(solicitud);
    if (!id) {
      if (await solicitudModelo.contarPendientesDeDni(datos.dni) >= MAXIMO_PENDIENTES_POR_DNI) {
        throw new ErrorNegocio(429, 'Ya tenés varias solicitudes pendientes. Nuestro equipo te va a contactar; si querés, escribinos por WhatsApp.');
      }
      id = await solicitudModelo.crear(solicitud);
    }

    const importeEstimado = precioPara(paquete, personas);
    respuesta.status(201).json({
      id,
      mensaje: 'Solicitud enviada.',
      resumen: {
        sala: sala.nombre, paquete: paquete.nombre, fecha, hora_inicio: horaInicio, hora_fin: horaFin, personas,
        importe_estimado: importeEstimado, sena_requerida: senaPara(importeEstimado)
      }
    });
  }),

  // --- SISTEMA (Ventas y Administración) ---

  // GET /api/v1/solicitudes?estado=pendiente|convertida|descartada|todas
  listar: manejar(async (peticion, respuesta) => {
    const estado = ['pendiente', 'convertida', 'descartada'].includes(peticion.query.estado)
      ? peticion.query.estado
      : (peticion.query.estado === 'todas' ? null : 'pendiente');
    const lista = await solicitudModelo.listar(estado);
    respuesta.json(await Promise.all(lista.map(conDisponibilidad)));
  }),

  // Para el contador del menú
  // GET /api/v1/solicitudes/cantidad
  cantidad: manejar(async (peticion, respuesta) => {
    respuesta.json({ pendientes: await solicitudModelo.contarPendientes() });
  }),

  // GET /api/v1/solicitudes/:id
  obtener: manejar(async (peticion, respuesta) => {
    const solicitud = await solicitudModelo.obtenerPorId(entero(peticion.params.id));
    if (!solicitud) throw new ErrorNegocio(404, 'La solicitud no existe.');
    respuesta.json(await conDisponibilidad(solicitud));
  }),

  // POST /api/v1/solicitudes/:id/descartar   { motivo }
  descartar: manejar(async (peticion, respuesta) => {
    const motivo = texto(peticion.body.motivo, 300);
    if (!motivo) throw new ErrorNegocio(400, 'Indicá el motivo (por ejemplo: "el cliente eligió otra fecha").');
    const ok = await solicitudModelo.descartar(entero(peticion.params.id), motivo, peticion.usuario.id);
    if (!ok) throw new ErrorNegocio(409, 'La solicitud ya fue atendida o no existe.');
    respuesta.json({ mensaje: 'Solicitud descartada.' });
  })
};

export default solicitudControlador;
