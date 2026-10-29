// Módulo M2 — Clientes: CU-05 Registrar cliente y CU-06 Consultar historial de cliente
import { api } from '../api.js';
import { ponerMigas, navegar } from '../navegacion.js';
import {
  esc, puede, pesos, fechaCorta, fechaHora, etiquetaEstado, abrirModal, avisar, conBoton, panelError
} from '../util.js';

function formularioCliente(cliente, alGuardar) {
  const { cuerpo, cerrar } = abrirModal({
    titulo: cliente ? 'Editar cliente' : 'Registrar cliente',
    contenido: `
      <form class="formulario" novalidate>
        <div class="columnas-2 compacta">
          <label class="campo"><span>Nombre</span><input name="nombre" value="${esc(cliente?.nombre)}" required></label>
          <label class="campo"><span>Apellido</span><input name="apellido" value="${esc(cliente?.apellido)}" required></label>
          <label class="campo"><span>DNI</span><input name="dni" value="${esc(cliente?.dni)}" inputmode="numeric" required></label>
          <label class="campo"><span>Teléfono</span><input name="telefono" type="tel" value="${esc(cliente?.telefono)}" required></label>
        </div>
        <label class="campo"><span>Correo (opcional)</span><input name="email" type="email" value="${esc(cliente?.email)}"></label>
        <p class="nota">Los datos se usan sólo para gestionar las reservas del salón (Ley 25.326 de Protección de Datos Personales).</p>
        <div class="caja-mensaje caja-error" hidden></div>
        <div class="acciones">
          <button type="button" class="boton boton-secundario" data-cerrar>Cancelar</button>
          <button type="submit" class="boton boton-primario">Guardar</button>
        </div>
      </form>`
  });
  const formulario = cuerpo.querySelector('form');
  cuerpo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const error = cuerpo.querySelector('.caja-error');
    error.hidden = true;
    const datos = Object.fromEntries(new FormData(formulario));
    try {
      const guardado = await conBoton(formulario.querySelector('[type=submit]'), () =>
        cliente ? api.put(`/clientes/${cliente.id}`, datos) : api.post('/clientes', datos));
      cerrar();
      avisar(cliente ? 'Cliente actualizado.' : 'Cliente registrado.');
      alGuardar(guardado);
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  });
}

async function listado(contenedor) {
  ponerMigas('Clientes');
  contenedor.innerHTML = `
    <div class="barra-herramientas">
      <h1>Clientes</h1>
      ${puede('ventas', 'administracion') ? '<button class="boton boton-primario" data-nuevo>+ Registrar cliente</button>' : ''}
    </div>
    <input type="search" id="buscar-cliente" class="buscador" placeholder="Buscar por nombre, apellido, DNI, teléfono o correo" aria-label="Buscar cliente">
    <div id="tabla-clientes"></div>`;

  const tabla = contenedor.querySelector('#tabla-clientes');
  const buscador = contenedor.querySelector('#buscar-cliente');
  let espera;

  async function cargar() {
    let clientes;
    try {
      clientes = await api.get(`/clientes?buscar=${encodeURIComponent(buscador.value)}`);
    } catch (error) {
      return panelError(tabla, error, cargar);
    }
    tabla.innerHTML = clientes.length === 0 ? '<div class="caja-mensaje">No se encontraron clientes.</div>' : `
      <div class="tabla-desplazable"><table class="tabla tabla-clic">
        <thead><tr><th>Cliente</th><th>DNI</th><th>Teléfono</th><th>Correo</th><th class="numero">Reservas</th><th>Última</th></tr></thead>
        <tbody>${clientes.map(c => `
          <tr data-id="${c.id}" tabindex="0">
            <td><strong>${esc(c.apellido)}, ${esc(c.nombre)}</strong></td>
            <td>${esc(c.dni)}</td>
            <td>${esc(c.telefono || '')}</td>
            <td>${esc(c.email || '')}</td>
            <td class="numero">${c.cantidad_reservas}</td>
            <td>${c.ultima_reserva ? fechaCorta(c.ultima_reserva) : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
    tabla.querySelectorAll('tr[data-id]').forEach(fila => {
      const abrir = () => navegar(`clientes/${fila.dataset.id}`);
      fila.addEventListener('click', abrir);
      fila.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    });
  }

  buscador.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargar, 250); });
  contenedor.querySelector('[data-nuevo]')?.addEventListener('click', () => formularioCliente(null, (c) => navegar(`clientes/${c.id}`)));
  buscador.focus();
  await cargar();
}

async function ficha(contenedor, id) {
  ponerMigas(['Clientes', 'clientes'], 'Historial');
  let cliente;
  try {
    cliente = await api.get(`/clientes/${id}`);
  } catch (error) {
    return panelError(contenedor, error, () => ficha(contenedor, id));
  }
  ponerMigas(['Clientes', 'clientes'], `${cliente.nombre} ${cliente.apellido}`);

  const realizadas = cliente.reservas.filter(r => r.estado === 'realizada');
  contenedor.innerHTML = `
    <div class="cabecera-ficha">
      <div>
        <h1>${esc(cliente.nombre)} ${esc(cliente.apellido)}</h1>
        <p class="subtitulo">DNI ${esc(cliente.dni)} · ${esc(cliente.telefono || 'sin teléfono')} · ${esc(cliente.email || 'sin correo')}</p>
      </div>
      <div class="grupo-botones">
        ${puede('ventas', 'administracion') ? `<button class="boton boton-secundario" data-editar>Editar datos</button>
        <a class="boton boton-primario" href="#/nueva-reserva">+ Nueva reserva</a>` : ''}
      </div>
    </div>
    <div class="tarjetas-resumen">
      <div class="tarjeta-dato"><span>Reservas totales</span><strong>${cliente.reservas.length}</strong></div>
      <div class="tarjeta-dato"><span>Eventos realizados</span><strong>${realizadas.length}</strong></div>
      <div class="tarjeta-dato"><span>Cliente desde</span><strong>${fechaHora(cliente.creado_en).slice(0, 10)}</strong></div>
    </div>
    <section class="tarjeta">
      <h2>Historial de contrataciones</h2>
      ${cliente.reservas.length === 0 ? '<p class="nota">Todavía no tiene reservas.</p>' : `
      <div class="tabla-desplazable"><table class="tabla tabla-clic">
        <thead><tr><th>Fecha</th><th>Horario</th><th>Sala</th><th>Paquete</th><th class="numero">Personas</th><th class="numero">Importe</th><th>Estado</th></tr></thead>
        <tbody>${cliente.reservas.map(r => `
          <tr data-reserva="${r.id}" tabindex="0">
            <td>${fechaCorta(r.fecha)}</td><td>${r.hora_inicio} - ${r.hora_fin}</td><td>${esc(r.sala_nombre)}</td>
            <td>${esc(r.paquete_nombre)}</td><td class="numero">${r.personas_contratadas}</td>
            <td class="numero">${pesos(r.importe_estimado)}</td><td>${etiquetaEstado(r.estado)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`}
    </section>`;

  contenedor.querySelector('[data-editar]')?.addEventListener('click', () => formularioCliente(cliente, () => ficha(contenedor, id)));
  contenedor.querySelectorAll('tr[data-reserva]').forEach(fila => fila.addEventListener('click', () => navegar(`reservas/${fila.dataset.reserva}`)));
}

export default async function vistaClientes(contenedor, { partes }) {
  if (partes[0]) return ficha(contenedor, Number(partes[0]));
  return listado(contenedor);
}
