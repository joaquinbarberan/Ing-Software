// Selector de horarios libres (ver CAMBIOS.md).
// Muestra como botones todos los horarios en los que el evento entra sin superponerse (RN01),
// así el operador no tiene que tipear hora y minutos ni probar franja por franja.
// Las horas "Desde/Hasta" siguen existiendo (para un horario especial), pero quedan en un desplegable.
import { api, query } from '../api.js';
import { esc } from '../util.js';

function franjaDelDia(hora) {
  if (hora < '12:00') return 'Mañana';
  if (hora < '17:00') return 'Tarde';
  return 'Noche';
}

export function duracionEntre(desde, hasta) {
  const [h1, m1] = desde.split(':').map(Number);
  const [h2, m2] = hasta.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

// HTML del bloque: zona de botones + horario manual plegado
export function htmlSelectorHorarios({ horaInicio = '', horaFin = '', manualAbierto = false } = {}) {
  return `
    <div class="selector-horarios">
      <span class="dato-etiqueta">Horarios libres <span class="nota" data-horarios-detalle></span></span>
      <div class="horarios-zona" data-horarios-zona><p class="nota">Elegí la fecha y la sala para ver los horarios libres.</p></div>
      <details class="horario-manual" ${manualAbierto ? 'open' : ''}>
        <summary>Otro horario (cargar a mano)</summary>
        <div class="columnas-2 compacta">
          <label class="campo"><span>Desde</span><input type="time" name="hora_inicio" step="1800" min="09:00" max="23:00" value="${esc(horaInicio)}" required></label>
          <label class="campo"><span>Hasta</span><input type="time" name="hora_fin" step="1800" min="09:00" max="23:00" value="${esc(horaFin)}" required></label>
        </div>
      </details>
    </div>`;
}

// Conecta el bloque con el formulario.
// - duracion(): minutos que dura el evento (según el paquete o la reserva)
// - excluirId: al modificar una reserva, la propia reserva no cuenta como ocupada
// Al tocar un botón se completan hora_inicio y hora_fin y se dispara "change" para que
// el formulario vuelva a verificar la franja y recalcular lo que haga falta.
export function conectarSelectorHorarios(formulario, { duracion, excluirId = null }) {
  const bloque = formulario.querySelector('.selector-horarios');
  const zona = bloque.querySelector('[data-horarios-zona]');
  const detalle = bloque.querySelector('[data-horarios-detalle]');
  let numeroConsulta = 0;
  let ultimos = [];

  function marcarElegido() {
    const desde = formulario.hora_inicio.value;
    const hasta = formulario.hora_fin.value;
    zona.querySelectorAll('[data-inicio]').forEach(boton => {
      const elegido = boton.dataset.inicio === desde && boton.dataset.fin === hasta;
      boton.classList.toggle('elegido', elegido);
      boton.setAttribute('aria-pressed', String(elegido));
    });
    // Si el horario cargado no es ninguno de los botones (horario especial), se deja abierto el manual
    const coincide = ultimos.some(h => h.hora_inicio === desde && h.hora_fin === hasta);
    if (desde && hasta && !coincide) bloque.querySelector('.horario-manual').open = true;
  }

  async function actualizar() {
    const fecha = formulario.fecha.value;
    const salaId = formulario.sala_id.value;
    const minutos = duracion();
    if (!fecha || !salaId || !(minutos > 0)) {
      zona.innerHTML = '<p class="nota">Elegí la fecha y la sala para ver los horarios libres.</p>';
      detalle.textContent = '';
      return;
    }
    const numero = ++numeroConsulta;
    zona.innerHTML = '<p class="nota">Buscando horarios libres...</p>';
    let datos;
    try {
      datos = await api.get(`/agenda/horarios${query({ fecha, sala_id: salaId, duracion: minutos / 60, excluir_id: excluirId })}`);
    } catch (error) {
      if (numero !== numeroConsulta) return;
      zona.innerHTML = `<p class="error-campo">${esc(error.message)}</p>`;
      return;
    }
    if (numero !== numeroConsulta) return;

    ultimos = datos.horarios;
    detalle.textContent = `· eventos de ${minutos % 60 ? (minutos / 60).toFixed(1).replace('.', ',') : minutos / 60} h`;
    if (!datos.horarios.length) {
      zona.innerHTML = '<p class="nota franja-ocupada">No quedan horarios libres de esa duración en la sala ese día. Probá otra sala o fecha.</p>';
      marcarElegido();
      return;
    }
    const grupos = {};
    datos.horarios.forEach(h => { (grupos[franjaDelDia(h.hora_inicio)] ||= []).push(h); });
    zona.innerHTML = Object.entries(grupos).map(([nombre, lista]) => `
      <div class="horarios-grupo">
        <span class="horarios-grupo-nombre">${nombre}</span>
        <div class="horarios-botones">
          ${lista.map(h => `<button type="button" class="horario-boton" data-inicio="${h.hora_inicio}" data-fin="${h.hora_fin}" aria-pressed="false">${h.hora_inicio}<small>–${h.hora_fin}</small></button>`).join('')}
        </div>
      </div>`).join('');
    marcarElegido();
  }

  zona.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-inicio]');
    if (!boton) return;
    formulario.hora_inicio.value = boton.dataset.inicio;
    formulario.hora_fin.value = boton.dataset.fin;
    formulario.hora_inicio.dispatchEvent(new Event('change', { bubbles: true }));
    formulario.dispatchEvent(new Event('input', { bubbles: true })); // guarda el borrador
    marcarElegido();
  });
  ['hora_inicio', 'hora_fin'].forEach(nombre => formulario[nombre].addEventListener('change', marcarElegido));

  return { actualizar };
}
