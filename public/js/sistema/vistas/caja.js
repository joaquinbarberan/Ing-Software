// Módulo M4 — Caja y cobros: saldos pendientes por reserva y movimientos de caja del período
import { api, query } from '../api.js';
import { ponerMigas } from '../navegacion.js';
import {
  esc, pesos, hoy, sumarDias, fechaCorta, fechaHora, etiquetaEstado, MEDIOS, TIPOS_PAGO, panelError, mostrarError
} from '../util.js';
import { formularioPago } from './componentes-caja.js';

export default async function vistaCaja(contenedor) {
  ponerMigas('Caja y cobros');
  contenedor.innerHTML = `
    <h1>Caja y cobros</h1>
    <section class="tarjeta">
      <h2>Reservas con saldo pendiente</h2>
      <div id="pendientes"></div>
    </section>
    <section class="tarjeta">
      <div class="barra-herramientas">
        <h2>Movimientos de caja</h2>
        <form class="formulario-linea" id="form-periodo">
          <label class="campo"><span>Desde</span><input type="date" name="desde" value="${sumarDias(hoy(), -30)}"></label>
          <label class="campo"><span>Hasta</span><input type="date" name="hasta" value="${hoy()}"></label>
          <button class="boton boton-secundario" type="submit">Ver</button>
        </form>
      </div>
      <div id="movimientos"></div>
    </section>`;

  const pendientes = contenedor.querySelector('#pendientes');
  const movimientos = contenedor.querySelector('#movimientos');
  const formPeriodo = contenedor.querySelector('#form-periodo');

  async function cargarPendientes() {
    let filas;
    try { filas = await api.get('/caja/pendientes'); } catch (error) { return panelError(pendientes, error, cargarPendientes); }
    filas = filas.filter(f => Number(f.importe_estimado) - Number(f.pagado) > 0);
    pendientes.innerHTML = filas.length === 0 ? '<p class="nota">No hay saldos pendientes.</p>' : `
      <div class="tabla-desplazable"><table class="tabla">
        <thead><tr><th>Evento</th><th>Cliente</th><th>Estado</th><th class="numero">Importe</th><th class="numero">Pagado</th><th class="numero">Pendiente</th><th></th></tr></thead>
        <tbody>${filas.map(f => {
          const senaFalta = f.estado === 'presenada';
          return `
          <tr>
            <td><a href="#/reservas/${f.id}">${fechaCorta(f.fecha)} ${f.hora_inicio}</a><br><span class="nota">${esc(f.sala_nombre)}</span></td>
            <td>${esc(f.cliente)}</td>
            <td>${etiquetaEstado(f.estado)}</td>
            <td class="numero">${pesos(f.importe_estimado)}</td>
            <td class="numero">${pesos(f.pagado)}</td>
            <td class="numero"><strong>${pesos(Number(f.importe_estimado) - Number(f.pagado))}</strong>${senaFalta ? `<br><span class="nota">seña ${pesos(f.sena_requerida)}</span>` : ''}</td>
            <td><button class="boton boton-secundario boton-chico" data-cobrar="${f.id}">${senaFalta ? 'Registrar seña' : 'Registrar pago'}</button></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table></div>
      <p class="nota">El pendiente se calcula sobre el presupuesto. Los excedentes y adicionales se suman el día del evento en la liquidación final.</p>`;

    pendientes.querySelectorAll('[data-cobrar]').forEach(boton => boton.addEventListener('click', async () => {
      try {
        const reserva = await api.get(`/reservas/${boton.dataset.cobrar}`);
        formularioPago(reserva, reserva.estado === 'presenada' ? 'sena' : 'parcial', () => { cargarPendientes(); cargarMovimientos(); });
      } catch (error) { mostrarError(error); }
    }));
  }

  async function cargarMovimientos() {
    const { desde, hasta } = Object.fromEntries(new FormData(formPeriodo));
    let filas;
    try { filas = await api.get(`/caja/movimientos${query({ desde, hasta })}`); } catch (error) { return panelError(movimientos, error, cargarMovimientos); }
    const validos = filas.filter(f => !f.anulado);
    const porMedio = Object.keys(MEDIOS).map(medio => [medio, validos.filter(f => f.medio === medio).reduce((s, f) => s + Number(f.monto), 0)]);
    const total = validos.reduce((s, f) => s + Number(f.monto), 0);

    movimientos.innerHTML = `
      <div class="tarjetas-resumen">
        <div class="tarjeta-dato"><span>Total cobrado</span><strong>${pesos(total)}</strong></div>
        ${porMedio.map(([medio, monto]) => `<div class="tarjeta-dato"><span>${MEDIOS[medio]}</span><strong>${pesos(monto)}</strong></div>`).join('')}
      </div>
      ${filas.length === 0 ? '<p class="nota">No hay movimientos en el período.</p>' : `
      <div class="tabla-desplazable"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Reserva</th><th>Tipo</th><th>Medio</th><th>Comprobante</th><th class="numero">Monto</th><th>Registró</th></tr></thead>
        <tbody>${filas.map(f => `
          <tr class="${f.anulado ? 'fila-anulada' : ''}">
            <td>${fechaCorta(f.fecha_pago)}</td>
            <td><a href="#/reservas/${f.reserva_id}">N.º ${f.reserva_id}</a> · ${esc(f.cliente)}<br><span class="nota">evento ${fechaCorta(f.fecha_evento)}</span></td>
            <td>${TIPOS_PAGO[f.tipo]}${f.anulado ? ' <span class="etiqueta estado-cancelada">Anulado</span>' : ''}</td>
            <td>${MEDIOS[f.medio]}</td>
            <td>${esc(f.comprobante || '—')}</td>
            <td class="numero">${pesos(f.monto)}</td>
            <td>${esc(f.registrado_por_usuario || '')}<br><span class="nota">${fechaHora(f.registrado_en)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>`}`;
  }

  formPeriodo.addEventListener('submit', (e) => { e.preventDefault(); cargarMovimientos(); });
  await Promise.all([cargarPendientes(), cargarMovimientos()]);
}
