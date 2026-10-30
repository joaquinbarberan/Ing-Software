// Página pública de reservas en 4 pasos (ver CAMBIOS.md).
//
// 1. Paquete e invitados  -> se ve el precio estimado y la seña al instante.
// 2. Día                  -> un calendario marca qué días tienen horarios libres.
// 3. Sala y horario       -> los horarios libres aparecen como botones: no hay que tipear horas.
// 4. Datos                -> se envía una SOLICITUD que Ventas revisa y convierte en reserva.
//
// El cliente no registra la reserva por su cuenta (frontera del sistema, sección 10.3 del informe):
// la solicitud no ocupa la fecha. La fecha queda tomada cuando Ventas carga la reserva y la seña.

const WHATSAPP_SALON = '5493513785678';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ADELANTE = 12;

// Todo lo que el cliente va eligiendo
const eleccion = {
  paquete: null,
  personas: 30,
  mes: null,      // 'AAAA-MM' que se ve en el calendario
  fecha: null,    // 'AAAA-MM-DD'
  sala: null,     // { id, nombre, ... }
  horario: null   // { hora_inicio, hora_fin }
};

let paquetes = [];
let capacidadMaxima = 0;
let pasoActual = 1;
let pasoMaximo = 1;

// ---------- utilidades ----------

const $ = (selector) => document.querySelector(selector);

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function pesos(monto) {
  return `$${Number(monto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function hoy() {
  const f = new Date();
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

function mesDe(fecha) {
  return fecha.slice(0, 7);
}

function moverMes(mes, cantidad) {
  const [a, m] = mes.split('-').map(Number);
  const fecha = new Date(a, m - 1 + cantidad, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function fechaLarga(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = DIAS[new Date(a, m - 1, d).getDay()];
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)} ${d} de ${MESES[m - 1].toLowerCase()}`;
}

function nombreSala(nombre) {
  return nombre.charAt(0) + nombre.slice(1).toLowerCase();
}

// Mismo cálculo que el sistema (Paquete.precioPara): base + invitados extra × tarifa de excedente
function presupuesto(paquete, personas) {
  const extra = Math.max(0, personas - paquete.personas_incluidas);
  const total = Number(paquete.precio_base) + extra * Number(paquete.tarifa_excedente);
  return { total, extra, sena: Math.round(total * paquete.porcentaje_sena) };
}

async function pedir(url, opciones) {
  let respuesta;
  try {
    respuesta = await fetch(url, opciones);
  } catch {
    throw new Error('No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.');
  }
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.error || 'Ocurrió un problema. Intentá de nuevo en unos minutos.');
    Object.assign(error, datos, { estado: respuesta.status });
    throw error;
  }
  return datos;
}

// ---------- navegación entre pasos ----------

