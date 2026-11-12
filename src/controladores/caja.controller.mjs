import { enTransaccion } from '../conexion.bd.mjs';
import reservaModelo from '../modelos/reservas.model.mjs';
import eventoModelo from '../modelos/eventos.model.mjs';
import cajaModelo from '../modelos/caja.model.mjs';
import { detalleReserva } from './agenda.controller.mjs';
import { ErrorNegocio, manejar, entero, importe, hoy, REGEX_FECHA } from '../utilidades/errores.mjs';
import { calcularLiquidacion, redondear } from '../utilidades/calculos.mjs';
import {
  mercadoPagoConfigurado, crearLinkDePago, obtenerPago, buscarPagosDeReserva, reservaDeReferencia, firmaValida
} from '../utilidades/mercadopago.mjs';

// Controlador del módulo M4 — Caja y Cobros
// CU-13 Registrar seña y pagos · CU-14 Emitir liquidación final · CU-15 Emitir reportes de ingresos

const TIPOS = ['sena', 'parcial', 'saldo', 'ajuste'];
const MEDIOS = ['efectivo', 'transferencia', 'mercado_pago', 'tarjeta'];

function formatoPesos(monto) {
  return `$${Number(monto).toLocaleString('es-AR')}`;
}

async function cuentaActual(reserva, bd) {
  // Una consulta por vez: dentro de una transacción todas comparten la misma conexión
  const evento = await eventoModelo.obtenerPorReserva(reserva.id, bd);
  const totalAdicionales = await eventoModelo.totalConsumos(reserva.id, bd);
  const totalPagado = await cajaModelo.totalPagado(reserva.id, bd);
  return { evento, cuenta: calcularLiquidacion({ reserva, evento, totalAdicionales, totalPagado }) };
}

// RN02 / transición registrarSeña(): Preseñada -> Confirmada cuando lo pagado cubre la seña requerida.
// Devuelve el mensaje para el usuario (o null si la reserva no estaba preseñada).
async function confirmarSiCubreSena(reserva, pagadoAntes, monto, usuarioId, bd) {
  if (reserva.estado !== 'presenada') return null;
  const pagado = redondear(pagadoAntes + monto);
  if (pagado + 0.01 >= Number(reserva.sena_requerida)) {
    await reservaModelo.cambiarEstado(reserva.id, 'confirmada', bd);
    await reservaModelo.registrarHistorial(reserva.id, usuarioId, 'confirmacion', 'Seña cubierta. La reserva pasó a Confirmada.', bd);
    return 'Seña registrada. La reserva quedó Confirmada.';
  }
  return `Pago registrado. Falta ${formatoPesos(Number(reserva.sena_requerida) - pagado)} para cubrir la seña y confirmar la reserva.`;
}

// Registra en la reserva un pago aprobado de Mercado Pago. Se usa desde el aviso automático (webhook)
// y desde el botón "Verificar pagos". Si el pago ya estaba registrado, no lo duplica.
export async function registrarPagoMercadoPago(pagoMp) {
  if (pagoMp.status !== 'approved') return { registrado: false, motivo: `El pago está ${pagoMp.status}.` };
  const reservaId = reservaDeReferencia(pagoMp.external_reference);
  if (!reservaId) return { registrado: false, motivo: 'El pago no corresponde a una reserva.' };
  const monto = redondear(Number(pagoMp.transaction_amount));
  if (!(monto > 0)) return { registrado: false, motivo: 'El pago no tiene un monto válido.' };

  return enTransaccion(async (bd) => {
    const reserva = await reservaModelo.obtenerPorId(reservaId, bd);
    if (!reserva) return { registrado: false, motivo: 'La reserva no existe.' };

    const { cuenta } = await cuentaActual(reserva, bd);
    // El dinero ya entró: se registra siempre. El tipo depende del estado de la reserva.
    const tipo = reserva.estado === 'presenada' ? 'sena'
      : ['realizada', 'cancelada', 'expirada'].includes(reserva.estado) ? 'ajuste'
      : 'parcial';
    const pago = await cajaModelo.crearPagoMercadoPago({
      reserva_id: reservaId, tipo, monto, mp_pago_id: pagoMp.id,
      comprobante: `MP ${pagoMp.id}`,
      fecha_pago: (pagoMp.date_approved || '').slice(0, 10) || null
    }, bd);
    if (!pago) return { registrado: false, motivo: 'Ese pago ya estaba registrado.', reserva_id: reservaId };

    await reservaModelo.registrarHistorial(reservaId, null, 'pago',
      `Pago de ${formatoPesos(monto)} por Mercado Pago (operación ${pagoMp.id}), registrado automáticamente.`, bd);
    if (tipo === 'ajuste') {
      await reservaModelo.registrarHistorial(reservaId, null, 'aviso',
        `Entró un pago por Mercado Pago con la reserva ${reserva.estado}. Revisar si corresponde devolverlo.`, bd);
    }
    const mensaje = await confirmarSiCubreSena(reserva, cuenta.total_pagado, monto, null, bd);
    return { registrado: true, reserva_id: reservaId, pago_id: pago.id, mensaje: mensaje || 'Pago registrado.' };
  });
}

