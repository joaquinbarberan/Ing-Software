// CU-10 · Asignar coordinadores: grilla del fin de semana y liquidación de horas por coordinador
import { api, query } from '../api.js';
import { ponerMigas, reemplazarRuta } from '../navegacion.js';
import {
  esc, pesos, hoy, sumarDias, aFecha, fechaLarga, fechaCorta, etiquetaEstado, avisar, mostrarError, panelError, enlaceWhatsapp
} from '../util.js';

// Sábado y domingo de la semana que contiene a la fecha (o los próximos)
function finDeSemana(texto) {
  const dia = aFecha(texto).getDay(); // 0 domingo
  const sabado = dia === 0 ? sumarDias(texto, -1) : sumarDias(texto, 6 - dia);
  return { desde: sabado, hasta: sumarDias(sabado, 1) };
}

export default async function vistaCoordinadores(contenedor, { parametros }) {
  ponerMigas('Gestión de evento', 'Coordinadores');
  let { desde, hasta } = parametros.desde ? { desde: parametros.desde, hasta: parametros.hasta || parametros.desde } : finDeSemana(hoy());

  contenedor.innerHTML = `
    <div class="barra-herramientas">
      <h1>Asignación de coordinadores</h1>
      <div class="grupo-botones">
        <button class="boton boton-secundario boton-icono" data-mover="-7" aria-label="Fin de semana anterior">‹</button>
        <form class="formulario-linea" id="form-periodo">
          <label class="campo"><span>Desde</span><input type="date" name="desde"></label>
          <label class="campo"><span>Hasta</span><input type="date" name="hasta"></label>
          <button class="boton boton-secundario" type="submit">Ver</button>
        </form>
        <button class="boton boton-secundario boton-icono" data-mover="7" aria-label="Fin de semana siguiente">›</button>
      </div>
    </div>
    <div id="grilla"></div>`;

  const grilla = contenedor.querySelector('#grilla');
  const formulario = contenedor.querySelector('#form-periodo');

  async function cargar() {
    formulario.desde.value = desde;
    formulario.hasta.value = hasta;
    reemplazarRuta(`coordinadores${query({ desde, hasta })}`);
    let datos;
    try { datos = await api.get(`/coordinadores/grilla${query({ desde, hasta })}`); } catch (error) { return panelError(grilla, error, cargar); }

    const porDia = {};
    datos.reservas.forEach(r => (porDia[r.fecha] ||= []).push(r));

    grilla.innerHTML = `
      ${datos.reservas.length === 0 ? '<div class="caja-mensaje">No hay eventos en el período.</div>' : Object.entries(porDia).map(([fecha, reservas]) => `
        <section class="tarjeta">
          <h2>${fechaLarga(fecha)}</h2>
          <div class="tabla-desplazable"><table class="tabla">
            <thead><tr><th>Horario</th><th>Sala</th><th>Cliente</th><th class="numero">Personas</th><th>Coordinadores</th><th>Asignar</th></tr></thead>
            <tbody>${reservas.map(r => {
              const faltan = r.coordinadores_sugeridos - r.asignados.length;
              const libres = datos.coordinadores.filter(c => !r.asignados.some(a => a.coordinador_id === c.id));
              return `
              <tr>
                <td>${r.hora_inicio} - ${r.hora_fin}</td>
                <td>${esc(r.sala_nombre)}</td>
                <td><a href="#/reservas/${r.id}">${esc(r.cliente_apellido)}</a> ${etiquetaEstado(r.estado)}</td>
                <td class="numero">${r.personas_contratadas}</td>
                <td>
                  ${r.asignados.map(a => `<span class="chip">${esc(a.coordinador)}
                    <a href="${enlaceWhatsapp(a.telefono, `Hola ${a.coordinador}, quedaste asignado/a al cumpleaños del ${fechaLarga(r.fecha)} de ${r.hora_inicio} a ${r.hora_fin} en la ${r.sala_nombre} de Diverty Park.`)}" target="_blank" rel="noopener" title="Avisar por WhatsApp">aviso</a>
                    <button data-quitar="${a.id}" aria-label="Quitar ${esc(a.coordinador)}">×</button></span>`).join('')}
                  <span class="nota">${faltan > 0 ? `faltan ${faltan} (sugeridos ${r.coordinadores_sugeridos})` : 'completo'}</span>
                </td>
                <td>
                  <form class="formulario-linea" data-asignar="${r.id}">
                    <select name="coordinador_id" aria-label="Coordinador">${libres.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>
                    <button class="boton boton-secundario boton-chico" type="submit">Asignar</button>
                  </form>
                </td>
              </tr>`;
            }).join('')}
            </tbody>
          </table></div>
        </section>`).join('')}

      <section class="tarjeta">
        <h2>Horas por coordinador (${fechaCorta(desde)} al ${fechaCorta(hasta)})</h2>
        <div class="tabla-desplazable"><table class="tabla">
          <thead><tr><th>Coordinador</th><th>Teléfono</th><th class="numero">Eventos</th><th class="numero">Horas</th><th class="numero">Tarifa/h</th><th class="numero">A liquidar</th></tr></thead>
          <tbody>${datos.coordinadores.map(c => `
            <tr class="${c.eventos ? '' : 'fila-tenue'}">
              <td>${esc(c.nombre)}</td><td>${esc(c.telefono || '')}</td>
              <td class="numero">${c.eventos}</td><td class="numero">${c.horas}</td>
              <td class="numero">${pesos(c.tarifa_hora)}</td><td class="numero"><strong>${pesos(c.a_liquidar)}</strong></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </section>`;

    grilla.querySelectorAll('[data-asignar]').forEach(form => form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.coordinador_id.value) return avisar('No quedan coordinadores libres para asignar.', 'error');
      try {
        await api.post(`/reservas/${form.dataset.asignar}/coordinadores`, { coordinador_id: form.coordinador_id.value });
        avisar('Coordinador asignado.');
        cargar();
      } catch (error) { mostrarError(error); }
    }));
    grilla.querySelectorAll('[data-quitar]').forEach(boton => boton.addEventListener('click', async () => {
      try {
        await api.delete(`/asignaciones/${boton.dataset.quitar}`);
        cargar();
      } catch (error) { mostrarError(error); }
    }));
  }

  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    desde = formulario.desde.value || desde;
    hasta = formulario.hasta.value && formulario.hasta.value >= desde ? formulario.hasta.value : desde;
    cargar();
  });
  contenedor.querySelectorAll('[data-mover]').forEach(boton => boton.addEventListener('click', () => {
    desde = sumarDias(desde, Number(boton.dataset.mover));
    hasta = sumarDias(hasta, Number(boton.dataset.mover));
    cargar();
  }));
  await cargar();
}
