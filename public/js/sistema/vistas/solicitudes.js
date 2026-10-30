// Bandeja de solicitudes que dejan los clientes desde la página web (ver CAMBIOS.md).
// Una solicitud NO es una reserva: no ocupa la fecha. Ventas la revisa y, con un clic,
// abre "Nueva reserva" con todo precargado (CU-02 vuelve a verificar la superposición al guardar).
import { api, query } from '../api.js';
import { ponerMigas, navegar } from '../navegacion.js';
import { esc, fechaLarga, fechaHora, confirmar, avisar, mostrarError, panelError, enlaceWhatsapp } from '../util.js';

const FILTROS = [
  { valor: 'pendiente', texto: 'Pendientes' },
  { valor: 'convertida', texto: 'Convertidas en reserva' },
  { valor: 'descartada', texto: 'Descartadas' }
];

export async function actualizarContadorSolicitudes() {
  const enlace = document.querySelector('#menu-lateral a[data-ruta="solicitudes"]');
  if (!enlace) return;
  try {
    const { pendientes } = await api.get('/solicitudes/cantidad');
    enlace.querySelector('.menu-contador')?.remove();
    if (pendientes > 0) enlace.insertAdjacentHTML('beforeend', `<span class="menu-contador" aria-label="${pendientes} pendientes">${pendientes}</span>`);
  } catch { /* el contador es sólo informativo */ }
}

function tarjeta(s) {
  const nombre = `${esc(s.nombre)} ${esc(s.apellido)}`;
  const mensaje = `Hola ${s.nombre}, te escribimos de Diverty Park por tu solicitud de reserva N.º ${s.id} para el ${fechaLarga(s.fecha)} de ${s.hora_inicio} a ${s.hora_fin} en la ${s.sala_nombre}.`;

  let estado = '';
  if (s.estado === 'pendiente') {
    estado = s.vencida
      ? '<p class="solicitud-ocupada">La fecha ya pasó.</p>'
      : s.disponible
        ? '<p class="solicitud-libre">El horario sigue libre.</p>'
        : `<p class="solicitud-ocupada">El horario ya se ocupó (${esc(s.ocupada_por)}). Ofrecele otro horario.</p>`;
  } else if (s.estado === 'convertida') {
    estado = `<p>Convertida en la <a href="#/reservas/${s.reserva_id}">reserva N.º ${s.reserva_id}</a> por ${esc(s.atendida_por_usuario || '—')} el ${fechaHora(s.atendida_en)}.</p>`;
  } else {
    estado = `<p>Descartada por ${esc(s.atendida_por_usuario || '—')} el ${fechaHora(s.atendida_en)}. Motivo: <em>${esc(s.motivo_descarte || '')}</em></p>`;
  }

  return `
    <article class="solicitud" data-id="${s.id}">
      <div>
        <h3>N.º ${s.id} · ${nombre} <span class="nota">· recibida ${fechaHora(s.creada_en)}</span></h3>
        <p><strong>${fechaLarga(s.fecha)}</strong>, de ${s.hora_inicio} a ${s.hora_fin} · ${esc(s.sala_nombre)}</p>
        <p>${esc(s.paquete_nombre)} · ${s.personas} invitados</p>
        <p class="nota">DNI ${esc(s.dni)} · Tel. ${esc(s.telefono)}${s.email ? ` · ${esc(s.email)}` : ''}
          ${s.cliente_id ? ` · <a href="#/clientes/${s.cliente_id}">ya es cliente</a>` : ' · cliente nuevo'}</p>
        ${s.comentarios ? `<p class="nota">“${esc(s.comentarios)}”</p>` : ''}
        ${estado}
      </div>
      <div class="acciones">
        <a class="boton boton-secundario" target="_blank" rel="noopener" href="${enlaceWhatsapp(s.telefono, mensaje)}">WhatsApp</a>
        ${s.estado === 'pendiente' ? `
          <button class="boton boton-secundario" data-descartar="${s.id}">Descartar</button>
          ${!s.vencida ? `<button class="boton boton-primario" data-convertir="${s.id}">${s.disponible ? 'Crear reserva' : 'Crear con otro horario'}</button>` : ''}` : ''}
      </div>
    </article>`;
}

export default async function vistaSolicitudes(contenedor, { parametros }) {
  ponerMigas(['Agenda', 'agenda'], 'Solicitudes web');
  const filtro = FILTROS.some(f => f.valor === parametros.estado) ? parametros.estado : 'pendiente';

  contenedor.innerHTML = `
    <h1>Solicitudes web</h1>
    <p class="nota">Pedidos que dejan los clientes desde la página de reservas. No ocupan la fecha hasta que se registra la reserva.</p>
    <div class="filtros-solicitudes">
      ${FILTROS.map(f => `<a class="boton boton-secundario${f.valor === filtro ? ' activo' : ''}" href="#/solicitudes${query({ estado: f.valor === 'pendiente' ? '' : f.valor })}">${f.texto}</a>`).join('')}
    </div>
    <div id="lista-solicitudes"><p class="cargando">Cargando...</p></div>`;

  const lista = contenedor.querySelector('#lista-solicitudes');

  async function cargar() {
    let solicitudes;
    try {
      solicitudes = await api.get(`/solicitudes${query({ estado: filtro })}`);
    } catch (error) {
      return panelError(lista, error, cargar);
    }
    lista.innerHTML = solicitudes.length
      ? solicitudes.map(tarjeta).join('')
      : `<div class="caja-mensaje"><p>${filtro === 'pendiente' ? 'No hay solicitudes pendientes. ¡Bandeja al día!' : 'No hay solicitudes en este estado.'}</p></div>`;
    actualizarContadorSolicitudes();
  }

  lista.addEventListener('click', async (evento) => {
    const convertir = evento.target.closest('[data-convertir]');
    if (convertir) return navegar(`nueva-reserva${query({ solicitud: convertir.dataset.convertir })}`);

    const descartar = evento.target.closest('[data-descartar]');
    if (descartar) {
      const motivo = await confirmar({
        titulo: 'Descartar solicitud',
        mensaje: 'La solicitud deja de estar pendiente. Conviene avisarle al cliente por WhatsApp.',
        textoBoton: 'Descartar', peligro: true, pedirMotivo: true, etiquetaMotivo: 'Motivo (ej.: eligió otra fecha, no respondió)'
      });
      if (!motivo) return;
      try {
        await api.post(`/solicitudes/${descartar.dataset.descartar}/descartar`, { motivo });
        avisar('Solicitud descartada.');
        cargar();
      } catch (error) {
        mostrarError(error);
      }
    }
  });

  cargar();
}