function irAPaso(numero) {
  if (numero > pasoMaximo && numero !== 5) return;
  pasoActual = numero;
  document.querySelectorAll('.rv-paso').forEach(seccion => {
    seccion.hidden = Number(seccion.dataset.paso) !== numero;
  });
  document.querySelectorAll('#rv-progreso li').forEach(item => {
    const paso = Number(item.dataset.ir);
    item.classList.toggle('actual', paso === numero);
    item.classList.toggle('hecho', paso < numero || (paso <= pasoMaximo && paso !== numero));
  });
  $('#rv-progreso').hidden = numero === 5;
  $('.rv-caja').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function habilitarHasta(numero) {
  pasoMaximo = numero;
}

// Si cambia algo de un paso, lo elegido en los pasos siguientes deja de valer
function invalidarDesde(numero) {
  if (numero <= 2) eleccion.fecha = null;
  if (numero <= 3) { eleccion.sala = null; eleccion.horario = null; }
  habilitarHasta(Math.min(pasoMaximo, numero));
}

// ---------- PASO 1: paquete e invitados ----------

function dibujarPaquetes() {
  $('#rv-paquetes').innerHTML = paquetes.map(p => `
    <button type="button" class="rv-paquete" role="radio" aria-checked="${eleccion.paquete?.id === p.id}" data-paquete="${p.id}">
      <strong>${escapar(p.nombre.replace(/\s*—.*$/, ''))}</strong>
      <span class="rv-paquete-duracion">${p.duracion_horas} horas</span>
      <span class="rv-paquete-desc">${escapar(p.descripcion || '')}</span>
      <span class="rv-paquete-precio">Desde ${pesos(p.precio_base)} <small>hasta ${p.personas_incluidas} invitados</small></span>
    </button>`).join('');
}

function actualizarPrecio() {
  const caja = $('#rv-precio');
  const personas = eleccion.personas;
  const ayuda = $('#rv-ayuda-personas');
  ayuda.textContent = capacidadMaxima ? `Nuestra sala más grande recibe hasta ${capacidadMaxima} personas.` : '';
  ayuda.classList.remove('rv-ayuda-error');

  const valido = personas >= 1 && (!capacidadMaxima || personas <= capacidadMaxima);
  if (!valido) {
    ayuda.textContent = personas < 1 ? 'Indicá al menos 1 invitado.' : `Ninguna sala recibe más de ${capacidadMaxima} personas.`;
    ayuda.classList.add('rv-ayuda-error');
  }
  $('#rv-ir-dia').disabled = !(eleccion.paquete && valido);

  if (!eleccion.paquete || !valido) { caja.hidden = true; return; }
  const { total, extra, sena } = presupuesto(eleccion.paquete, personas);
  caja.hidden = false;
  caja.innerHTML = `
    <div><span>Precio estimado</span><strong>${pesos(total)}</strong></div>
    <div><span>Seña para reservar (${Math.round(eleccion.paquete.porcentaje_sena * 100)} %)</span><strong>${pesos(sena)}</strong></div>
    <p>${extra > 0
      ? `Incluye ${extra} invitado${extra > 1 ? 's' : ''} extra a ${pesos(eleccion.paquete.tarifa_excedente)} cada uno.`
      : `El paquete incluye hasta ${eleccion.paquete.personas_incluidas} invitados.`}</p>`;
}

function cambiarPersonas(valor) {
  const nuevo = Math.max(1, Math.min(capacidadMaxima || 500, Math.round(Number(valor) || 0)));
  if (nuevo !== eleccion.personas) invalidarDesde(2);
  eleccion.personas = nuevo;
  $('#rv-personas').value = nuevo;
  actualizarPrecio();
}

// ---------- PASO 2: calendario ----------

let consultaCalendario = 0;

async function dibujarCalendario() {
  const mes = eleccion.mes;
  const [anio, numeroMes] = mes.split('-').map(Number);
  $('#rv-mes-titulo').textContent = `${MESES[numeroMes - 1]} ${anio}`;
  $('#rv-mes-anterior').disabled = mes <= mesDe(hoy());
  $('#rv-mes-siguiente').disabled = mes >= moverMes(mesDe(hoy()), MESES_ADELANTE);

  const contenedor = $('#rv-cal-dias');
  contenedor.innerHTML = '<p class="rv-cargando rv-cal-cargando">Buscando días libres...</p>';
  const numero = ++consultaCalendario;

  let datos;
  try {
    datos = await pedir(`/disponibilidad/mes?mes=${mes}&paquete_id=${eleccion.paquete.id}&personas=${eleccion.personas}`);
  } catch (error) {
    if (numero !== consultaCalendario) return;
    contenedor.innerHTML = `<p class="rv-error rv-cal-cargando">${escapar(error.message)} <button type="button" class="rv-enlace" id="rv-reintentar-cal">Reintentar</button></p>`;
    $('#rv-reintentar-cal').addEventListener('click', dibujarCalendario);
    return;
  }
  if (numero !== consultaCalendario) return;

  // Lunes = primera columna
  const primerDia = new Date(anio, numeroMes - 1, 1).getDay();
  const huecos = (primerDia + 6) % 7;
  const textos = { libre: 'hay horarios libres', pocos: 'quedan pocos horarios', completo: 'sin lugar', pasado: 'fecha pasada' };

  contenedor.innerHTML = '<span></span>'.repeat(huecos) + datos.dias.map(dia => {
    const numeroDia = Number(dia.fecha.slice(8));
    const elegible = dia.estado === 'libre' || dia.estado === 'pocos';
    const elegido = dia.fecha === eleccion.fecha;
    return `<button type="button" class="rv-dia ${dia.estado}${elegido ? ' elegido' : ''}${dia.fecha === hoy() ? ' hoy' : ''}"
      data-fecha="${dia.fecha}" ${elegible ? '' : 'disabled'}
      aria-label="${fechaLarga(dia.fecha)}: ${textos[dia.estado]}">${numeroDia}</button>`;
  }).join('');

  if (!datos.dias.some(d => d.estado === 'libre' || d.estado === 'pocos')) {
    contenedor.insertAdjacentHTML('beforeend', '<p class="rv-ayuda rv-cal-cargando">No quedan días libres este mes para esa cantidad de invitados. Probá el mes siguiente.</p>');
  }
}

// ---------- PASO 3: sala y horario ----------

function franjaDelDia(hora) {
  if (hora < '12:00') return 'Mañana';
  if (hora < '17:00') return 'Tarde';
  return 'Noche';
}

let salaAbierta = null;
let ultimoDia = null;

async function dibujarSalas() {
  $('#rv-dia-elegido').textContent = `${fechaLarga(eleccion.fecha)} · ${eleccion.paquete.nombre.replace(/\s*—.*$/, '')} (${eleccion.paquete.duracion_horas} h) · ${eleccion.personas} invitados`;
  const contenedor = $('#rv-salas');
  contenedor.innerHTML = '<p class="rv-cargando">Buscando horarios libres...</p>';

  let datos;
  try {
    datos = await pedir(`/disponibilidad/dia?fecha=${eleccion.fecha}&paquete_id=${eleccion.paquete.id}&personas=${eleccion.personas}`);
  } catch (error) {
    contenedor.innerHTML = `<p class="rv-error">${escapar(error.message)} <button type="button" class="rv-enlace" id="rv-reintentar-salas">Reintentar</button></p>`;
    $('#rv-reintentar-salas').addEventListener('click', dibujarSalas);
    return;
  }

  pintarSalas(datos);
}

function pintarSalas(datos) {
  const contenedor = $('#rv-salas');
  const conHorarios = datos.salas.filter(s => s.horarios.length);
  const sinHorarios = datos.salas.filter(s => !s.horarios.length);

  if (!conHorarios.length) {
    contenedor.innerHTML = `<div class="rv-aviso">Justo se ocuparon los horarios de ese día. <button type="button" class="rv-enlace" data-siguiente="2">Elegí otro día</button></div>`;
    return;
  }

  // Se muestra una sala abierta por vez (la elegida antes, o la primera con lugar) para no llenar la pantalla de botones
  if (!conHorarios.some(s => s.id === salaAbierta)) salaAbierta = (conHorarios.find(s => s.id === eleccion.sala?.id) || conHorarios[0]).id;

  contenedor.innerHTML = conHorarios.map(sala => {
    const abierta = sala.id === salaAbierta;
    const grupos = {};
    sala.horarios.forEach(h => { (grupos[franjaDelDia(h.hora_inicio)] ||= []).push(h); });
    const resumenGrupos = Object.entries(grupos).map(([nombre, lista]) => `${nombre.toLowerCase()} ${lista.length}`).join(' · ');
    return `
      <article class="rv-sala${abierta ? ' abierta' : ''}">
        <button type="button" class="rv-sala-cabecera" data-abrir-sala="${sala.id}" aria-expanded="${abierta}">
          <img src="${escapar(sala.imagen || './recursos/imagenes/payasio.png')}" alt="" onerror="this.src='./recursos/imagenes/payasio.png'">
          <div>
            <h3>${escapar(nombreSala(sala.nombre))}</h3>
            <p>Hasta ${sala.capacidad} personas · ${sala.horarios.length} horario${sala.horarios.length > 1 ? 's' : ''} libre${sala.horarios.length > 1 ? 's' : ''}</p>
            ${abierta ? '' : `<p class="rv-sala-resumen">${resumenGrupos}</p>`}
          </div>
          <span class="rv-sala-flecha" aria-hidden="true">${abierta ? '▴' : '▾'}</span>
        </button>
        ${abierta ? Object.entries(grupos).map(([nombre, horarios]) => `
          <div class="rv-franja">
            <span class="rv-franja-nombre">${nombre}</span>
            <div class="rv-horarios">
              ${horarios.map(h => {
                const elegido = eleccion.sala?.id === sala.id && eleccion.horario?.hora_inicio === h.hora_inicio;
                return `<button type="button" class="rv-horario${elegido ? ' elegido' : ''}" data-sala="${sala.id}" data-inicio="${h.hora_inicio}" data-fin="${h.hora_fin}"
                  aria-pressed="${elegido}">${h.hora_inicio}<small> a ${h.hora_fin}</small></button>`;
              }).join('')}
            </div>
          </div>`).join('') : ''}
      </article>`;
  }).join('') +
  (sinHorarios.length ? `<p class="rv-ayuda">Sin horarios libres ese día: ${sinHorarios.map(s => escapar(nombreSala(s.nombre))).join(', ')}.</p>` : '') +
  (datos.salas_chicas.length ? `<p class="rv-ayuda">No se muestran ${datos.salas_chicas.map(s => `la ${escapar(nombreSala(s.nombre))} (hasta ${s.capacidad} personas)`).join(' ni ')} porque no entran ${eleccion.personas} invitados.</p>` : '');

  ultimoDia = datos;
  // Se guardan los datos de cada sala para el resumen
  contenedor.dataset.salas = JSON.stringify(conHorarios.map(({ horarios, ...sala }) => sala));
}

// ---------- PASO 4: resumen y envío ----------

function resumenHtml(datos = null) {
  const { total, sena } = presupuesto(eleccion.paquete, eleccion.personas);
  const r = datos || {
    paquete: eleccion.paquete.nombre, fecha: eleccion.fecha, hora_inicio: eleccion.horario.hora_inicio,
    hora_fin: eleccion.horario.hora_fin, sala: eleccion.sala.nombre, personas: eleccion.personas,
    importe_estimado: total, sena_requerida: sena
  };
  const conCambiar = !datos;
  const cambiar = (paso) => conCambiar ? ` <button type="button" class="rv-enlace" data-siguiente="${paso}">Cambiar</button>` : '';
  return `
    <dl>
      <div><dt>Fiesta</dt><dd>${escapar(r.paquete)} · ${r.personas} invitados${cambiar(1)}</dd></div>
      <div><dt>Día</dt><dd>${fechaLarga(r.fecha)}${cambiar(2)}</dd></div>
      <div><dt>Horario</dt><dd>${r.hora_inicio} a ${r.hora_fin} hs · ${escapar(nombreSala(r.sala))}${cambiar(3)}</dd></div>
      <div><dt>Precio estimado</dt><dd><strong>${pesos(r.importe_estimado)}</strong> · seña ${pesos(r.sena_requerida)}</dd></div>
    </dl>`;
}

function mensajeWhatsapp(id, datosCliente) {
  const texto = `¡Hola! Soy ${datosCliente.nombre} ${datosCliente.apellido}. Dejé la solicitud de reserva N.º ${id} en la web: ` +
    `${eleccion.paquete.nombre} para ${eleccion.personas} invitados, el ${fechaLarga(eleccion.fecha).toLowerCase()} ` +
    `de ${eleccion.horario.hora_inicio} a ${eleccion.horario.hora_fin} en la ${nombreSala(eleccion.sala.nombre)}. ¿Me pasan los datos para la seña?`;
  return `https://wa.me/${WHATSAPP_SALON}?text=${encodeURIComponent(texto)}`;
}

function marcarCampo(nombre, mensaje) {
  const formulario = $('#rv-formulario');
  formulario.querySelectorAll('.rv-invalido').forEach(c => c.classList.remove('rv-invalido'));
  const error = $('#rv-error');
  error.hidden = !mensaje;
  error.textContent = mensaje || '';
  if (nombre && formulario[nombre]) {
    formulario[nombre].classList.add('rv-invalido');
    formulario[nombre].focus();
  }
}

function validarFormulario(datos) {
  const soloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ' -]{2,}$/;
  if (!soloLetras.test(datos.nombre.trim())) return ['nombre', 'Ingresá tu nombre (sólo letras).'];
  if (!soloLetras.test(datos.apellido.trim())) return ['apellido', 'Ingresá tu apellido (sólo letras).'];
  const dni = datos.dni.replace(/\D/g, '');
  if (dni.length < 7 || dni.length > 8) return ['dni', 'Ingresá tu DNI (7 u 8 números, sin puntos).'];
  if (datos.telefono.replace(/\D/g, '').length < 8) return ['telefono', 'Ingresá un teléfono con característica, por ejemplo 351 555-1234.'];
  if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim())) return ['email', 'El correo no es válido (o dejalo vacío).'];
  return null;
}

