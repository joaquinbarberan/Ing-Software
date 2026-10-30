// Ficha de la reserva: CU-03 Modificar o cancelar reserva, y todo lo que cuelga de ella
// (pagos de M4, datos del evento de M3, coordinadores, insumos e historial de cambios).
import { api } from '../api.js';
import { ponerMigas } from '../navegacion.js';
import {
  esc, puede, pesos, hoy, fechaLarga, fechaCorta, fechaHora, etiquetaEstado, MEDIOS, TIPOS_PAGO,
  abrirModal, confirmar, avisar, mostrarError, conBoton, panelError, enlaceWhatsapp
} from '../util.js';
import { htmlSelectorHorarios, conectarSelectorHorarios, duracionEntre } from './componentes-horarios.js';
import { formularioPago, formularioLiquidacion, tablaCuenta } from './componentes-caja.js';
import { seccionEvento } from './componentes-evento.js';

const ACCIONES_HISTORIAL = {
  alta: 'Alta', modificacion: 'Modificación', cancelacion: 'Cancelación', expiracion: 'Expiración automática',
  confirmacion: 'Confirmación', pago: 'Pago', anulacion_pago: 'Anulación de pago', habilitacion: 'Evento habilitado',
  asistentes: 'Asistentes', consumo: 'Consumo', anulacion_consumo: 'Anulación de consumo', coordinador: 'Coordinadores',
  insumos: 'Insumos', liquidacion: 'Liquidación'
};

