import { enTransaccion } from '../conexion.bd.mjs';
import reservaModelo from '../modelos/reservas.model.mjs';
import eventoModelo from '../modelos/eventos.model.mjs';
import cajaModelo from '../modelos/caja.model.mjs';
import { detalleReserva } from './agenda.controller.mjs';
import { ErrorNegocio, manejar, entero, importe, hoy, REGEX_FECHA } from '../utilidades/errores.mjs';
import { calcularLiquidacion, redondear } from '../utilidades/calculos.mjs';

// Controlador del módulo M4 — Caja y Cobros
// CU-13 Registrar seña y pagos · CU-14 Emitir liquidación final · CU-15 Emitir reportes de ingresos

const TIPOS = ['sena', 'parcial', 'saldo', 'ajuste'];
const MEDIOS = ['efectivo', 'transferencia', 'mercado_pago', 'tarjeta'];

function formatoPesos(monto) {
  return `$${Number(monto).toLocaleString('es-AR')}`;
}

async function cuentaActual(reserva, bd) {
  const [evento, totalAdicionales, totalPagado] = await Promise.all([
    eventoModelo.obtenerPorReserva(reserva.id, bd),
    eventoModelo.totalConsumos(reserva.id, bd),
    cajaModelo.totalPagado(reserva.id, bd)
  ]);
  return { evento, cuenta: calcularLiquidacion({ reserva, evento, totalAdicionales, totalPagado }) };
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

      await cajaModelo.crearPago({
        reserva_id: id, tipo, monto, medio, comprobante, fecha_pago: fechaPago, registrado_por: peticion.usuario.id
      }, bd);
      await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'pago',
        `${tipo === 'sena' ? 'Seña' : tipo.charAt(0).toUpperCase() + tipo.slice(1)} de ${formatoPesos(monto)} (${medio.replace('_', ' ')})${comprobante ? ` · ${comprobante}` : ''}`, bd);

      // RN02 / transición registrarSeña(): Preseñada → Confirmada cuando lo pagado cubre la seña requerida
      if (reserva.estado === 'presenada') {
        const pagado = redondear(cuenta.total_pagado + monto);
        if (pagado + 0.01 >= Number(reserva.sena_requerida)) {
          await reservaModelo.cambiarEstado(id, 'confirmada', bd);
          await reservaModelo.registrarHistorial(id, peticion.usuario.id, 'confirmacion', 'Seña cubierta. La reserva pasó a Confirmada.', bd);
          mensaje = 'Seña registrada. La reserva quedó Confirmada.';
        } else {
          mensaje = `Pago registrado. Falta ${formatoPesos(Number(reserva.sena_requerida) - pagado)} para cubrir la seña y confirmar la reserva.`;
        }
      }
    });

    respuesta.status(201).json({ mensaje, reserva: await detalleReserva(id) });
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
