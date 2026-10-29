// Sección "Evento del día" (M3): habilitar el evento, cargar asistentes reales y la comanda de consumos.
// Se usa en la ficha de la reserva y en la pantalla del Encargado de Salón.
import { api } from '../api.js';
import { esc, puede, pesos, hoy, fechaHora, confirmar, avisar, mostrarError, conBoton } from '../util.js';

let catalogoAdicionales = null;

async function adicionales() {
  if (!catalogoAdicionales) catalogoAdicionales = await api.get('/catalogos/adicionales?activos=true');
  return catalogoAdicionales;
}

export async function seccionEvento(contenedor, reserva, actualizar) {
  const r = reserva;
  const operador = puede('encargado', 'administracion');
  const enCurso = r.estado === 'en_curso';

  if (r.estado === 'confirmada' || r.estado === 'presenada') {
    // CU-07: se habilita el mismo día del evento, con la reserva confirmada
    if (!operador || r.fecha !== hoy()) { contenedor.innerHTML = ''; return; }
    contenedor.innerHTML = `
      <section class="tarjeta tarjeta-evento">
        <h2>Evento del día</h2>
        ${r.estado === 'presenada'
          ? '<p>La reserva no tiene la seña registrada. Registrala para poder habilitar el evento.</p>'
          : '<p>El evento es hoy. Al habilitarlo se puede cargar el conteo real de asistentes y los consumos.</p><button class="boton boton-primario" data-habilitar>Habilitar evento</button>'}
      </section>`;
    contenedor.querySelector('[data-habilitar]')?.addEventListener('click', async (evento) => {
      try {
        actualizar(await conBoton(evento.target, () => api.post(`/reservas/${r.id}/habilitar`)));
        avisar('Evento habilitado. Ya podés cargar asistentes y consumos.');
      } catch (error) { mostrarError(error); }
    });
    return;
  }

  if (!r.evento) { contenedor.innerHTML = ''; return; }

  const lista = enCurso && operador ? await adicionales() : [];
  const evento = r.evento;
  const asistentes = evento.ninos_reales + evento.adultos_reales;
  const excedente = Math.max(0, asistentes - r.personas_contratadas);

  contenedor.innerHTML = `
    <div class="columnas-2">
      <section class="tarjeta tarjeta-evento">
        <h2>Asistentes reales</h2>
        <p class="nota">Habilitado el ${fechaHora(evento.habilitado_en)} por ${esc(evento.habilitado_por_usuario || '')}.</p>
        <form class="formulario" id="form-asistentes">
          <fieldset ${enCurso && operador ? '' : 'disabled'}>
            <div class="contadores">
              ${['ninos', 'adultos'].map(tipo => `
                <label class="contador">
                  <span>${tipo === 'ninos' ? 'Niños' : 'Adultos'}</span>
                  <span class="contador-control">
                    <button type="button" data-restar="${tipo}" aria-label="Restar">−</button>
                    <input type="number" name="${tipo}" min="0" value="${evento[`${tipo}_reales`]}" inputmode="numeric">
                    <button type="button" data-sumar="${tipo}" aria-label="Sumar">+</button>
                  </span>
                </label>`).join('')}
            </div>
            ${enCurso && operador ? '<button type="submit" class="boton boton-primario">Guardar conteo</button>' : ''}
          </fieldset>
        </form>
        <div class="resumen-excedente ${excedente > 0 ? 'con-excedente' : ''}">
          <span>Contratadas: <strong>${r.personas_contratadas}</strong></span>
          <span>Asistentes: <strong id="total-asistentes">${asistentes}</strong></span>
          <span>Excedente: <strong id="total-excedente">${excedente}</strong> × ${pesos(r.tarifa_excedente)} = <strong id="monto-excedente">${pesos(excedente * r.tarifa_excedente)}</strong></span>
        </div>
        ${evento.asistentes_actualizado_en ? `<p class="nota">Último conteo: ${fechaHora(evento.asistentes_actualizado_en)}</p>` : '<p class="nota aviso-texto">Todavía no se cargó el conteo real.</p>'}
      </section>

      <section class="tarjeta tarjeta-evento">
        <h2>Consumos adicionales</h2>
        ${r.consumos.length === 0 ? '<p class="nota">Sin consumos cargados.</p>' : `
        <ul class="lista">${r.consumos.map(c => `
          <li class="${c.anulado ? 'fila-anulada' : ''}">
            <span>${Number(c.cantidad)} × ${esc(c.descripcion)} <span class="nota">${fechaHora(c.registrado_en).slice(-5)} · ${esc(c.registrado_por_usuario || '')}</span>
              ${c.anulado ? `<br><span class="nota">Anulado: ${esc(c.motivo_anulacion)}</span>` : ''}</span>
            <span>${pesos(c.subtotal)} ${enCurso && operador && !c.anulado ? `<button class="boton-texto" data-anular-consumo="${c.id}">Anular</button>` : ''}</span>
          </li>`).join('')}</ul>`}
        <p class="total-linea">Total adicionales: <strong>${pesos(r.cuenta.monto_adicionales)}</strong></p>
        ${enCurso && operador ? `
          <form class="formulario" id="form-consumo">
            <div class="columnas-consumo compacta">
              <label class="campo"><span>Adicional</span>
                <select name="adicional_id">
                  ${lista.map(a => `<option value="${a.id}">${esc(a.nombre)} — ${pesos(a.precio)}</option>`).join('')}
                  <option value="">Otro (cargar a mano)</option>
                </select>
              </label>
              <label class="campo"><span>Cantidad</span><input type="number" name="cantidad" min="0.5" step="0.5" value="1"></label>
            </div>
            <div class="columnas-2 compacta" id="consumo-libre" hidden>
              <label class="campo"><span>Descripción</span><input name="descripcion" maxlength="200"></label>
              <label class="campo"><span>Precio unitario</span><input type="number" name="precio_unitario" min="1" step="1"></label>
            </div>
            <button type="submit" class="boton boton-primario">Agregar consumo</button>
          </form>` : ''}
      </section>
    </div>`;

  // --- Asistentes ---
  const formAsistentes = contenedor.querySelector('#form-asistentes');
  const recalcular = () => {
    const total = Number(formAsistentes.ninos.value || 0) + Number(formAsistentes.adultos.value || 0);
    const extra = Math.max(0, total - r.personas_contratadas);
    contenedor.querySelector('#total-asistentes').textContent = total;
    contenedor.querySelector('#total-excedente').textContent = extra;
    contenedor.querySelector('#monto-excedente').textContent = pesos(extra * r.tarifa_excedente);
    contenedor.querySelector('.resumen-excedente').classList.toggle('con-excedente', extra > 0);
  };
  formAsistentes.addEventListener('click', (e) => {
    const campo = e.target.dataset.sumar || e.target.dataset.restar;
    if (!campo) return;
    const input = formAsistentes[campo];
    input.value = Math.max(0, Number(input.value || 0) + (e.target.dataset.sumar ? 1 : -1));
    recalcular();
  });
  formAsistentes.addEventListener('input', recalcular);
  formAsistentes.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      actualizar(await conBoton(formAsistentes.querySelector('[type=submit]'), () => api.put(`/reservas/${r.id}/asistentes`, {
        ninos: formAsistentes.ninos.value, adultos: formAsistentes.adultos.value
      })));
      avisar('Conteo de asistentes guardado.');
    } catch (error) { mostrarError(error); }
  });

  // --- Consumos ---
  const formConsumo = contenedor.querySelector('#form-consumo');
  if (formConsumo) {
    const libre = contenedor.querySelector('#consumo-libre');
    formConsumo.adicional_id.addEventListener('change', () => { libre.hidden = formConsumo.adicional_id.value !== ''; });
    formConsumo.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        actualizar(await conBoton(formConsumo.querySelector('[type=submit]'), () =>
          api.post(`/reservas/${r.id}/consumos`, Object.fromEntries(new FormData(formConsumo)))));
        avisar('Consumo agregado.');
      } catch (error) { mostrarError(error); }
    });
  }
  contenedor.querySelectorAll('[data-anular-consumo]').forEach(boton => boton.addEventListener('click', async () => {
    const motivo = await confirmar({ titulo: 'Anular consumo', mensaje: 'El consumo queda registrado como anulado, con tu usuario y el motivo.', textoBoton: 'Anular', peligro: true, pedirMotivo: true });
    if (!motivo) return;
    try {
      actualizar(await api.post(`/consumos/${boton.dataset.anularConsumo}/anular`, { motivo }));
      avisar('Consumo anulado.');
    } catch (error) { mostrarError(error); }
  }));
}
