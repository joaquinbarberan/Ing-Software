// CU-01 · Consultar disponibilidad
import { api, query } from '../api.js';
import { ponerMigas, reemplazarRuta } from '../navegacion.js';
import { esc, puede, hoy, fechaLarga, etiquetaEstado, almacen, panelError } from '../util.js';

export default async function vistaDisponibilidad(contenedor, { parametros }) {
  ponerMigas(['Agenda', 'agenda'], 'Consultar disponibilidad');

  const salas = await api.get('/salas').catch(() => almacen.leer('salas') || []);

  contenedor.innerHTML = `
    <h1>Consultar disponibilidad</h1>
    <form class="tarjeta formulario formulario-linea" id="form-disponibilidad" novalidate>
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" min="${hoy()}" required></label>
      <label class="campo"><span>Desde</span><input type="time" name="desde" step="1800" min="09:00" max="23:00" required></label>
      <label class="campo"><span>Hasta</span><input type="time" name="hasta" step="1800" min="09:00" max="23:00" required></label>
      <label class="campo"><span>Sala</span>
        <select name="sala_id" required>${salas.map(s => `<option value="${s.id}">${esc(s.nombre)} (${s.capacidad_ninos + s.capacidad_adultos} pers.)</option>`).join('')}</select>
      </label>
      <button class="boton boton-primario" type="submit">Consultar</button>
    </form>
    <p class="error-campo" id="error-form" hidden></p>
    <div id="resultado"></div>`;

  const formulario = contenedor.querySelector('#form-disponibilidad');
  const resultado = contenedor.querySelector('#resultado');
  const errorForm = contenedor.querySelector('#error-form');

  // Valores iniciales: lo que vino en la ruta, o los horarios habituales del salón
  formulario.fecha.value = parametros.fecha || '';
  formulario.desde.value = parametros.desde || '16:00';
  formulario.hasta.value = parametros.hasta || '20:00';
  // Paso 3: se propone el salón principal por defecto
  formulario.sala_id.value = parametros.sala || salas[0]?.id || '';

  function enlaceReserva(datos) {
    return `#/nueva-reserva${query({ fecha: datos.fecha, desde: datos.hora_inicio, hasta: datos.hora_fin, sala: datos.sala.id })}`;
  }

  async function consultar() {
    const valores = Object.fromEntries(new FormData(formulario));
    errorForm.hidden = true;

    // Validaciones previas (A3: fecha anterior a la actual)
    let problema = '';
    if (!valores.fecha || !valores.desde || !valores.hasta) problema = 'Completá la fecha y el horario.';
    else if (valores.fecha < hoy()) problema = 'La fecha es anterior a la actual. Corregila antes de consultar.';
    else if (valores.hasta <= valores.desde) problema = 'La hora de fin debe ser posterior a la de inicio.';
    if (problema) {
      errorForm.textContent = problema;
      errorForm.hidden = false;
      return;
    }

    reemplazarRuta(`disponibilidad${query({ fecha: valores.fecha, desde: valores.desde, hasta: valores.hasta, sala: valores.sala_id })}`);
    resultado.innerHTML = '<p class="cargando">Consultando...</p>';

    let datos;
    try {
      datos = await api.get(`/agenda/disponibilidad${query(valores)}`);
    } catch (error) {
      // E1: nunca se muestra un resultado presunto sin haber consultado al servidor
      return panelError(resultado, error, consultar);
    }

    const otros = datos.eventos_del_dia;
    const cabecera = datos.disponible
      ? `<div class="resultado resultado-libre">
           <h2>Disponible</h2>
           <p>La ${esc(datos.sala.nombre)} está libre el ${fechaLarga(datos.fecha)} de ${datos.hora_inicio} a ${datos.hora_fin}.</p>
           ${puede('ventas', 'administracion') ? `<a class="boton boton-primario" href="${enlaceReserva(datos)}">Registrar reserva</a>` : ''}
         </div>`
      : `<div class="resultado resultado-ocupado">
           <h2>No disponible</h2>
           ${datos.ocupada_por.map(r => `
             <p>La franja está ocupada por el evento de <strong>${esc(r.cliente_nombre)} ${esc(r.cliente_apellido)}</strong>
             de ${r.hora_inicio} a ${r.hora_fin} ${etiquetaEstado(r.estado)}
             ${r.hora_inicio > datos.hora_inicio || r.hora_fin < datos.hora_fin ? '<em>(se superpone en parte de la franja)</em>' : ''}</p>`).join('')}
           ${datos.sugerencia
             ? `<p>Horario libre más cercano ese día: <strong>${datos.sugerencia.hora_inicio} a ${datos.sugerencia.hora_fin}</strong>.</p>
                <button class="boton boton-secundario" data-sugerencia>Consultar ese horario</button>`
             : '<p>No quedan franjas libres de esa duración en la sala ese día. Probá con otra sala o fecha.</p>'}
         </div>`;

    resultado.innerHTML = `
      ${cabecera}
      <section class="tarjeta">
        <h2>Eventos agendados el ${fechaLarga(datos.fecha)}</h2>
        ${otros.length === 0 ? '<p class="nota">No hay otros eventos ese día.</p>' : `
        <div class="tabla-desplazable">
          <table class="tabla">
            <thead><tr><th>Horario</th><th>Sala</th><th>Cliente</th><th>Personas</th><th>Estado</th></tr></thead>
            <tbody>${otros.map(r => `
              <tr class="${r.sala_id === datos.sala.id ? 'fila-destacada' : ''}">
                <td>${r.hora_inicio} - ${r.hora_fin}</td>
                <td>${esc(r.sala_nombre)}</td>
                <td><a href="#/reservas/${r.id}">${esc(r.cliente_nombre)} ${esc(r.cliente_apellido)}</a></td>
                <td>${r.personas_contratadas}</td>
                <td>${etiquetaEstado(r.estado)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
      </section>`;

    resultado.querySelector('[data-sugerencia]')?.addEventListener('click', () => {
      formulario.desde.value = datos.sugerencia.hora_inicio;
      formulario.hasta.value = datos.sugerencia.hora_fin;
      consultar();
    });
  }

  formulario.addEventListener('submit', (evento) => { evento.preventDefault(); consultar(); });
  if (parametros.fecha) consultar();
  else formulario.fecha.focus();
}
