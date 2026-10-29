// CU-02 · Registrar reserva (incluye CU-01 y se extiende con CU-05 Registrar cliente)
import { api, query } from '../api.js';
import { ponerMigas, navegar } from '../navegacion.js';
import {
  esc, puede, pesos, hoy, fechaLarga, almacen, abrirModal, avisar, mostrarError, conBoton
} from '../util.js';

const CLAVE_BORRADOR = 'borrador-reserva';

function sumarHoras(hora, horas) {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min(23 * 60, h * 60 + m + horas * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default async function vistaNuevaReserva(contenedor, { parametros }) {
  ponerMigas(['Agenda', 'agenda'], 'Nueva reserva');

  const [salas, paquetes] = await Promise.all([api.get('/salas'), api.get('/catalogos/paquetes?activos=true')]);
  const puedePersonalizado = puede('administracion');
  const paquetesVisibles = paquetes.filter(p => !p.es_personalizado || puedePersonalizado);

  contenedor.innerHTML = `
    <h1>Nueva reserva</h1>
    <form id="form-reserva" novalidate>
      <div class="columnas-2">
        <section class="tarjeta">
          <h2>Cliente</h2>
          <div class="fila-dni">
            <label class="campo"><span>DNI</span><input name="dni" inputmode="numeric" autocomplete="off" placeholder="Ej: 32145876"></label>
            <button type="button" class="boton boton-secundario" data-buscar>Buscar</button>
            <span id="estado-cliente"></span>
          </div>
          <input type="hidden" name="cliente_id">
          <div class="columnas-2 compacta">
            <label class="campo"><span>Nombre</span><input name="nombre" autocomplete="off"></label>
            <label class="campo"><span>Apellido</span><input name="apellido" autocomplete="off"></label>
            <label class="campo"><span>Teléfono</span><input name="telefono" type="tel" autocomplete="off"></label>
            <label class="campo"><span>Correo</span><input name="email" type="email" autocomplete="off"></label>
          </div>
          <button type="button" class="boton boton-secundario" data-registrar-cliente hidden>Registrar cliente</button>
        </section>

        <section class="tarjeta">
          <h2>Datos del evento</h2>
          <div class="columnas-3 compacta">
            <label class="campo"><span>Fecha</span><input type="date" name="fecha" min="${hoy()}" required></label>
            <label class="campo"><span>Desde</span><input type="time" name="hora_inicio" step="1800" min="09:00" max="23:00" required></label>
            <label class="campo"><span>Hasta</span><input type="time" name="hora_fin" step="1800" min="09:00" max="23:00" required></label>
          </div>
          <label class="campo"><span>Sala</span>
            <select name="sala_id" required>${salas.map(s => `<option value="${s.id}" data-capacidad="${s.capacidad_ninos + s.capacidad_adultos}">${esc(s.nombre)} (hasta ${s.capacidad_ninos + s.capacidad_adultos} pers.)</option>`).join('')}</select>
          </label>
          <p id="estado-franja" class="estado-franja"></p>
          <div class="columnas-paquete compacta">
            <label class="campo"><span>Paquete</span>
              <select name="paquete_id" required>
                <option value="">Seleccioná un paquete</option>
                ${paquetesVisibles.map(p => `<option value="${p.id}">${esc(p.nombre)}${p.es_personalizado ? '' : ` — ${pesos(p.precio_base)} (${p.personas_incluidas} pers.)`}</option>`).join('')}
              </select>
            </label>
            <label class="campo"><span>Personas</span><input type="number" name="personas_contratadas" min="1" required></label>
          </div>
          <label class="campo" id="campo-importe" hidden><span>Importe del paquete personalizado</span><input type="number" name="importe_manual" min="1" step="100"></label>
          <label class="campo"><span>Observaciones</span><input name="observaciones" placeholder="Temática: superhéroes" maxlength="500"></label>
        </section>
      </div>

      <section class="tarjeta tarjeta-resumen">
        <h2>Resumen y confirmación</h2>
        <div class="resumen">
          <div><span class="dato-etiqueta">Importe estimado del paquete</span><strong id="importe" class="dato-grande">—</strong></div>
          <div><span class="dato-etiqueta">Seña requerida (30 %)</span><strong id="sena" class="dato-grande">—</strong></div>
          <div><span class="dato-etiqueta">Estado inicial</span><span class="etiqueta estado-presenada etiqueta-grande">PRESEÑADA</span></div>
          <div class="acciones">
            <a class="boton boton-secundario" href="#/agenda">Cancelar</a>
            <button type="submit" class="boton boton-primario">Guardar reserva</button>
          </div>
        </div>
        <p class="nota">La fecha se libera automáticamente a las 72 horas si no se registra la seña (RN02 y RN03).</p>
      </section>
      <div id="errores"></div>
    </form>`;

  const formulario = contenedor.querySelector('#form-reserva');
  const estadoCliente = contenedor.querySelector('#estado-cliente');
  const estadoFranja = contenedor.querySelector('#estado-franja');
  const errores = contenedor.querySelector('#errores');
  const botonRegistrar = contenedor.querySelector('[data-registrar-cliente]');
  const camposCliente = ['nombre', 'apellido', 'telefono', 'email'].map(n => formulario[n]);
  let franjaLibre = null;

  // --- Borrador local: si se cae la conexión al guardar, los datos no se pierden (E3) ---
  const borrador = almacen.leer(CLAVE_BORRADOR);
  const valoresIniciales = {
    fecha: parametros.fecha || '', hora_inicio: parametros.desde || '', hora_fin: parametros.hasta || '',
    sala_id: parametros.sala || salas[0]?.id || ''
  };
  if (borrador && !parametros.fecha) {
    Object.entries(borrador).forEach(([nombre, valor]) => { if (formulario[nombre]) formulario[nombre].value = valor; });
    contenedor.querySelector('h1').insertAdjacentHTML('afterend',
      '<div class="caja-mensaje caja-advertencia">Se recuperaron los datos de una reserva que no se llegó a guardar. <button type="button" class="boton boton-secundario" data-descartar>Descartar</button></div>');
    contenedor.querySelector('[data-descartar]').addEventListener('click', () => { almacen.borrar(CLAVE_BORRADOR); vistaNuevaReserva(contenedor, { parametros }); });
  } else {
    Object.entries(valoresIniciales).forEach(([nombre, valor]) => { formulario[nombre].value = valor; });
  }
  formulario.addEventListener('input', () => almacen.guardar(CLAVE_BORRADOR, Object.fromEntries(new FormData(formulario))));

  // --- Cliente ---
  function bloquearCliente(bloquear) {
    camposCliente.forEach(campo => { campo.readOnly = bloquear; });
  }

  function mostrarCliente(cliente) {
    formulario.cliente_id.value = cliente.id;
    formulario.nombre.value = cliente.nombre;
    formulario.apellido.value = cliente.apellido;
    formulario.telefono.value = cliente.telefono || '';
    formulario.email.value = cliente.email || '';
    bloquearCliente(true);
    botonRegistrar.hidden = true;
    estadoCliente.innerHTML = `<span class="etiqueta etiqueta-ok">Encontrado</span> <a href="#/clientes/${cliente.id}" target="_blank" class="enlace-chico">Ver historial</a>`;
  }

  async function buscarCliente() {
    const dni = formulario.dni.value.replace(/\D/g, '');
    if (dni.length < 7) {
      estadoCliente.innerHTML = '<span class="etiqueta etiqueta-error">DNI inválido</span>';
      return;
    }
    formulario.cliente_id.value = '';
    try {
      mostrarCliente(await api.get(`/clientes/dni/${dni}`));
    } catch (error) {
      if (error.estado !== 404) return mostrarError(error);
      // A1: cliente inexistente -> se habilita CU-05 Registrar cliente sin salir del formulario
      bloquearCliente(false);
      camposCliente.forEach(campo => { campo.value = ''; });
      botonRegistrar.hidden = false;
      estadoCliente.innerHTML = '<span class="etiqueta etiqueta-aviso">No existe</span> <span class="nota">Completá los datos y registralo.</span>';
      formulario.nombre.focus();
    }
  }

  async function registrarCliente() {
    try {
      const cliente = await conBoton(botonRegistrar, () => api.post('/clientes', {
        dni: formulario.dni.value, nombre: formulario.nombre.value, apellido: formulario.apellido.value,
        telefono: formulario.telefono.value, email: formulario.email.value
      }));
      mostrarCliente(cliente);
      avisar('Cliente registrado.');
    } catch (error) {
      mostrarError(error);
    }
  }

  contenedor.querySelector('[data-buscar]').addEventListener('click', buscarCliente);
  formulario.dni.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') { evento.preventDefault(); buscarCliente(); } });
  formulario.dni.addEventListener('input', () => { if (formulario.cliente_id.value) { formulario.cliente_id.value = ''; estadoCliente.innerHTML = ''; } });
  botonRegistrar.addEventListener('click', registrarCliente);

  // --- Disponibilidad en vivo (CU-02 incluye a CU-01) ---
  let consultaFranja = 0;
  async function verificarFranja() {
    const { fecha, hora_inicio: desde, hora_fin: hasta, sala_id: salaId } = formulario;
    franjaLibre = null;
    if (!fecha.value || !desde.value || !hasta.value) { estadoFranja.textContent = ''; return; }
    const numero = ++consultaFranja;
    estadoFranja.className = 'estado-franja';
    estadoFranja.textContent = 'Verificando disponibilidad...';
    try {
      const datos = await api.get(`/agenda/disponibilidad${query({ fecha: fecha.value, desde: desde.value, hasta: hasta.value, sala_id: salaId.value })}`);
      if (numero !== consultaFranja) return;
      franjaLibre = datos.disponible;
      estadoFranja.className = `estado-franja ${datos.disponible ? 'franja-libre' : 'franja-ocupada'}`;
      estadoFranja.innerHTML = datos.disponible
        ? `Franja disponible: ${fechaLarga(datos.fecha)}, ${datos.hora_inicio} a ${datos.hora_fin}.`
        : `Franja ocupada por ${esc(datos.ocupada_por[0].cliente_apellido)} (${datos.ocupada_por[0].hora_inicio}-${datos.ocupada_por[0].hora_fin}).${datos.sugerencia ? ` Libre más cercano: ${datos.sugerencia.hora_inicio}-${datos.sugerencia.hora_fin}.` : ''}`;
    } catch (error) {
      if (numero !== consultaFranja) return;
      estadoFranja.className = 'estado-franja franja-ocupada';
      estadoFranja.textContent = error.message;
    }
  }
  ['fecha', 'hora_inicio', 'hora_fin', 'sala_id'].forEach(nombre => formulario[nombre].addEventListener('change', () => { verificarFranja(); calcular(); }));

  // --- Presupuesto en vivo (CU-12) ---
  let consultaPresupuesto = 0;
  async function calcular() {
    const paquete = paquetes.find(p => String(p.id) === formulario.paquete_id.value);
    contenedor.querySelector('#campo-importe').hidden = !paquete?.es_personalizado;
    const personas = Number(formulario.personas_contratadas.value);
    const importe = contenedor.querySelector('#importe');
    const sena = contenedor.querySelector('#sena');
    if (!paquete || !(personas > 0) || (paquete.es_personalizado && !(Number(formulario.importe_manual.value) > 0))) {
      importe.textContent = '—';
      sena.textContent = '—';
      return;
    }
    const numero = ++consultaPresupuesto;
    try {
      const datos = await api.get(`/reservas/presupuesto${query({ paquete_id: paquete.id, personas, importe_manual: formulario.importe_manual.value })}`);
      if (numero !== consultaPresupuesto) return;
      importe.textContent = pesos(datos.importe_estimado);
      sena.textContent = pesos(datos.sena_requerida);
    } catch (error) {
      if (numero === consultaPresupuesto) { importe.textContent = '—'; sena.textContent = '—'; }
    }
  }
  formulario.paquete_id.addEventListener('change', () => {
    const paquete = paquetes.find(p => String(p.id) === formulario.paquete_id.value);
    // El horario de fin se completa según la duración del paquete
    if (paquete && formulario.hora_inicio.value) {
      formulario.hora_fin.value = sumarHoras(formulario.hora_inicio.value, paquete.duracion_horas);
      verificarFranja();
    }
    if (paquete && !formulario.personas_contratadas.value && paquete.personas_incluidas) {
      formulario.personas_contratadas.value = paquete.personas_incluidas;
    }
    calcular();
  });
  formulario.personas_contratadas.addEventListener('input', calcular);
  formulario.importe_manual.addEventListener('input', calcular);

  // --- Guardar (pasos 7 a 9) ---
  function validar() {
    const faltan = [];
    if (!formulario.cliente_id.value) faltan.push('buscar o registrar al cliente');
    if (!formulario.fecha.value) faltan.push('la fecha');
    if (!formulario.hora_inicio.value || !formulario.hora_fin.value) faltan.push('el horario');
    if (!formulario.paquete_id.value) faltan.push('el paquete');
    if (!(Number(formulario.personas_contratadas.value) > 0)) faltan.push('la cantidad de personas');
    formulario.querySelectorAll('.campo-invalido').forEach(c => c.classList.remove('campo-invalido'));
    if (!formulario.cliente_id.value) formulario.dni.classList.add('campo-invalido');
    ['fecha', 'hora_inicio', 'hora_fin', 'paquete_id', 'personas_contratadas'].forEach(n => { if (!formulario[n].value) formulario[n].classList.add('campo-invalido'); });
    return faltan;
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    errores.innerHTML = '';
    // E2: campos obligatorios incompletos -> no se envía el formulario
    const faltan = validar();
    if (faltan.length) {
      errores.innerHTML = `<div class="caja-mensaje caja-error">Falta completar: ${faltan.join(', ')}.</div>`;
      return;
    }

    const datos = Object.fromEntries(new FormData(formulario));
    try {
      const reserva = await conBoton(formulario.querySelector('[type=submit]'), () => api.post('/reservas', datos));
      almacen.borrar(CLAVE_BORRADOR);
      mostrarComprobante(reserva);
    } catch (error) {
      if (error.estado === 409) {
        // E1: superposición detectada al guardar -> no se crea y se ofrece volver a CU-01
        errores.innerHTML = `
          <div class="caja-mensaje caja-error">
            <strong>Estado de error (E1)</strong>
            <p>${esc(error.message)}</p>
            <a class="boton boton-secundario" href="#/disponibilidad${query({ fecha: datos.fecha, desde: datos.hora_inicio, hasta: datos.hora_fin, sala: datos.sala_id })}">Volver a consultar disponibilidad</a>
          </div>`;
        verificarFranja();
      } else if (error.sinConexion) {
        errores.innerHTML = '<div class="caja-mensaje caja-error">Se perdió la conexión al guardar. Los datos quedaron cargados: volvé a presionar "Guardar reserva" cuando vuelva la conexión.</div>';
      } else {
        errores.innerHTML = `<div class="caja-mensaje caja-error">${esc(error.message)}</div>`;
      }
    }
  });

  // Comprobante de la reserva creada; desde acá se puede registrar la seña en el acto (A3)
  function mostrarComprobante(reserva) {
    const { cuerpo, cerrar } = abrirModal({
      titulo: `Reserva N.º ${reserva.id} registrada`,
      contenido: `
        <div class="comprobante">
          <p><strong>${esc(reserva.cliente_nombre)} ${esc(reserva.cliente_apellido)}</strong> · DNI ${esc(reserva.cliente_dni)}</p>
          <p>${fechaLarga(reserva.fecha)}, de ${reserva.hora_inicio} a ${reserva.hora_fin} · ${esc(reserva.sala_nombre)}</p>
          <p>${esc(reserva.paquete_nombre)} · ${reserva.personas_contratadas} personas</p>
          <p>Importe estimado: <strong>${pesos(reserva.importe_estimado)}</strong> · Seña requerida: <strong>${pesos(reserva.sena_requerida)}</strong></p>
          <p>Estado: <span class="etiqueta estado-presenada">Preseñada</span>. La fecha queda tomada por 72 horas hasta registrar la seña.</p>
        </div>
        <div class="acciones">
          <button class="boton boton-secundario" data-imprimir>Imprimir</button>
          <button class="boton boton-secundario" data-ver>Ver reserva</button>
          ${puede('ventas', 'encargado', 'administracion') ? '<button class="boton boton-primario" data-sena>Registrar seña ahora</button>' : ''}
        </div>`
    });
    cuerpo.querySelector('[data-imprimir]').addEventListener('click', () => window.print());
    cuerpo.querySelector('[data-ver]').addEventListener('click', () => { cerrar(); navegar(`reservas/${reserva.id}`); });
    cuerpo.querySelector('[data-sena]')?.addEventListener('click', () => { cerrar(); navegar(`reservas/${reserva.id}?pago=sena`); });
  }

  verificarFranja();
  calcular();
  if (formulario.dni.value) buscarCliente();
}