const cajaControlador = {

  // CU-13 · Registrar seña y pagos (RF06)
  // POST /api/v1/reservas/:id/pagos   { tipo, monto, medio, comprobante, fecha_pago }
  registrarPago: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const { tipo, medio } = peticion.body;
    const monto = importe(peticion.body.monto);
    const comprobante = (peticion.body.comprobante || '').trim();
    const fechaPago = REGEX_FECHA.test(peticion.body.fecha_pago || '') ? peticion.body.fecha_pago : null;

    if (!TIPOS.includes(tipo)) throw new ErrorNegocio(400, 'Elegí el tipo de pago.');
    if (!MEDIOS.includes(medio)) throw new ErrorNegocio(400, 'Elegí el medio de pago.');
    if (tipo === 'ajuste' ? !(monto !== 0 && Number.isFinite(monto)) : !(monto > 0)) {
      throw new ErrorNegocio(400, 'Ingresá un monto válido.');
    }
    if (fechaPago && fechaPago > hoy()) throw new ErrorNegocio(400, 'La fecha del pago no puede ser futura.');
    if (medio !== 'efectivo' && !comprobante) {
      throw new ErrorNegocio(400, 'Para transferencias, Mercado Pago o tarjeta indicá el número de comprobante u operación.');
    }
    if (tipo === 'ajuste' && !comprobante) throw new ErrorNegocio(400, 'Un ajuste necesita el motivo en el campo comprobante.');

    let mensaje = 'Pago registrado.';
    let pagoId = null;

    await enTransaccion(async (bd) => {
      const reserva = await reservaModelo.obtenerPorId(id, bd);
      if (!reserva) throw new ErrorNegocio(404, 'La reserva no existe.');
      if (['cancelada', 'expirada'].includes(reserva.estado)) {
        throw new ErrorNegocio(409, 'La reserva está cancelada o expirada: no admite pagos.');
      }
      // RN08: una reserva Realizada sólo admite ajustes independientes, con usuario y motivo
      if (reserva.estado === 'realizada' && tipo !== 'ajuste') {
        throw new ErrorNegocio(409, 'El evento ya está liquidado. Cualquier corrección se registra como ajuste.');
      }
      if (tipo === 'sena' && reserva.estado !== 'presenada') {
        throw new ErrorNegocio(409, 'La seña ya fue registrada. Usá "pago parcial" o "saldo".');
      }

      const { cuenta } = await cuentaActual(reserva, bd);
      if (tipo !== 'ajuste' && monto > cuenta.saldo + 0.01) {
        throw new ErrorNegocio(400, `El monto supera el saldo pendiente (${formatoPesos(cuenta.saldo)}).`);
      }

      const pago = await cajaModelo.crearPago({
        reserva_id: id, tipo, monto, medio, comprobante, fecha_pago: fechaPago, registrado_por: peticion.usuario.id
      }, bd);
      pagoId = pago.id;
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'pago',
        `${tipo === 'sena' ? 'Seña' : tipo.charAt(0).toUpperCase() + tipo.slice(1)} de ${formatoPesos(monto)} (${medio.replace('_', ' ')})${comprobante ? ` · ${comprobante}` : ''}`, bd);

      mensaje = await confirmarSiCubreSena(reserva, cuenta.total_pagado, monto, peticion.usuario.id, bd) || mensaje;
    });

    respuesta.status(201).json({ mensaje, pago_id: pagoId, reserva: await detalleReserva(id) });
  }),

  // --- MERCADO PAGO ---

  // GET /api/v1/mercadopago/estado
  estadoMercadoPago(peticion, respuesta) {
    respuesta.json({ configurado: mercadoPagoConfigurado() });
  },

  // Genera el link de pago de la seña (reserva preseñada) o del saldo pendiente.
  // POST /api/v1/reservas/:id/mercadopago
  linkMercadoPago: manejar(async (peticion, respuesta) => {
    if (!mercadoPagoConfigurado()) throw new ErrorNegocio(503, 'Mercado Pago no está configurado en el sistema.');
    const id = entero(peticion.params.id);
    const reserva = id > 0 ? await reservaModelo.obtenerPorId(id) : null;
    if (!reserva) throw new ErrorNegocio(404, 'La reserva no existe.');
    if (!['presenada', 'confirmada', 'en_curso'].includes(reserva.estado)) {
      throw new ErrorNegocio(409, 'Sólo se cobra por Mercado Pago una reserva vigente.');
    }
    const { cuenta } = await cuentaActual(reserva);
    const esSena = reserva.estado === 'presenada';
    const monto = esSena ? redondear(Number(reserva.sena_requerida) - cuenta.total_pagado) : cuenta.saldo;
    if (!(monto > 0)) throw new ErrorNegocio(409, esSena ? 'La seña ya está cubierta.' : 'La reserva no tiene saldo pendiente.');

    const vence = esSena ? new Date(new Date(reserva.fecha_alta).getTime() + 72 * 3600 * 1000) : null;
    let link;
    try {
      link = await crearLinkDePago({
        reservaId: id, monto, vence,
        concepto: `${esSena ? 'Seña' : 'Pago'} reserva N.º ${id} · Diverty Park · ${reserva.fecha}`
      });
    } catch (error) {
      throw new ErrorNegocio(502, error.message);
    }
    await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'link_mercadopago',
      `Link de Mercado Pago generado por ${formatoPesos(monto)} (${esSena ? 'seña' : 'saldo'}).`);
    respuesta.status(201).json({ url: link.url, monto, concepto: esSena ? 'seña' : 'saldo' });
  }),

  // Consulta en Mercado Pago los pagos de la reserva y registra los aprobados que falten.
  // Sirve si el aviso automático no llegó. POST /api/v1/reservas/:id/mercadopago/verificar
  verificarMercadoPago: manejar(async (peticion, respuesta) => {
    if (!mercadoPagoConfigurado()) throw new ErrorNegocio(503, 'Mercado Pago no está configurado en el sistema.');
    const id = entero(peticion.params.id);
    if (!(id > 0) || !(await reservaModelo.obtenerPorId(id))) throw new ErrorNegocio(404, 'La reserva no existe.');
    let pagos;
    try {
      pagos = await buscarPagosDeReserva(id);
    } catch (error) {
      throw new ErrorNegocio(502, error.message);
    }
    let nuevos = 0;
    for (const pago of pagos) {
      const resultado = await registrarPagoMercadoPago(pago);
      if (resultado.registrado) nuevos++;
    }
    respuesta.json({
      mensaje: nuevos ? `Se registraron ${nuevos} pago(s) de Mercado Pago.` : 'No hay pagos nuevos aprobados en Mercado Pago.',
      reserva: await detalleReserva(id)
    });
  }),

  // Aviso automático de Mercado Pago (webhook). Ruta pública: no se confía en el contenido del aviso,
  // el pago se vuelve a consultar a Mercado Pago con el token del salón antes de registrarlo.
  // POST /api/mercadopago/webhook?type=payment&data.id=123
  webhookMercadoPago: async (peticion, respuesta) => {
    const tipo = peticion.query.type || peticion.body?.type;
    const pagoId = peticion.query['data.id'] || peticion.body?.data?.id;
    if (!mercadoPagoConfigurado() || tipo !== 'payment' || !pagoId) return respuesta.sendStatus(200);
    if (!firmaValida({ firma: peticion.headers['x-signature'], idPedido: peticion.headers['x-request-id'], idDato: pagoId })) {
      return respuesta.sendStatus(401);
    }
    try {
      const resultado = await registrarPagoMercadoPago(await obtenerPago(pagoId));
      respuesta.status(200).json({ ok: true, registrado: resultado.registrado });
    } catch (error) {
      // Un pago que Mercado Pago no reconoce no se va a poder procesar nunca: se responde 200 para que no reintente
      if (error.estado === 404) return respuesta.sendStatus(200);
      console.error('Error procesando el aviso de Mercado Pago:', error.message);
      // 500: Mercado Pago reintenta el aviso más tarde
      respuesta.sendStatus(500);
    }
  },

  // Adjunta (o reemplaza) el comprobante en PDF de un pago
  // POST /api/v1/pagos/:id/comprobante-pdf   multipart/form-data, campo "archivo"
  subirComprobantePdf: manejar(async (peticion, respuesta) => {
    const pago = await cajaModelo.obtenerPago(entero(peticion.params.id));
    if (!pago) throw new ErrorNegocio(404, 'El pago no existe.');
    if (pago.anulado) throw new ErrorNegocio(409, 'El pago está anulado: no admite comprobante.');

    const archivo = peticion.file;
    // Se revisa el contenido real: un PDF siempre empieza con "%PDF-", aunque el archivo diga otra cosa
    if (!archivo || archivo.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new ErrorNegocio(400, 'El comprobante tiene que ser un archivo PDF.');
    }

    const nombre = archivo.originalname.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 200) || `comprobante-pago-${pago.id}.pdf`;
    await enTransaccion(async (bd) => {
      await cajaModelo.guardarPdf(pago.id, nombre, archivo.buffer, peticion.usuario.id, bd);
      await reservaModelo.registrarHistorial(pago.reserva_id, peticion.usuario.id, 'comprobante_pdf',
        `Comprobante PDF adjuntado al pago #${pago.id}: ${nombre}`, bd);
    });
    respuesta.status(201).json(await detalleReserva(pago.reserva_id));
  }),

  // Muestra el comprobante en el navegador. Sólo con sesión y perfil de caja.
  // GET /api/v1/pagos/:id/comprobante-pdf
  verComprobantePdf: manejar(async (peticion, respuesta) => {
    const pdf = await cajaModelo.obtenerPdf(entero(peticion.params.id));
    if (!pdf) throw new ErrorNegocio(404, 'Ese pago no tiene comprobante adjunto.');
    respuesta.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(pdf.nombre_archivo)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store'
    });
    respuesta.send(pdf.datos);
  }),

  // Los pagos nunca se eliminan: se anulan dejando usuario, fecha y motivo (RNF06)
  // POST /api/v1/pagos/:id/anular   { motivo }
  anularPago: manejar(async (peticion, respuesta) => {
    const motivo = (peticion.body.motivo || '').trim();
    if (!motivo) throw new ErrorNegocio(400, 'Ingresá el motivo de la anulación.');
    const pago = await cajaModelo.obtenerPago(entero(peticion.params.id));
    if (!pago) throw new ErrorNegocio(404, 'El pago no existe.');
    if (pago.anulado) throw new ErrorNegocio(409, 'El pago ya estaba anulado.');

    await enTransaccion(async (bd) => {
      const reserva = await reservaModelo.obtenerPorId(pago.reserva_id, bd);
      if (reserva.estado === 'realizada') {
        throw new ErrorNegocio(409, 'El evento ya está liquidado. Registrá un ajuste en lugar de anular el pago.');
      }
      await cajaModelo.anularPago(pago.id, motivo, peticion.usuario.id, bd);
      await reservaModelo.registrarHistorial(pago.reserva_id, peticion.usuario.id, 'anulacion_pago',
        `Anulado pago #${pago.id} de ${formatoPesos(pago.monto)}. Motivo: ${motivo}`, bd);
    });

    respuesta.json(await detalleReserva(pago.reserva_id));
  }),

  // CU-14 · Emitir liquidación final — transición En curso → Realizada
  // POST /api/v1/reservas/:id/liquidacion   { medio, comprobante }  (medio obligatorio si queda saldo)
  emitirLiquidacion: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const { medio } = peticion.body;
    const comprobante = (peticion.body.comprobante || '').trim();

    await enTransaccion(async (bd) => {
      const reserva = await reservaModelo.obtenerPorId(id, bd);
      if (!reserva) throw new ErrorNegocio(404, 'La reserva no existe.');
      if (reserva.estado !== 'en_curso') throw new ErrorNegocio(409, 'Sólo se liquida un evento en curso.');

      const { evento, cuenta } = await cuentaActual(reserva, bd);
      // Sin el conteo real no se puede calcular el excedente: es la fuga de ingresos que el sistema viene a cerrar
      if (!evento?.asistentes_actualizado_en) {
        throw new ErrorNegocio(409, 'Cargá la cantidad real de asistentes antes de emitir la liquidación.');
      }

      // Si queda saldo, se registra el cobro en el mismo acto
      if (cuenta.saldo > 0) {
        if (!MEDIOS.includes(medio)) throw new ErrorNegocio(400, `Queda un saldo de ${formatoPesos(cuenta.saldo)}. Elegí el medio con que se cobra.`);
        if (medio !== 'efectivo' && !comprobante) throw new ErrorNegocio(400, 'Indicá el número de comprobante del cobro.');
        await cajaModelo.crearPago({
          reserva_id: id, tipo: 'saldo', monto: cuenta.saldo, medio, comprobante, registrado_por: peticion.usuario.id
        }, bd);
        await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'pago',
          `Saldo final de ${formatoPesos(cuenta.saldo)} (${medio.replace('_', ' ')})${comprobante ? ` · ${comprobante}` : ''}`, bd);
      }

      await cajaModelo.crearLiquidacion({
        reserva_id: id,
        presupuesto: cuenta.presupuesto,
        personas_contratadas: cuenta.personas_contratadas,
        asistentes_reales: cuenta.asistentes_reales,
        excedente_personas: cuenta.excedente_personas,
        monto_excedente: cuenta.monto_excedente,
        monto_adicionales: cuenta.monto_adicionales,
        total: cuenta.total,
        total_pagado: redondear(cuenta.total_pagado + Math.max(0, cuenta.saldo)),
        saldo: Math.min(0, cuenta.saldo), // negativo = saldo a favor del cliente
        emitida_por: peticion.usuario.id
      }, bd);
      await reservaModelo.cambiarEstado(id, 'realizada', bd);
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'liquidacion',
        `Liquidación final emitida por ${formatoPesos(cuenta.total)}. Evento cerrado.`, bd);
    });

    respuesta.json(await detalleReserva(id));
  }),

  // GET /api/v1/caja/movimientos?desde=&hasta=
  movimientos: manejar(async (peticion, respuesta) => {
    const { desde, hasta } = peticion.query;
    if (!REGEX_FECHA.test(desde || '') || !REGEX_FECHA.test(hasta || '')) throw new ErrorNegocio(400, 'Indicá el período.');
    respuesta.json(await cajaModelo.movimientos(desde, hasta));
  }),

  // GET /api/v1/caja/pendientes
  pendientes: manejar(async (peticion, respuesta) => {
    respuesta.json(await cajaModelo.saldosPendientes());
  }),

  // CU-15 · Emitir reportes de ingresos (RF11). Sólo Gerencia y Administración (RNF05).
  // GET /api/v1/reportes?desde=&hasta=
  reportes: manejar(async (peticion, respuesta) => {
    const { desde, hasta } = peticion.query;
    if (!REGEX_FECHA.test(desde || '') || !REGEX_FECHA.test(hasta || '')) throw new ErrorNegocio(400, 'Indicá el período.');
    if (desde > hasta) throw new ErrorNegocio(400, 'La fecha "desde" debe ser anterior a "hasta".');
    const [ingresos, ranking, resumen] = await Promise.all([
      cajaModelo.ingresosPorMes(desde, hasta),
      cajaModelo.rankingAdicionales(desde, hasta),
      cajaModelo.resumenPeriodo(desde, hasta)
    ]);
    const totalCobrado = redondear(ingresos.reduce((suma, fila) => suma + Number(fila.total), 0));
    respuesta.json({ desde, hasta, total_cobrado: totalCobrado, ingresos_por_mes: ingresos, ranking_adicionales: ranking, resumen });
  })
};

export default cajaControlador;