export default async function vistaReserva(contenedor, { partes, parametros }) {
  const id = Number(partes[0]);
  ponerMigas(['Agenda', 'agenda'], `Reserva N.º ${id}`);

  let reserva;
  let salas = [];
  let coordinadores = [];

  async function cargar() {
    try {
      [reserva, salas] = await Promise.all([api.get(`/reservas/${id}`), api.get('/salas')]);
      if (puede('administracion')) coordinadores = await api.get('/catalogos/coordinadores?activos=true');
    } catch (error) {
      return panelError(contenedor, error, cargar);
    }
    dibujar();
  }

  // Reemplaza la reserva con la versión que devuelve el servidor después de cada acción
  function actualizar(nueva) {
    reserva = nueva;
    dibujar();
  }

  function dibujar() {
    const r = reserva;
    const editable = ['presenada', 'confirmada'].includes(r.estado);
    const puedeEditar = editable && puede('ventas', 'administracion');
    const sala = salas.find(s => s.id === r.sala_id);

    contenedor.innerHTML = `
      <div class="cabecera-ficha">
        <div>
          <h1>Reserva N.º ${r.id} ${etiquetaEstado(r.estado)}</h1>
          <p class="subtitulo">${fechaLarga(r.fecha)} · ${r.hora_inicio} a ${r.hora_fin} · ${esc(r.sala_nombre)}</p>
        </div>
        <div class="grupo-botones">
          <button class="boton boton-secundario" data-imprimir>Imprimir</button>
          ${puedeEditar ? '<button class="boton boton-peligro" data-cancelar>Cancelar reserva</button>' : ''}
        </div>
      </div>

      ${r.solo_lectura ? `<div class="caja-mensaje">La reserva está <strong>${esc(r.estado)}</strong>: se muestra en modo sólo lectura (RN08).
        ${r.estado === 'realizada' && puede('ventas', 'encargado', 'administracion') ? 'Cualquier corrección se registra como un ajuste en Caja.' : ''}
        ${r.motivo_cancelacion ? `<br>Motivo de cancelación: <em>${esc(r.motivo_cancelacion)}</em>` : ''}</div>` : ''}
      ${r.estado === 'presenada' ? `<div class="caja-mensaje caja-advertencia">Sin seña registrada. Si no se registra antes del ${fechaHora(new Date(new Date(r.fecha_alta).getTime() + 72 * 3600 * 1000))}, la reserva expira y la fecha se libera (RN03).</div>` : ''}

      <div class="columnas-2">
        <section class="tarjeta">
          <h2>Datos de la reserva</h2>
          <form id="form-modificar" class="formulario" novalidate>
            <fieldset ${puedeEditar ? '' : 'disabled'}>
              <div class="columnas-3 compacta">
                <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${r.fecha}" min="${hoy() < r.fecha ? hoy() : r.fecha}" required></label>
                <label class="campo"><span>Sala</span>
                  <select name="sala_id">${salas.map(s => `<option value="${s.id}" ${s.id === r.sala_id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select>
                </label>
                <label class="campo"><span>Personas contratadas</span><input type="number" name="personas_contratadas" min="1" value="${r.personas_contratadas}" required></label>
              </div>
              ${puedeEditar
                ? htmlSelectorHorarios({ horaInicio: r.hora_inicio, horaFin: r.hora_fin })
                : `<input type="hidden" name="hora_inicio" value="${r.hora_inicio}"><input type="hidden" name="hora_fin" value="${r.hora_fin}">`}
              ${r.paquete_personalizado ? `<label class="campo"><span>Importe del paquete personalizado</span><input type="number" name="importe_manual" value="${r.importe_estimado}" ${puede('administracion') ? '' : 'readonly'}></label>` : ''}
              <label class="campo"><span>Observaciones</span><input name="observaciones" value="${esc(r.observaciones || '')}" maxlength="500"></label>
              ${puedeEditar ? `
                <label class="campo"><span>Motivo del cambio <em>(opcional, queda en el historial)</em></span><input name="motivo" maxlength="200"></label>
                <div class="acciones"><button type="submit" class="boton boton-primario">Guardar cambios</button></div>` : ''}
            </fieldset>
          </form>
          <div id="error-modificar"></div>
          <dl class="datos">
            <dt>Paquete</dt><dd>${esc(r.paquete_nombre)}</dd>
            <dt>Importe estimado</dt><dd>${pesos(r.importe_estimado)}</dd>
            <dt>Seña requerida</dt><dd>${pesos(r.sena_requerida)}</dd>
            <dt>Capacidad de la sala</dt><dd>${sala ? sala.capacidad_ninos + sala.capacidad_adultos : '—'} personas</dd>
            <dt>Alta</dt><dd>${fechaHora(r.fecha_alta)} por ${esc(r.creado_por_usuario || '—')}</dd>
          </dl>
        </section>

        <section class="tarjeta">
          <h2>Cliente</h2>
          <p class="dato-grande-texto"><a href="#/clientes/${r.cliente_id}">${esc(r.cliente_nombre)} ${esc(r.cliente_apellido)}</a></p>
          <dl class="datos">
            <dt>DNI</dt><dd>${esc(r.cliente_dni)}</dd>
            <dt>Teléfono</dt><dd>${esc(r.cliente_telefono || '—')} ${r.cliente_telefono ? `<a class="enlace-chico" target="_blank" rel="noopener" href="${enlaceWhatsapp(r.cliente_telefono, `Hola ${r.cliente_nombre}, te escribimos de Diverty Park por tu reserva del ${fechaCorta(r.fecha)}.`)}">WhatsApp</a>` : ''}</dd>
            <dt>Correo</dt><dd>${esc(r.cliente_email || '—')}</dd>
          </dl>

          <h2>Estado de cuenta</h2>
          ${tablaCuenta(r)}
          <div class="acciones" id="acciones-caja"></div>
        </section>
      </div>

      <section class="tarjeta">
        <h2>Pagos</h2>
        ${r.pagos.length === 0 ? '<p class="nota">Todavía no se registraron pagos.</p>' : `
        <div class="tabla-desplazable"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Medio</th><th>Comprobante</th><th class="numero">Monto</th><th>Registró</th><th></th></tr></thead>
          <tbody>${r.pagos.map(p => `
            <tr class="${p.anulado ? 'fila-anulada' : ''}">
              <td>${fechaCorta(p.fecha_pago)}</td>
              <td>${TIPOS_PAGO[p.tipo]}</td>
              <td>${MEDIOS[p.medio]}</td>
              <td>${esc(p.comprobante || '—')}</td>
              <td class="numero">${pesos(p.monto)}</td>
              <td>${esc(p.registrado_por_usuario || '')} <span class="nota">${fechaHora(p.registrado_en)}</span></td>
              <td>${p.anulado
                ? `<span class="nota" title="${esc(p.motivo_anulacion)}">Anulado por ${esc(p.anulado_por_usuario)}: ${esc(p.motivo_anulacion)}</span>`
                : (puede('administracion') && r.estado !== 'realizada' ? `<button class="boton-texto" data-anular-pago="${p.id}">Anular</button>` : '')}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`}
      </section>

      <div id="seccion-evento"></div>

      ${puede('administracion') || r.asignaciones.length || r.pedido_insumos.length ? `
      <div class="columnas-2">
        <section class="tarjeta">
          <h2>Coordinadores</h2>
          ${r.asignaciones.length === 0 ? '<p class="nota">Sin coordinadores asignados.</p>' : `
          <ul class="lista">${r.asignaciones.map(a => `
            <li>
              <span>${esc(a.nombre)} <span class="nota">${esc(a.telefono || '')}</span></span>
              <span>
                ${a.telefono ? `<a class="enlace-chico" target="_blank" rel="noopener" href="${enlaceWhatsapp(a.telefono, `Hola ${a.nombre}, quedaste asignado/a al cumpleaños del ${fechaLarga(r.fecha)} de ${r.hora_inicio} a ${r.hora_fin} en la ${r.sala_nombre} de Diverty Park.`)}">Avisar</a>` : ''}
                ${puede('administracion') && !r.solo_lectura ? `<button class="boton-texto" data-quitar="${a.id}">Quitar</button>` : ''}
              </span>
            </li>`).join('')}</ul>`}
          ${puede('administracion') && !r.solo_lectura ? `
            <form class="formulario-linea" id="form-coordinador">
              <select name="coordinador_id" aria-label="Coordinador">
                ${coordinadores.filter(c => !r.asignaciones.some(a => a.coordinador_id === c.id)).map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
              </select>
              <button class="boton boton-secundario" type="submit">Asignar</button>
            </form>
            <p class="nota">Sugerido: ${Math.max(1, Math.ceil(r.personas_contratadas / 15))} coordinador(es) para ${r.personas_contratadas} personas.</p>` : ''}
        </section>

        <section class="tarjeta">
          <h2>Insumos del evento</h2>
          ${r.pedido_insumos.length === 0 ? '<p class="nota">Todavía no se generó el pedido de insumos.</p>' : `
          <div class="tabla-desplazable"><table class="tabla tabla-compacta">
            <thead><tr><th>Insumo</th><th class="numero">Cantidad</th><th class="numero">Costo</th><th>Estado</th></tr></thead>
            <tbody>${r.pedido_insumos.map(l => `
              <tr>
                <td>${esc(l.nombre)}</td>
                <td class="numero">${Number(l.cantidad)} ${esc(l.unidad)}</td>
                <td class="numero">${pesos(l.recibido ? l.costo_real : l.costo_estimado)}${l.recibido ? '' : ' <span class="nota">est.</span>'}</td>
                <td>${l.recibido ? '<span class="etiqueta etiqueta-ok">Recibido</span>' : (puede('administracion') && !r.solo_lectura ? `<button class="boton-texto" data-recibir="${l.id}" data-costo="${l.costo_estimado}">Registrar recepción</button>` : 'Pendiente')}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`}
          ${puede('administracion') && !r.solo_lectura ? `<div class="acciones"><button class="boton boton-secundario" data-generar>${r.pedido_insumos.length ? 'Recalcular pendientes' : 'Generar pedido de insumos'}</button></div>` : ''}
        </section>
      </div>` : ''}

      <section class="tarjeta">
        <h2>Historial de cambios</h2>
        <ul class="historial">${r.historial.map(h => `
          <li><span class="historial-fecha">${fechaHora(h.fecha)}</span>
              <strong>${ACCIONES_HISTORIAL[h.accion] || esc(h.accion)}</strong> · ${esc(h.usuario)}
              ${h.detalle ? `<br><span class="nota">${esc(h.detalle)}</span>` : ''}</li>`).join('')}
        </ul>
      </section>`;

    enlazarEventos();
  }

  async function ejecutar(boton, tarea, mensaje) {
    try {
      const resultado = await (boton ? conBoton(boton, tarea) : tarea());
      actualizar(resultado.reserva || resultado);
      if (mensaje || resultado.mensaje) avisar(resultado.mensaje || mensaje);
    } catch (error) {
      mostrarError(error);
    }
  }

  function abrirPago(tipoInicial) {
    formularioPago(reserva, tipoInicial, (resultado) => actualizar(resultado.reserva));
  }

  function enlazarEventos() {
    const r = reserva;
    contenedor.querySelector('[data-imprimir]').addEventListener('click', () => window.print());

    // --- Modificar (CU-03 flujo principal) ---
    const formulario = contenedor.querySelector('#form-modificar');
    // Horarios libres como botones: se mantiene la duración actual del evento y
    // la propia reserva no cuenta como ocupada (ver CAMBIOS.md)
    if (formulario.querySelector('.selector-horarios')) {
      const duracionReserva = duracionEntre(r.hora_inicio, r.hora_fin);
      const selector = conectarSelectorHorarios(formulario, { duracion: () => duracionReserva, excluirId: r.id });
      ['fecha', 'sala_id'].forEach(nombre => formulario[nombre].addEventListener('change', () => selector.actualizar()));
      selector.actualizar();
    }
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const errorModificar = contenedor.querySelector('#error-modificar');
      errorModificar.innerHTML = '';
      const datos = Object.fromEntries(new FormData(formulario));
      if (datos.hora_fin <= datos.hora_inicio) {
        errorModificar.innerHTML = '<div class="caja-mensaje caja-error">La hora de fin debe ser posterior a la de inicio.</div>';
        return;
      }
      try {
        const nueva = await conBoton(formulario.querySelector('[type=submit]'), () => api.put(`/reservas/${r.id}`, datos));
        actualizar(nueva);
        avisar('Reserva actualizada.');
      } catch (error) {
        // E1: la nueva franja está ocupada; la reserva queda como estaba
        errorModificar.innerHTML = `<div class="caja-mensaje caja-error">${esc(error.message)}</div>`;
      }
    });

    // --- Cancelar (A1): confirmación explícita y motivo obligatorio ---
    contenedor.querySelector('[data-cancelar]')?.addEventListener('click', async () => {
      const motivo = await confirmar({
        titulo: 'Cancelar reserva',
        mensaje: `¿Cancelar la reserva de <strong>${esc(r.cliente_nombre)} ${esc(r.cliente_apellido)}</strong> del ${fechaLarga(r.fecha)}? La fecha se libera de inmediato y la acción no se puede deshacer.`,
        textoBoton: 'Sí, cancelar', peligro: true, pedirMotivo: true, etiquetaMotivo: 'Motivo de la cancelación'
      });
      if (motivo) ejecutar(null, () => api.post(`/reservas/${r.id}/cancelar`, { motivo }), 'Reserva cancelada. La fecha quedó liberada.');
    });

    // --- Caja ---
    const accionesCaja = contenedor.querySelector('#acciones-caja');
    if (puede('ventas', 'encargado', 'administracion')) {
      if (r.estado === 'presenada') accionesCaja.innerHTML = '<button class="boton boton-primario" data-pago="sena">Registrar seña</button>';
      if (['confirmada', 'en_curso'].includes(r.estado) && r.cuenta.saldo > 0) accionesCaja.innerHTML = '<button class="boton boton-secundario" data-pago="parcial">Registrar pago</button>';
      if (r.estado === 'realizada') accionesCaja.innerHTML = '<button class="boton boton-secundario" data-pago="ajuste">Registrar ajuste</button>';
    }
    if (r.estado === 'en_curso' && puede('encargado', 'administracion')) {
      accionesCaja.insertAdjacentHTML('beforeend', '<button class="boton boton-primario" data-liquidar>Emitir liquidación final</button>');
    }
    accionesCaja.querySelectorAll('[data-pago]').forEach(b => b.addEventListener('click', () => abrirPago(b.dataset.pago)));
    accionesCaja.querySelector('[data-liquidar]')?.addEventListener('click', () => formularioLiquidacion(r, (nueva) => actualizar(nueva)));

    contenedor.querySelectorAll('[data-anular-pago]').forEach(boton => boton.addEventListener('click', async () => {
      const motivo = await confirmar({
        titulo: 'Anular pago', mensaje: 'El pago no se elimina: queda registrado como anulado, con tu usuario y el motivo (RNF06).',
        textoBoton: 'Anular pago', peligro: true, pedirMotivo: true
      });
      if (motivo) ejecutar(null, () => api.post(`/pagos/${boton.dataset.anularPago}/anular`, { motivo }), 'Pago anulado.');
    }));

    // --- Evento del día (M3) ---
    seccionEvento(contenedor.querySelector('#seccion-evento'), r, actualizar);

    // --- Coordinadores e insumos ---
    contenedor.querySelector('#form-coordinador')?.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const coordinadorId = evento.target.coordinador_id.value;
      if (!coordinadorId) return avisar('No quedan coordinadores para asignar.', 'error');
      ejecutar(evento.target.querySelector('button'), () => api.post(`/reservas/${r.id}/coordinadores`, { coordinador_id: coordinadorId }), 'Coordinador asignado.');
    });
    contenedor.querySelectorAll('[data-quitar]').forEach(boton => boton.addEventListener('click', () =>
      ejecutar(boton, () => api.delete(`/asignaciones/${boton.dataset.quitar}`), 'Coordinador quitado.')));
    contenedor.querySelector('[data-generar]')?.addEventListener('click', (evento) =>
      ejecutar(evento.target, () => api.post(`/reservas/${r.id}/insumos/generar`), 'Pedido de insumos generado.'));
    contenedor.querySelectorAll('[data-recibir]').forEach(boton => boton.addEventListener('click', () => {
      const { cuerpo, cerrar } = abrirModal({
        titulo: 'Registrar recepción del insumo',
        contenido: `
          <form class="formulario">
            <label class="campo"><span>Costo real</span><input type="number" name="costo_real" min="0" step="1" value="${boton.dataset.costo}" required></label>
            <div class="acciones"><button type="button" class="boton boton-secundario" data-cerrar>Cancelar</button><button class="boton boton-primario" type="submit">Registrar</button></div>
          </form>`
      });
      cuerpo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
      cuerpo.querySelector('form').addEventListener('submit', (evento) => {
        evento.preventDefault();
        cerrar();
        ejecutar(null, () => api.post(`/pedidos-insumos/${boton.dataset.recibir}/recibir`, { costo_real: evento.target.costo_real.value }), 'Recepción registrada.');
      });
    }));
  }

  await cargar();
  // Si se llegó desde "Registrar seña ahora" (CU-02 A3), se abre directamente el formulario de pago
  if (parametros.pago && reserva?.estado === 'presenada') abrirPago('sena');
}
