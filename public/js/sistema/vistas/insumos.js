// CU-11 · Gestionar insumos del evento: pedido por reserva de los próximos días
import { api, query } from '../api.js';
import { ponerMigas } from '../navegacion.js';
import { esc, pesos, hoy, sumarDias, fechaCorta, etiquetaEstado, avisar, mostrarError, panelError } from '../util.js';

export default async function vistaInsumos(contenedor) {
  ponerMigas('Gestión de evento', 'Insumos');
  contenedor.innerHTML = `
    <div class="barra-herramientas">
      <h1>Insumos por evento</h1>
      <form class="formulario-linea" id="form-periodo">
        <label class="campo"><span>Desde</span><input type="date" name="desde" value="${hoy()}"></label>
        <label class="campo"><span>Hasta</span><input type="date" name="hasta" value="${sumarDias(hoy(), 14)}"></label>
        <button class="boton boton-secundario" type="submit">Ver</button>
      </form>
    </div>
    <p class="nota">El pedido se calcula a partir del paquete y la cantidad de invitados contratada (RF13). Al recibir la mercadería se registra su costo real (RF14).</p>
    <div id="lista-insumos"></div>`;

  const lista = contenedor.querySelector('#lista-insumos');
  const formulario = contenedor.querySelector('#form-periodo');

  async function cargar() {
    const periodo = Object.fromEntries(new FormData(formulario));
    let filas;
    try { filas = await api.get(`/insumos/pedidos${query(periodo)}`); } catch (error) { return panelError(lista, error, cargar); }

    lista.innerHTML = filas.length === 0 ? '<div class="caja-mensaje">No hay eventos en el período.</div>' : `
      <div class="tabla-desplazable"><table class="tabla">
        <thead><tr><th>Evento</th><th>Cliente</th><th>Paquete</th><th class="numero">Personas</th><th>Pedido</th><th class="numero">Costo est.</th><th class="numero">Costo real</th><th></th></tr></thead>
        <tbody>${filas.map(f => {
          const pedido = f.pedido || { lineas: 0, recibidas: 0, costo_estimado: 0, costo_real: 0 };
          const estado = pedido.lineas === 0 ? '<span class="etiqueta etiqueta-aviso">Sin generar</span>'
            : pedido.recibidas === pedido.lineas ? '<span class="etiqueta etiqueta-ok">Recibido</span>'
            : `<span class="etiqueta estado-presenada">${pedido.recibidas}/${pedido.lineas} recibidos</span>`;
          return `
          <tr>
            <td><a href="#/reservas/${f.id}">${fechaCorta(f.fecha)} ${f.hora_inicio}</a><br><span class="nota">${esc(f.sala_nombre)}</span></td>
            <td>${esc(f.cliente_apellido)} ${etiquetaEstado(f.estado)}</td>
            <td>${esc(f.paquete_nombre)}</td>
            <td class="numero">${f.personas_contratadas}</td>
            <td>${estado}</td>
            <td class="numero">${pedido.lineas ? pesos(pedido.costo_estimado) : '—'}</td>
            <td class="numero">${pedido.recibidas ? pesos(pedido.costo_real) : '—'}</td>
            <td>${pedido.lineas === 0
              ? `<button class="boton boton-secundario boton-chico" data-generar="${f.id}">Generar pedido</button>`
              : `<a class="boton boton-secundario boton-chico" href="#/reservas/${f.id}">Ver detalle</a>`}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table></div>`;

    lista.querySelectorAll('[data-generar]').forEach(boton => boton.addEventListener('click', async () => {
      try {
        await api.post(`/reservas/${boton.dataset.generar}/insumos/generar`);
        avisar('Pedido generado.');
        cargar();
      } catch (error) { mostrarError(error); }
    }));
  }

  formulario.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
  await cargar();
}