async function enviar(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  const datos = Object.fromEntries(new FormData(formulario));
  const problema = validarFormulario(datos);
  if (problema) return marcarCampo(...problema);
  marcarCampo(null, '');

  const boton = formulario.querySelector('[type=submit]');
  boton.disabled = true;
  boton.textContent = 'Enviando...';
  try {
    const respuesta = await pedir('/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...datos,
        paquete_id: eleccion.paquete.id, personas: eleccion.personas, fecha: eleccion.fecha,
        sala_id: eleccion.sala.id, hora_inicio: eleccion.horario.hora_inicio
      })
    });
    $('#rv-final-titulo').textContent = `¡Recibimos tu solicitud N.º ${respuesta.id}!`;
    $('#rv-final-resumen').innerHTML = resumenHtml(respuesta.resumen);
    $('#rv-whatsapp').href = mensajeWhatsapp(respuesta.id, datos);
    irAPaso(5);
  } catch (error) {
    if (error.codigo === 'horario_ocupado') {
      // Alguien tomó el horario mientras se completaban los datos: se vuelve a mostrar lo libre
      eleccion.horario = null;
      eleccion.sala = null;
      habilitarHasta(3);
      irAPaso(3);
      await dibujarSalas();
      $('#rv-salas').insertAdjacentHTML('afterbegin', '<div class="rv-aviso">Ese horario se acaba de ocupar. Elegí otro de los que siguen libres.</div>');
    } else {
      marcarCampo(error.campo, error.message);
    }
  } finally {
    boton.disabled = false;
    boton.textContent = 'Enviar solicitud';
  }
}

