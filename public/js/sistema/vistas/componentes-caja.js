// Componentes del módulo M4 que se reutilizan en la ficha de reserva, el evento del día y la caja
import { api } from '../api.js';
import { esc, pesos, hoy, MEDIOS, TIPOS_PAGO, abrirModal, avisar, conBoton, fechaLarga } from '../util.js';

// Estado de cuenta: presupuesto + excedentes + adicionales − pagos = saldo (RF09)
export function tablaCuenta(reserva) {
  const cuenta = reserva.liquidacion
    ? { ...reserva.liquidacion, total_pagado: reserva.cuenta.total_pagado, saldo: reserva.cuenta.saldo }
    : reserva.cuenta;
  const hayEvento = !!reserva.evento;
  return `
    <table class="tabla-cuenta">
      <tr><td>Presupuesto (${cuenta.personas_contratadas} personas)</td><td class="numero">${pesos(cuenta.presupuesto)}</td></tr>
      <tr class="${hayEvento ? '' : 'fila-tenue'}"><td>Excedente${hayEvento ? ` (${cuenta.excedente_personas} pers. sobre ${cuenta.asistentes_reales} asistentes)` : ' (se calcula el día del evento)'}</td><td class="numero">${pesos(cuenta.monto_excedente)}</td></tr>
      <tr class="${hayEvento ? '' : 'fila-tenue'}"><td>Consumos adicionales</td><td class="numero">${pesos(cuenta.monto_adicionales)}</td></tr>
      <tr class="fila-total"><td>Total</td><td class="numero">${pesos(cuenta.total)}</td></tr>
      <tr><td>Pagos realizados</td><td class="numero">− ${pesos(cuenta.total_pagado)}</td></tr>
      <tr class="fila-saldo ${cuenta.saldo > 0 ? 'saldo-pendiente' : 'saldo-cero'}"><td>${cuenta.saldo < 0 ? 'Saldo a favor del cliente' : 'Saldo a cobrar'}</td><td class="numero">${pesos(Math.abs(cuenta.saldo))}</td></tr>
    </table>
    ${reserva.liquidacion ? `<p class="nota">Liquidación emitida el ${new Date(reserva.liquidacion.emitida_en).toLocaleString('es-AR')} por ${esc(reserva.liquidacion.emitida_por_usuario || '')}.</p>` : ''}`;
}

// CU-13 · Registrar seña y pagos
export function formularioPago(reserva, tipoInicial, alTerminar) {
  const saldo = reserva.cuenta.saldo;
  const senaPendiente = Math.max(0, Number(reserva.sena_requerida) - reserva.cuenta.total_pagado);
  const tipos = reserva.estado === 'presenada' ? ['sena'] : reserva.estado === 'realizada' ? ['ajuste'] : ['parcial', 'saldo'];
  const tipo = tipos.includes(tipoInicial) ? tipoInicial : tipos[0];
  const montoSugerido = tipo === 'sena' ? senaPendiente : tipo === 'ajuste' ? '' : saldo;

  const { cuerpo, cerrar } = abrirModal({
    titulo: tipo === 'ajuste' ? 'Registrar ajuste' : tipo === 'sena' ? 'Registrar seña' : 'Registrar pago',
    contenido: `
      <p class="nota">Reserva N.º ${reserva.id} · ${esc(reserva.cliente_nombre)} ${esc(reserva.cliente_apellido)} · ${fechaLarga(reserva.fecha)}</p>
      <p>Saldo pendiente: <strong>${pesos(saldo)}</strong>${reserva.estado === 'presenada' ? ` · Seña requerida: <strong>${pesos(reserva.sena_requerida)}</strong>` : ''}</p>
      <form class="formulario" novalidate>
        <div class="columnas-2 compacta">
          <label class="campo"><span>Tipo</span>
            <select name="tipo">${tipos.map(t => `<option value="${t}" ${t === tipo ? 'selected' : ''}>${TIPOS_PAGO[t]}</option>`).join('')}</select>
          </label>
          <label class="campo"><span>Monto${tipo === 'ajuste' ? ' (negativo para devolver)' : ''}</span>
            <input type="number" name="monto" step="1" ${tipo === 'ajuste' ? '' : 'min="1"'} value="${montoSugerido}" required>
          </label>
          <label class="campo"><span>Medio de pago</span>
            <select name="medio">${Object.entries(MEDIOS).map(([valor, texto]) => `<option value="${valor}">${texto}</option>`).join('')}</select>
          </label>
          <label class="campo"><span>Fecha del pago</span><input type="date" name="fecha_pago" value="${hoy()}" max="${hoy()}"></label>
        </div>
        <label class="campo"><span id="etiqueta-comprobante">${tipo === 'ajuste' ? 'Motivo del ajuste' : 'Comprobante / N.º de operación'}</span><input name="comprobante" maxlength="200"></label>
        <p class="nota" id="nota-medio"></p>
        <div class="caja-mensaje caja-error" id="error-pago" hidden></div>
        <div class="acciones">
          <button type="button" class="boton boton-secundario" data-cerrar>Cancelar</button>
          <button type="submit" class="boton boton-primario">Registrar</button>
        </div>
      </form>`
  });

  const formulario = cuerpo.querySelector('form');
  const notaMedio = cuerpo.querySelector('#nota-medio');
  const actualizarNota = () => {
    notaMedio.textContent = {
      efectivo: 'Pago en efectivo: el comprobante es opcional.',
      transferencia: 'Indicá el número de operación de la transferencia.',
      mercado_pago: 'Indicá el número de operación de Mercado Pago que envió el cliente.',
      tarjeta: 'Indicá el número de cupón o autorización.'
    }[formulario.medio.value];
  };
  formulario.medio.addEventListener('change', actualizarNota);
  formulario.tipo.addEventListener('change', () => {
    if (formulario.tipo.value === 'saldo') formulario.monto.value = saldo;
  });
  actualizarNota();
  cuerpo.querySelector('[data-cerrar]').addEventListener('click', cerrar);

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const error = cuerpo.querySelector('#error-pago');
    error.hidden = true;
    try {
      const resultado = await conBoton(formulario.querySelector('[type=submit]'), () =>
        api.post(`/reservas/${reserva.id}/pagos`, Object.fromEntries(new FormData(formulario))));
      cerrar();
      avisar(resultado.mensaje);
      alTerminar(resultado);
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  });
}

