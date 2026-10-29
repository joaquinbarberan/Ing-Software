// Pantalla del Encargado de Salón: CU-07 Habilitar evento, CU-08 Asistentes, CU-09 Consumos y CU-14 Liquidación.
// Pensada para usarse desde el celular en el salón (RNF02).
import { api, query } from '../api.js';
import { ponerMigas, reemplazarRuta } from '../navegacion.js';
import { esc, puede, pesos, hoy, fechaLarga, etiquetaEstado, panelError, almacen } from '../util.js';
import { seccionEvento } from './componentes-evento.js';
import { tablaCuenta, formularioLiquidacion, formularioPago } from './componentes-caja.js';

export default async function vistaEventoDia(contenedor, { parametros }) {
  ponerMigas('Gestión de evento', 'Evento del día');
  let fecha = /^\d{4}-\d{2}-\d{2}$/.test(parametros.fecha || '') ? parametros.fecha : hoy();

  contenedor.innerHTML = `
    <div class="barra-herramientas">
      <h1>Evento del día</h1>
      <div class="grupo-botones">
        <input type="date" id="fecha-evento" aria-label="Fecha">
        <button class="boton boton-secundario" data-hoy>Hoy</button>
      </div>
    </div>
    <p class="subtitulo" id="subtitulo-fecha"></p>
    <div id="aviso-copia"></div>
    <div id="lista-eventos"></div>`;

  const lista = contenedor.querySelector('#lista-eventos');
  const selector = contenedor.querySelector('#fecha-evento');
  selector.value = fecha;

  function tarjeta(reserva) {
    const elemento = document.createElement('article');
    elemento.className = 'tarjeta tarjeta-reserva-dia';
    const dibujar = (r) => {
      elemento.innerHTML = `
        <header class="cabecera-reserva-dia">
          <div>
            <h2>${r.hora_inicio} – ${r.hora_fin} · ${esc(r.sala_nombre)}</h2>
            <p><a href="#/reservas/${r.id}">${esc(r.cliente_nombre)} ${esc(r.cliente_apellido)}</a> · ${esc(r.paquete_nombre)} · ${r.personas_contratadas} personas ${etiquetaEstado(r.estado)}</p>
            ${r.observaciones ? `<p class="nota">${esc(r.observaciones)}</p>` : ''}
            ${r.asignaciones.length ? `<p class="nota">Coordinadores: ${r.asignaciones.map(a => esc(a.nombre)).join(', ')}</p>` : ''}
          </div>
        </header>
        <div class="evento-cuerpo"></div>
        ${['en_curso', 'realizada'].includes(r.estado) ? `
          <details class="detalle-cuenta" ${r.estado === 'en_curso' ? 'open' : ''}>
            <summary>Estado de cuenta · saldo ${pesos(r.cuenta.saldo)}</summary>
            ${tablaCuenta(r)}
          </details>` : ''}
        <div class="acciones">
          ${r.estado === 'presenada' && puede('ventas', 'encargado', 'administracion') ? '<button class="boton boton-secundario" data-sena>Registrar seña</button>' : ''}
          ${r.estado === 'en_curso' && puede('encargado', 'administracion') ? '<button class="boton boton-primario" data-liquidar>Emitir liquidación final</button>' : ''}
        </div>`;
      const actualizar = (nueva) => dibujar(nueva);
      seccionEvento(elemento.querySelector('.evento-cuerpo'), r, actualizar);
      elemento.querySelector('[data-liquidar]')?.addEventListener('click', () => formularioLiquidacion(r, actualizar));
      elemento.querySelector('[data-sena]')?.addEventListener('click', () => formularioPago(r, 'sena', (res) => actualizar(res.reserva)));
    };
    dibujar(reserva);
    return elemento;
  }

  async function cargar() {
    reemplazarRuta(`evento${fecha === hoy() ? '' : query({ fecha })}`);
    contenedor.querySelector('#subtitulo-fecha').textContent = fechaLarga(fecha) + (fecha === hoy() ? ' (hoy)' : '');
    contenedor.querySelector('#aviso-copia').innerHTML = '';
    lista.innerHTML = '<p class="cargando">Cargando...</p>';
    let datos;
    try {
      datos = await api.get(`/eventos/dia${query({ fecha })}`);
      almacen.guardar(`evento-dia:${fecha}`, datos);
    } catch (error) {
      // RNF04: si se corta la conexión en el salón, al menos se ve lo último cargado
      const copia = error.sinConexion ? almacen.leer(`evento-dia:${fecha}`) : null;
      if (!copia) return panelError(lista, error, cargar);
      datos = copia;
      contenedor.querySelector('#aviso-copia').innerHTML = '<div class="caja-mensaje caja-advertencia">Sin conexión: se muestran los últimos datos descargados. Los cambios se podrán guardar cuando vuelva la conexión.</div>';
    }

    lista.innerHTML = '';
    if (datos.reservas.length === 0) {
      lista.innerHTML = '<div class="caja-mensaje">No hay eventos agendados para este día.</div>';
      return;
    }
    datos.reservas.forEach(r => lista.appendChild(tarjeta(r)));
  }

  selector.addEventListener('change', () => { if (selector.value) { fecha = selector.value; cargar(); } });
  contenedor.querySelector('[data-hoy]').addEventListener('click', () => { fecha = hoy(); selector.value = fecha; cargar(); });
  await cargar();
}