// ---------- inicio ----------

async function iniciar() {
  try {
    const [listaPaquetes, salas] = await Promise.all([pedir('/paquetes'), pedir('/salas')]);
    paquetes = listaPaquetes;
    capacidadMaxima = Math.max(0, ...salas.map(s => s.capacidad_ninos + s.capacidad_adultos));
  } catch (error) {
    $('#rv-paquetes').innerHTML = `<p class="rv-error">${escapar(error.message)}</p>
      <a class="boton-whatsapp" href="https://wa.me/${WHATSAPP_SALON}" target="_blank" rel="noopener">Consultar por WhatsApp</a>`;
    return;
  }
  if (!paquetes.length) {
    $('#rv-paquetes').innerHTML = '<p class="rv-ayuda">Por el momento no hay paquetes publicados. Escribinos por WhatsApp.</p>';
    return;
  }
  eleccion.mes = mesDe(hoy());
  dibujarPaquetes();
  actualizarPrecio();
}

document.addEventListener('DOMContentLoaded', () => {
  iniciar();

  // Paso 1
  $('#rv-paquetes').addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-paquete]');
    if (!boton) return;
    const paquete = paquetes.find(p => String(p.id) === boton.dataset.paquete);
    if (eleccion.paquete?.id !== paquete.id) invalidarDesde(2);
    // Al elegir el paquete se proponen los invitados que incluye (si todavía no se tocaron)
    if (!eleccion.paquete && paquete.personas_incluidas) cambiarPersonas(paquete.personas_incluidas);
    eleccion.paquete = paquete;
    dibujarPaquetes();
    actualizarPrecio();
  });
  document.querySelectorAll('[data-cambiar]').forEach(boton => {
    boton.addEventListener('click', () => cambiarPersonas(eleccion.personas + Number(boton.dataset.cambiar)));
  });
  $('#rv-personas').addEventListener('change', (evento) => cambiarPersonas(evento.target.value));

  // Botones "Siguiente / Volver / Cambiar" (también los que se dibujan después)
  document.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-siguiente]');
    if (!boton) return;
    const paso = Number(boton.dataset.siguiente);
    if (paso === 2 && pasoActual === 1) {
      habilitarHasta(Math.max(pasoMaximo, 2));
      if (eleccion.fecha) eleccion.mes = mesDe(eleccion.fecha);
      dibujarCalendario();
    }
    irAPaso(paso);
  });
  $('#rv-progreso').addEventListener('click', (evento) => {
    const item = evento.target.closest('[data-ir]');
    if (item && Number(item.dataset.ir) <= pasoMaximo) {
      if (Number(item.dataset.ir) === 2) dibujarCalendario();
      irAPaso(Number(item.dataset.ir));
    }
  });

  // Paso 2
  $('#rv-mes-anterior').addEventListener('click', () => { eleccion.mes = moverMes(eleccion.mes, -1); dibujarCalendario(); });
  $('#rv-mes-siguiente').addEventListener('click', () => { eleccion.mes = moverMes(eleccion.mes, 1); dibujarCalendario(); });
  $('#rv-cal-dias').addEventListener('click', (evento) => {
    const dia = evento.target.closest('[data-fecha]');
    if (!dia || dia.disabled) return;
    if (eleccion.fecha !== dia.dataset.fecha) invalidarDesde(3);
    eleccion.fecha = dia.dataset.fecha;
    habilitarHasta(Math.max(pasoMaximo, 3));
    dibujarSalas();
    irAPaso(3);
  });

  // Paso 3
  $('#rv-salas').addEventListener('click', (evento) => {
    const cabecera = evento.target.closest('[data-abrir-sala]');
    if (cabecera) {
      salaAbierta = Number(cabecera.dataset.abrirSala);
      pintarSalas(ultimoDia);
      return;
    }
    const boton = evento.target.closest('[data-inicio]');
    if (!boton) return;
    const salas = JSON.parse($('#rv-salas').dataset.salas || '[]');
    eleccion.sala = salas.find(s => String(s.id) === boton.dataset.sala);
    eleccion.horario = { hora_inicio: boton.dataset.inicio, hora_fin: boton.dataset.fin };
    habilitarHasta(4);
    $('#rv-resumen').innerHTML = resumenHtml();
    irAPaso(4);
    $('#rv-formulario').nombre.focus({ preventScroll: true });
  });

  // Paso 4
  $('#rv-formulario').addEventListener('submit', enviar);
  // El aviso de error se borra en cuanto se corrige el campo
  $('#rv-formulario').addEventListener('input', (evento) => {
    if (evento.target.classList.contains('rv-invalido')) marcarCampo(null, '');
  });

  // Confirmación
  $('#rv-otra').addEventListener('click', () => {
    invalidarDesde(2);
    habilitarHasta(1);
    $('#rv-formulario').reset();
    irAPaso(1);
  });
});