// CU-14 · Emitir liquidación final
export function formularioLiquidacion(reserva, alTerminar) {
  const cuenta = reserva.cuenta;
  const sinAsistentes = !reserva.evento?.asistentes_actualizado_en;
  const { cuerpo, cerrar } = abrirModal({
    titulo: 'Liquidación final del evento',
    ancho: 'modal-ancho',
    contenido: `
      <p class="nota">Reserva N.º ${reserva.id} · ${esc(reserva.cliente_nombre)} ${esc(reserva.cliente_apellido)} · ${esc(reserva.sala_nombre)}</p>
      ${sinAsistentes ? '<div class="caja-mensaje caja-error">Antes de liquidar hay que cargar la cantidad real de asistentes: sin el conteo no se puede calcular el excedente.</div>' : ''}
      ${tablaCuenta(reserva)}
      <ul class="lista-detalle">
        ${reserva.consumos.filter(c => !c.anulado).map(c => `<li>${Number(c.cantidad)} × ${esc(c.descripcion)} <span>${pesos(c.subtotal)}</span></li>`).join('') || '<li class="nota">Sin consumos adicionales.</li>'}
      </ul>
      <form class="formulario" novalidate>
        ${cuenta.saldo > 0 ? `
          <p>Cobro del saldo: <strong>${pesos(cuenta.saldo)}</strong></p>
          <div class="columnas-2 compacta">
            <label class="campo"><span>Medio de pago</span>
              <select name="medio">${Object.entries(MEDIOS).map(([valor, texto]) => `<option value="${valor}">${texto}</option>`).join('')}</select>
            </label>
            <label class="campo"><span>Comprobante</span><input name="comprobante" maxlength="200"></label>
          </div>` : `<p>${cuenta.saldo < 0 ? `El cliente tiene un saldo a favor de ${pesos(-cuenta.saldo)}.` : 'No queda saldo pendiente.'}</p>`}
        <div class="caja-mensaje caja-error" id="error-liquidacion" hidden></div>
        <div class="acciones">
          <button type="button" class="boton boton-secundario" data-cerrar>Volver</button>
          <button type="submit" class="boton boton-primario" ${sinAsistentes ? 'disabled' : ''}>${cuenta.saldo > 0 ? 'Cobrar saldo y cerrar evento' : 'Emitir liquidación y cerrar'}</button>
        </div>
      </form>`
  });
  cuerpo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  const formulario = cuerpo.querySelector('form');
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const error = cuerpo.querySelector('#error-liquidacion');
    error.hidden = true;
    try {
      const nueva = await conBoton(formulario.querySelector('[type=submit]'), () =>
        api.post(`/reservas/${reserva.id}/liquidacion`, Object.fromEntries(new FormData(formulario))));
      cerrar();
      avisar('Liquidación emitida. El evento quedó cerrado como Realizado.');
      alTerminar(nueva);
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  });
}
