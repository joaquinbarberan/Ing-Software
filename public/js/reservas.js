// Página pública de reservas en 4 pasos (ver CAMBIOS.md).
//
// 1. Paquete e invitados  -> se ve el precio estimado y la seña al instante.
// 2. Día                  -> un calendario marca qué días tienen horarios libres.
// 3. Sala y horario       -> los horarios libres aparecen como botones: no hay que tipear horas.
// 4. Datos                -> se envía una SOLICITUD que Ventas revisa y convierte en reserva.
//
// El cliente no registra la reserva por su cuenta (frontera del sistema, sección 10.3 del informe):
// la solicitud no ocupa la fecha. La fecha queda tomada cuando Ventas carga la reserva y la seña.


// Reservas públicas Diverty Park.
// El cliente solicita una fecha; Ventas confirma y registra la reserva.

const WHATSAPP_SALON = '5493513785678';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS = [
  'domingo', 'lunes', 'martes', 'miércoles',
  'jueves', 'viernes', 'sábado'
];

const MESES_ADELANTE = 12;
const DURACION_HORAS = 2.5;
const NINOS_INCLUIDOS = 30;
const PORCENTAJE_SENA = 0.30;

const eleccion = {
  ninos: 30,
  adultos: 0,
  mes: null,
  fecha: null,
  sala: null,
  horario: null,
  adicionales: {}
};

let salasCatalogo = [];
let adicionalesCatalogo = [];
let capacidadMaxima = 0;

let pasoActual = 1;
let pasoMaximo = 1;

let consultaCalendario = 0;
let salaAbierta = null;
let ultimoDia = null;
let salasDisponiblesDia = [];

const $ = (selector) => document.querySelector(selector);


// --------------------------------------------------
// UTILIDADES
// --------------------------------------------------

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function pesos(monto) {
  return `$${Number(monto || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

function hoy() {
  const fecha = new Date();

  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function mesDe(fecha) {
  return fecha.slice(0, 7);
}

function moverMes(mes, cantidad) {
  const [anio, numeroMes] = mes.split('-').map(Number);
  const fecha = new Date(anio, numeroMes - 1 + cantidad, 1);

  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function fechaLarga(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);

  const nombreDia = DIAS[
    new Date(anio, mes - 1, dia).getDay()
  ];

  return `${nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1)} ${dia} de ${MESES[mes - 1].toLowerCase()}`;
}

function nombreSala(nombre) {
  const texto = String(nombre || '');

  return texto.charAt(0) + texto.slice(1).toLowerCase();
}

async function pedir(url, opciones) {
  let respuesta;

  try {
    respuesta = await fetch(url, opciones);
  } catch {
    throw new Error(
      'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.'
    );
  }

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    const error = new Error(
      datos.error || 'Ocurrió un problema. Intentá de nuevo.'
    );

    Object.assign(error, datos, {
      estado: respuesta.status
    });

    throw error;
  }

  return datos;
}


// --------------------------------------------------
// INVITADOS
// --------------------------------------------------

function totalInvitados() {
  return eleccion.ninos + eleccion.adultos;
}

function validarInvitados() {
  const total = totalInvitados();

  if (eleccion.ninos < 0 || eleccion.adultos < 0) {
    return {
      valido: false,
      mensaje: 'La cantidad de niños y adultos no puede ser negativa.'
    };
  }

  if (total < 1) {
    return {
      valido: false,
      mensaje: 'Indicá al menos un invitado.'
    };
  }

  if (capacidadMaxima > 0 && total > capacidadMaxima) {
    return {
      valido: false,
      mensaje: `La sala de mayor capacidad admite hasta ${capacidadMaxima} personas.`
    };
  }

  return {
    valido: true,
    mensaje: `${total} invitados en total · ${eleccion.ninos} niños y ${eleccion.adultos} adultos.`
  };
}

function actualizarInvitadosUI() {
  $('#rv-ninos').value = eleccion.ninos;
  $('#rv-adultos').value = eleccion.adultos;

  const validacion = validarInvitados();

  $('#rv-ayuda-personas').textContent = validacion.mensaje;

  $('#rv-ayuda-personas').classList.toggle(
    'rv-ayuda-error',
    !validacion.valido
  );

  $('#rv-ir-dia').disabled = !validacion.valido;
}

function invalidarFechaYSala() {
  eleccion.fecha = null;
  eleccion.sala = null;
  eleccion.horario = null;

  ultimoDia = null;
  salasDisponiblesDia = [];
  salaAbierta = null;

  pasoMaximo = 1;
}

function cambiarInvitados(campo, valor) {
  const nuevo = Math.max(
    0,
    Math.min(200, Math.round(Number(valor) || 0))
  );

  if (eleccion[campo] === nuevo) return;

  eleccion[campo] = nuevo;

  invalidarFechaYSala();
  actualizarInvitadosUI();
}


// --------------------------------------------------
// NAVEGACIÓN ENTRE PASOS
// --------------------------------------------------

function irAPaso(numero) {
  if (numero > pasoMaximo && numero !== 6) return;

  pasoActual = numero;

  document.querySelectorAll('.rv-paso').forEach(seccion => {
    seccion.hidden = Number(seccion.dataset.paso) !== numero;
  });

  document.querySelectorAll('#rv-progreso li').forEach(item => {
    const paso = Number(item.dataset.ir);

    item.classList.toggle('actual', paso === numero);

    item.classList.toggle(
      'hecho',
      paso < numero || (paso <= pasoMaximo && paso !== numero)
    );
  });

  $('#rv-progreso').hidden = numero === 6;

  $('.rv-caja').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function habilitarHasta(numero) {
  pasoMaximo = Math.max(pasoMaximo, numero);
}


// --------------------------------------------------
// PRECIOS
// --------------------------------------------------

function esFinDeSemana(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);

  const diaSemana = new Date(anio, mes - 1, dia).getDay();

  return diaSemana === 5 ||
         diaSemana === 6 ||
         diaSemana === 0;
}

function precioSalaParaFecha(sala, fecha) {
  const precio = esFinDeSemana(fecha)
    ? sala.precio_viernes_domingo
    : sala.precio_lunes_jueves;

  return Number(precio) || 0;
}

function cantidadAdicional(adicional) {
  const valor = Number(eleccion.adicionales[adicional.id] || 0);

  if (!valor) return 0;

  if (adicional.modalidad_cobro === 'por_evento') {
    return 1;
  }

  return Math.max(
    Number(adicional.cantidad_minima) || 1,
    valor
  );
}

function adicionalesSeleccionados() {
  return adicionalesCatalogo
    .filter(adicional => cantidadAdicional(adicional) > 0)
    .map(adicional => ({
      ...adicional,
      cantidad_seleccionada: cantidadAdicional(adicional),
      subtotal: cantidadAdicional(adicional) *
                Number(adicional.precio)
    }));
}

function tieneCoordinadorExtra() {
  const coordinador = adicionalesCatalogo.find(adicional =>
    adicional.nombre.toLowerCase().includes('coordinador extra')
  );

  return coordinador
    ? cantidadAdicional(coordinador) > 0
    : false;
}

function presupuestoActual() {
  const precioSala = eleccion.sala && eleccion.fecha
    ? precioSalaParaFecha(eleccion.sala, eleccion.fecha)
    : 0;

  const ninosExcedentes = Math.max(
    0,
    eleccion.ninos - NINOS_INCLUIDOS
  );

  const tarifaNino = tieneCoordinadorExtra()
    ? 4000
    : 5500;

  const cargoNinos = ninosExcedentes * tarifaNino;

  const items = adicionalesSeleccionados();

  const totalAdicionales = items.reduce(
    (suma, item) => suma + item.subtotal,
    0
  );

  const total = precioSala + cargoNinos + totalAdicionales;

  const sena = Math.round(total * PORCENTAJE_SENA);

  return {
    precioSala,
    ninosExcedentes,
    tarifaNino,
    cargoNinos,
    items,
    totalAdicionales,
    total,
    sena
  };
}

function actualizarResumenPrecio() {
  const caja = $('#rv-precio');

  if (!eleccion.sala || !eleccion.fecha) {
    caja.hidden = true;
    return;
  }

  const presupuesto = presupuestoActual();

  const detalleAdicionales = presupuesto.items.length
    ? presupuesto.items.map(item => `
        <p>
          ${escapar(item.nombre)} × ${item.cantidad_seleccionada}:
          <strong>${pesos(item.subtotal)}</strong>
        </p>
      `).join('')
    : '<p>No seleccionaste adicionales.</p>';

  caja.hidden = false;

  caja.innerHTML = `
    <div>
      <span>Precio de ${escapar(nombreSala(eleccion.sala.nombre))}</span>
      <strong>${pesos(presupuesto.precioSala)}</strong>
    </div>

    <div>
      <span>Niños excedentes (${presupuesto.ninosExcedentes})</span>
      <strong>${pesos(presupuesto.cargoNinos)}</strong>
    </div>

    <p>
      ${presupuesto.ninosExcedentes > 0
        ? `Tarifa por niño excedente: ${pesos(presupuesto.tarifaNino)}
           ${tieneCoordinadorExtra()
             ? 'por contratar coordinador extra.'
             : 'sin coordinador extra.'}`
        : 'El precio de la sala incluye hasta 30 niños.'}
    </p>

    ${detalleAdicionales}

    <div>
      <span>Total estimado</span>
      <strong>${pesos(presupuesto.total)}</strong>
    </div>

    <div>
      <span>Seña estimada (30 %)</span>
      <strong>${pesos(presupuesto.sena)}</strong>
    </div>
  `;
}


// --------------------------------------------------
// PASO 2: CALENDARIO
// --------------------------------------------------

async function dibujarCalendario() {
  const mes = eleccion.mes;

  const [anio, numeroMes] = mes.split('-').map(Number);

  $('#rv-mes-titulo').textContent =
    `${MESES[numeroMes - 1]} ${anio}`;

  $('#rv-mes-anterior').disabled =
    mes <= mesDe(hoy());

  $('#rv-mes-siguiente').disabled =
    mes >= moverMes(mesDe(hoy()), MESES_ADELANTE);

  const contenedor = $('#rv-cal-dias');

  contenedor.innerHTML =
    '<p class="rv-cargando rv-cal-cargando">Buscando días libres...</p>';

  const numeroConsulta = ++consultaCalendario;

  const total = totalInvitados();

  let datos;

  try {
    datos = await pedir(
      `/disponibilidad/mes?mes=${encodeURIComponent(mes)}&duracion=${DURACION_HORAS}&personas=${total}`
    );
  } catch (error) {
    if (numeroConsulta !== consultaCalendario) return;

    contenedor.innerHTML = `
      <p class="rv-error rv-cal-cargando">
        ${escapar(error.message)}
        <button type="button" class="rv-enlace" id="rv-reintentar-cal">
          Reintentar
        </button>
      </p>
    `;

    $('#rv-reintentar-cal').addEventListener(
      'click',
      dibujarCalendario
    );

    return;
  }

  if (numeroConsulta !== consultaCalendario) return;

  // Lunes es la primera columna.
  const primerDia = new Date(
    anio,
    numeroMes - 1,
    1
  ).getDay();

  const huecos = (primerDia + 6) % 7;

  const textos = {
    libre: 'hay horarios libres',
    pocos: 'quedan pocos horarios',
    completo: 'sin lugar',
    pasado: 'fecha pasada'
  };

  contenedor.innerHTML =
    '<span></span>'.repeat(huecos) +
    datos.dias.map(dia => {
      const numeroDia = Number(dia.fecha.slice(8));

      const elegible =
        dia.estado === 'libre' ||
        dia.estado === 'pocos';

      const elegido = dia.fecha === eleccion.fecha;

      return `
        <button
          type="button"
          class="rv-dia ${dia.estado}${elegido ? ' elegido' : ''}${dia.fecha === hoy() ? ' hoy' : ''}"
          data-fecha="${dia.fecha}"
          ${elegible ? '' : 'disabled'}
          aria-label="${fechaLarga(dia.fecha)}: ${textos[dia.estado]}">
          ${numeroDia}
        </button>
      `;
    }).join('');

  if (!datos.dias.some(dia =>
    dia.estado === 'libre' || dia.estado === 'pocos'
  )) {
    contenedor.insertAdjacentHTML(
      'beforeend',
      '<p class="rv-ayuda rv-cal-cargando">No quedan días libres este mes para esa cantidad de invitados. Probá el mes siguiente.</p>'
    );
  }
}


// --------------------------------------------------
// PASO 3: SALAS Y HORARIOS
// --------------------------------------------------

function franjaDelDia(hora) {
  if (hora < '12:00') return 'Mañana';
  if (hora < '17:00') return 'Tarde';

  return 'Noche';
}

function capacidadCompatible(sala) {
  const capacidadNinos = Number(sala.capacidad_ninos) || 0;
  const capacidadAdultos = Number(sala.capacidad_adultos) || 0;

  const ninosOk =
    capacidadNinos === 0 || eleccion.ninos <= capacidadNinos;

  const adultosOk =
    capacidadAdultos === 0 || eleccion.adultos <= capacidadAdultos;

  return ninosOk && adultosOk;
}

async function dibujarSalas() {
  $('#rv-dia-elegido').textContent =
    `${fechaLarga(eleccion.fecha)} · ${eleccion.ninos} niños y ${eleccion.adultos} adultos · fiesta de 2 h 30 min`;

  const contenedor = $('#rv-salas');

  contenedor.innerHTML =
    '<p class="rv-cargando">Buscando horarios libres...</p>';

  let datos;

  try {
    datos = await pedir(
      `/disponibilidad/dia?fecha=${encodeURIComponent(eleccion.fecha)}&duracion=${DURACION_HORAS}&personas=${totalInvitados()}`
    );
  } catch (error) {
    contenedor.innerHTML = `
      <p class="rv-error">
        ${escapar(error.message)}
        <button type="button" class="rv-enlace" id="rv-reintentar-salas">
          Reintentar
        </button>
      </p>
    `;

    $('#rv-reintentar-salas').addEventListener(
      'click',
      dibujarSalas
    );

    return;
  }

  pintarSalas(datos);
}

function pintarSalas(datos) {
  ultimoDia = datos;

  const contenedor = $('#rv-salas');

  // Combinamos los horarios de disponibilidad con los precios
  // que devuelve el endpoint público de salas.
 const salasCompletas = datos.salas.map(salaApi => {
  const catalogo = salasCatalogo.find(
    sala => Number(sala.id) === Number(salaApi.id)
  ) || {};

  return {
    ...salaApi,
    ...catalogo,

    horarios: salaApi.horarios || [],

    precio_lunes_jueves: Number(
      catalogo.precio_lunes_jueves ??
      salaApi.precio_lunes_jueves ??
      0
    ),

    precio_viernes_domingo: Number(
      catalogo.precio_viernes_domingo ??
      salaApi.precio_viernes_domingo ??
      0
    )
  };
});

  const compatibles = salasCompletas.filter(
    capacidadCompatible
  );

  const conHorarios = compatibles.filter(
    sala => sala.horarios.length > 0
  );

  const sinHorarios = compatibles.filter(
    sala => sala.horarios.length === 0
  );

  if (!conHorarios.length) {
    contenedor.innerHTML = `
      <div class="rv-aviso">
        No encontramos horarios disponibles en salas que admitan
        esa cantidad de niños y adultos.
        <button type="button" class="rv-enlace" data-siguiente="2">
          Elegí otro día
        </button>
      </div>
      <p class="rv-ayuda">
        Probá con otra fecha o revisá la cantidad de invitados.
      </p>
    `;

    return;
  }

  if (!conHorarios.some(sala =>
    Number(sala.id) === Number(salaAbierta)
  )) {
    salaAbierta = Number(
      (
        conHorarios.find(sala =>
          Number(sala.id) === Number(eleccion.sala?.id)
        ) || conHorarios[0]
      ).id
    );
  }

  salasDisponiblesDia = conHorarios;

  contenedor.innerHTML = conHorarios.map(sala => {
    const abierta =
      Number(sala.id) === Number(salaAbierta);

    const grupos = {};

    sala.horarios.forEach(horario => {
      (grupos[franjaDelDia(horario.hora_inicio)] ||= [])
        .push(horario);
    });

    const resumenGrupos = Object.entries(grupos)
      .map(([nombre, lista]) =>
        `${nombre.toLowerCase()} ${lista.length}`
      )
      .join(' · ');

    const tarifa = precioSalaParaFecha(sala, eleccion.fecha);

    const etiquetaTarifa = esFinDeSemana(eleccion.fecha)
      ? 'Viernes a domingo'
      : 'Lunes a jueves';

    return `
      <article class="rv-sala${abierta ? ' abierta' : ''}">

        <button
          type="button"
          class="rv-sala-cabecera"
          data-abrir-sala="${sala.id}"
          aria-expanded="${abierta}">

          <img
            src="${escapar(sala.imagen || './recursos/imagenes/payasio.png')}"
            alt=""
            onerror="this.src='./recursos/imagenes/payasio.png'">

          <div>
            <h3>${escapar(nombreSala(sala.nombre))}</h3>

            <p>
              Capacidad:
              ${Number(sala.capacidad_ninos) || 0} niños ·
              ${Number(sala.capacidad_adultos) || 0} adultos
            </p>

            <p>
              ${sala.horarios.length}
              horario${sala.horarios.length === 1 ? '' : 's'}
              disponible${sala.horarios.length === 1 ? '' : 's'}
            </p>

            <p class="rv-tarifa-sala">
              ${pesos(tarifa)}
              <small>${etiquetaTarifa}</small>
            </p>

            ${abierta ? '' : `
              <p class="rv-sala-resumen">
                ${escapar(resumenGrupos)}
              </p>
            `}
          </div>

          <span class="rv-sala-flecha" aria-hidden="true">
            ${abierta ? '▴' : '▾'}
          </span>
        </button>

        ${abierta ? Object.entries(grupos).map(([nombre, horarios]) => `
          <div class="rv-franja">
            <span class="rv-franja-nombre">${nombre}</span>

            <div class="rv-horarios">
              ${horarios.map(horario => {
                const elegido =
                  Number(eleccion.sala?.id) === Number(sala.id) &&
                  eleccion.horario?.hora_inicio === horario.hora_inicio;

                return `
                  <button
                    type="button"
                    class="rv-horario${elegido ? ' elegido' : ''}"
                    data-sala="${sala.id}"
                    data-inicio="${horario.hora_inicio}"
                    data-fin="${horario.hora_fin}"
                    aria-pressed="${elegido}">
                    ${horario.hora_inicio}
                    <small> a ${horario.hora_fin}</small>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `).join('') : ''}

      </article>
    `;
  }).join('') +

  (sinHorarios.length ? `
    <p class="rv-ayuda">
      Sin horarios libres:
      ${sinHorarios.map(sala =>
        escapar(nombreSala(sala.nombre))
      ).join(', ')}.
    </p>
  ` : '') +

  (datos.salas_chicas?.length ? `
    <p class="rv-ayuda">
      Hay salas que no admiten el total de
      ${totalInvitados()} invitados.
    </p>
  ` : '');
}


// --------------------------------------------------
// PASO 4: ADICIONALES
// --------------------------------------------------

function horasHastaEvento() {
  if (!eleccion.fecha || !eleccion.horario) return 0;

  const fechaHora = new Date(
    `${eleccion.fecha}T${eleccion.horario.hora_inicio}:00`
  );

  return (fechaHora.getTime() - Date.now()) / 3600000;
}

function dibujarAdicionales() {
  const contenedor = $('#rv-adicionales');

  const horasDisponibles = horasHastaEvento();

  if (!adicionalesCatalogo.length) {
    contenedor.innerHTML =
      '<p class="rv-ayuda">No hay adicionales disponibles por el momento.</p>';

    actualizarResumenPrecio();
    return;
  }

  contenedor.innerHTML = adicionalesCatalogo.map(adicional => {
    const minimo = Number(adicional.cantidad_minima) || 1;

    const seleccionado =
      cantidadAdicional(adicional) > 0;

    const requiere =
      Number(adicional.anticipacion_horas) || 72;

    const fueraDePlazo =
      horasDisponibles < requiere;

    const cantidad = seleccionado
      ? cantidadAdicional(adicional)
      : minimo;

    const esEvento =
      adicional.modalidad_cobro === 'por_evento';

    const descripcionUnidad = esEvento
      ? 'Precio único por evento; incluye a todos los niños.'
      : `${pesos(adicional.precio)} por ${escapar(adicional.unidad)}${minimo > 1 ? ` · mínimo ${minimo}` : ''}`;

    return `
      <article class="rv-adicional">

        <label for="rv-adicional-${adicional.id}">
          <input
            type="checkbox"
            id="rv-adicional-${adicional.id}"
            data-adicional="${adicional.id}"
            ${seleccionado ? 'checked' : ''}
            ${fueraDePlazo ? 'disabled' : ''}>

          <span class="rv-adicional-info">
            <strong>${escapar(adicional.nombre)}</strong>
            <small>${descripcionUnidad}</small>

            ${fueraDePlazo ? `
              <small class="rv-error">
                Requiere contratarse con ${requiere} horas de anticipación.
              </small>
            ` : ''}
          </span>
        </label>

        <div class="rv-adicional-precio">
          <span>
            ${pesos(adicional.precio)}${esEvento ? ' / evento' : ''}
          </span>

          ${esEvento ? '<span>Una vez</span>' : `
            <input
              class="rv-adicional-cantidad"
              type="number"
              min="${minimo}"
              step="1"
              value="${cantidad}"
              data-cantidad-adicional="${adicional.id}"
              aria-label="Cantidad de ${escapar(adicional.nombre)}"
              ${seleccionado && !fueraDePlazo ? '' : 'disabled'}>
          `}
        </div>

      </article>
    `;
  }).join('');

  actualizarResumenPrecio();
}


// --------------------------------------------------
// RESUMEN Y ENVÍO
// --------------------------------------------------

function resumenHtml() {
  const calculo = presupuestoActual();

  const adicionalesHtml = calculo.items.length
    ? calculo.items.map(item => `
        <div>
          <dt>
            ${escapar(item.nombre)} × ${item.cantidad_seleccionada}
          </dt>
          <dd>${pesos(item.subtotal)}</dd>
        </div>
      `).join('')
    : `
        <div>
          <dt>Adicionales</dt>
          <dd>Ninguno</dd>
        </div>
      `;

  return `
    <dl>

      <div>
        <dt>Sala</dt>
        <dd>
          ${escapar(nombreSala(eleccion.sala.nombre))}
          · ${pesos(calculo.precioSala)}
        </dd>
      </div>

      <div>
        <dt>Día</dt>
        <dd>${fechaLarga(eleccion.fecha)}</dd>
      </div>

      <div>
        <dt>Horario</dt>
        <dd>
          ${eleccion.horario.hora_inicio}
          a ${eleccion.horario.hora_fin} hs
        </dd>
      </div>

      <div>
        <dt>Invitados</dt>
        <dd>
          ${eleccion.ninos} niños y ${eleccion.adultos} adultos
        </dd>
      </div>

      ${calculo.ninosExcedentes > 0 ? `
        <div>
          <dt>Niños excedentes</dt>
          <dd>
            ${calculo.ninosExcedentes} ×
            ${pesos(calculo.tarifaNino)} =
            ${pesos(calculo.cargoNinos)}
          </dd>
        </div>
      ` : ''}

      ${adicionalesHtml}

      <div>
        <dt><strong>Total estimado</strong></dt>
        <dd><strong>${pesos(calculo.total)}</strong></dd>
      </div>

      <div>
        <dt>Seña estimada (30 %)</dt>
        <dd><strong>${pesos(calculo.sena)}</strong></dd>
      </div>

    </dl>
  `;
}

function mensajeWhatsapp(id, datosCliente) {
  const calculo = presupuestoActual();

  const adicionales = calculo.items.length
    ? calculo.items.map(item =>
        `${item.nombre} x ${item.cantidad_seleccionada}`
      ).join(', ')
    : 'Sin adicionales';

  const texto =
    `¡Hola! Soy ${datosCliente.nombre} ${datosCliente.apellido}. ` +
    `Dejé la solicitud de reserva N.º ${id} en la web para ` +
    `${fechaLarga(eleccion.fecha).toLowerCase()}, ` +
    `de ${eleccion.horario.hora_inicio} a ${eleccion.horario.hora_fin}, ` +
    `en ${nombreSala(eleccion.sala.nombre)}. ` +
    `Invitados: ${eleccion.ninos} niños y ${eleccion.adultos} adultos. ` +
    `Adicionales: ${adicionales}. ` +
    `Total estimado: ${pesos(calculo.total)}. ` +
    `¿Me pasan los datos para la seña?`;

  return `https://wa.me/${WHATSAPP_SALON}?text=${encodeURIComponent(texto)}`;
}

function marcarCampo(nombre, mensaje) {
  const formulario = $('#rv-formulario');

  formulario.querySelectorAll('.rv-invalido').forEach(campo => {
    campo.classList.remove('rv-invalido');
  });

  const error = $('#rv-error');

  error.hidden = !mensaje;
  error.textContent = mensaje || '';

  if (nombre && formulario.elements[nombre]) {
    formulario.elements[nombre].classList.add('rv-invalido');
    formulario.elements[nombre].focus();
  }
}

function validarFormulario(datos) {
  const soloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ' -]{2,}$/;

  if (!soloLetras.test(String(datos.nombre || '').trim())) {
    return ['nombre', 'Ingresá tu nombre (sólo letras).'];
  }

  if (!soloLetras.test(String(datos.apellido || '').trim())) {
    return ['apellido', 'Ingresá tu apellido (sólo letras).'];
  }

  const dni = String(datos.dni || '').replace(/\D/g, '');

  if (dni.length < 7 || dni.length > 8) {
    return ['dni', 'Ingresá tu DNI (7 u 8 números, sin puntos).'];
  }

  if (String(datos.telefono || '').replace(/\D/g, '').length < 8) {
    return ['telefono', 'Ingresá un teléfono con característica, por ejemplo 351 555-1234.'];
  }

  if (
    datos.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(datos.email).trim())
  ) {
    return ['email', 'El correo no es válido (o dejalo vacío).'];
  }

  return null;
}

async function enviar(evento) {
  evento.preventDefault();

  const formulario = evento.target;
  const datos = Object.fromEntries(new FormData(formulario));

  const problema = validarFormulario(datos);

  if (problema) return marcarCampo(...problema);

  marcarCampo(null, '');

  if (!eleccion.sala || !eleccion.fecha || !eleccion.horario) {
    marcarCampo(null, 'Falta seleccionar una fecha, sala y horario.');
    return;
  }

  const boton = formulario.querySelector('[type="submit"]');

  boton.disabled = true;
  boton.textContent = 'Enviando...';

  try {
    const respuesta = await pedir('/solicitudes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...datos,
        paquete_id: null,
        personas: totalInvitados(),
        ninos: eleccion.ninos,
        adultos: eleccion.adultos,
        fecha: eleccion.fecha,
        sala_id: eleccion.sala.id,
        hora_inicio: eleccion.horario.hora_inicio,

        adicionales: adicionalesSeleccionados().map(item => ({
          id: item.id,
          cantidad: item.cantidad_seleccionada
        }))
      })
    });

    $('#rv-final-titulo').textContent =
      `¡Recibimos tu solicitud N.º ${respuesta.id}!`;

    $('#rv-final-resumen').innerHTML = resumenHtml();

    $('#rv-whatsapp').href =
      mensajeWhatsapp(respuesta.id, datos);

    irAPaso(6);

  } catch (error) {
    if (error.codigo === 'horario_ocupado') {
      eleccion.horario = null;
      eleccion.sala = null;

      habilitarHasta(3);
      irAPaso(3);

      await dibujarSalas();

      $('#rv-salas').insertAdjacentHTML(
        'afterbegin',
        '<div class="rv-aviso">Ese horario se acaba de ocupar. Elegí otro de los que siguen libres.</div>'
      );

    } else {
      marcarCampo(error.campo, error.message);
    }

  } finally {
    boton.disabled = false;
    boton.textContent = 'Enviar solicitud';
  }
}


// --------------------------------------------------
// INICIO
// --------------------------------------------------

async function iniciar() {
  const mensajeError = $('#rv-carga-error');

  try {
    const [salas, adicionales] = await Promise.all([
      pedir('/salas'),
      pedir('/adicionales?activos=true')
    ]);

    salasCatalogo = Array.isArray(salas) ? salas : [];

    adicionalesCatalogo = Array.isArray(adicionales)
      ? adicionales.filter(adicional => adicional.activo !== false)
      : [];

    capacidadMaxima = Math.max(
      0,
      ...salasCatalogo.map(sala =>
        (Number(sala.capacidad_ninos) || 0) +
        (Number(sala.capacidad_adultos) || 0)
      )
    );

    eleccion.mes = mesDe(hoy());

    actualizarInvitadosUI();

  } catch (error) {
    mensajeError.hidden = false;

    mensajeError.textContent =
      `${error.message} También podés consultarnos por WhatsApp.`;

    $('#rv-ir-dia').disabled = true;
  }
}


// --------------------------------------------------
// EVENTOS
// --------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {

  iniciar();

  // Cambiar cantidad de niños y adultos.

  document.querySelectorAll('[data-cambiar-ninos]').forEach(boton => {
    boton.addEventListener('click', () => {
      cambiarInvitados(
        'ninos',
        eleccion.ninos + Number(boton.dataset.cambiarNinos)
      );
    });
  });

  document.querySelectorAll('[data-cambiar-adultos]').forEach(boton => {
    boton.addEventListener('click', () => {
      cambiarInvitados(
        'adultos',
        eleccion.adultos + Number(boton.dataset.cambiarAdultos)
      );
    });
  });

  $('#rv-ninos').addEventListener('change', evento => {
    cambiarInvitados('ninos', evento.target.value);
  });

  $('#rv-adultos').addEventListener('change', evento => {
    cambiarInvitados('adultos', evento.target.value);
  });


  // Navegación de pasos.

  document.addEventListener('click', async evento => {
    const boton = evento.target.closest('[data-siguiente]');

    if (!boton) return;

    const paso = Number(boton.dataset.siguiente);

    if (paso === 2 && pasoActual === 1) {
      const validacion = validarInvitados();

      if (!validacion.valido) {
        actualizarInvitadosUI();
        return;
      }

      habilitarHasta(2);

      eleccion.mes = eleccion.fecha
        ? mesDe(eleccion.fecha)
        : mesDe(hoy());

      await dibujarCalendario();

    } else if (paso === 3) {
      if (eleccion.fecha) {
        await dibujarSalas();
      }

    } else if (paso === 4) {
      if (eleccion.sala && eleccion.horario) {
        dibujarAdicionales();
      }

    } else if (paso === 5) {
      if (!eleccion.sala || !eleccion.horario || !eleccion.fecha) {
        return;
      }

      $('#rv-resumen').innerHTML = resumenHtml();

      habilitarHasta(5);
    }

    irAPaso(paso);
  });


  // Permitir volver a pasos anteriores desde el indicador.

  $('#rv-progreso').addEventListener('click', async evento => {
    const item = evento.target.closest('[data-ir]');

    if (!item) return;

    const paso = Number(item.dataset.ir);

    if (paso > pasoMaximo) return;

    if (paso === 2) await dibujarCalendario();
    if (paso === 3) await dibujarSalas();
    if (paso === 4) dibujarAdicionales();

    if (paso === 5) {
      $('#rv-resumen').innerHTML = resumenHtml();
    }

    irAPaso(paso);
  });


  // Calendario.

  $('#rv-mes-anterior').addEventListener('click', () => {
    eleccion.mes = moverMes(eleccion.mes, -1);
    dibujarCalendario();
  });

  $('#rv-mes-siguiente').addEventListener('click', () => {
    eleccion.mes = moverMes(eleccion.mes, 1);
    dibujarCalendario();
  });

  $('#rv-cal-dias').addEventListener('click', async evento => {
    const dia = evento.target.closest('[data-fecha]');

    if (!dia || dia.disabled) return;

    if (eleccion.fecha !== dia.dataset.fecha) {
      eleccion.sala = null;
      eleccion.horario = null;

      ultimoDia = null;
      salaAbierta = null;
    }

    eleccion.fecha = dia.dataset.fecha;

    habilitarHasta(3);

    await dibujarSalas();

    irAPaso(3);
  });


  // Elegir sala y horario.

  $('#rv-salas').addEventListener('click', evento => {
    const cabecera = evento.target.closest('[data-abrir-sala]');

    if (cabecera) {
      salaAbierta = Number(cabecera.dataset.abrirSala);

      pintarSalas(ultimoDia);

      return;
    }

    const boton = evento.target.closest('[data-inicio]');

    if (!boton) return;

    const sala = salasDisponiblesDia.find(item =>
      Number(item.id) === Number(boton.dataset.sala)
    );

    if (!sala) return;

    eleccion.sala = sala;

    eleccion.horario = {
      hora_inicio: boton.dataset.inicio,
      hora_fin: boton.dataset.fin
    };

    habilitarHasta(4);

    dibujarAdicionales();

    irAPaso(4);
  });


  // Seleccionar adicionales y cambiar cantidades.

  $('#rv-adicionales').addEventListener('change', evento => {
    const checkbox = evento.target.closest('[data-adicional]');

    if (checkbox) {
      const adicional = adicionalesCatalogo.find(item =>
        Number(item.id) === Number(checkbox.dataset.adicional)
      );

      if (!adicional) return;

      if (checkbox.checked) {
        eleccion.adicionales[adicional.id] =
          adicional.modalidad_cobro === 'por_evento'
            ? 1
            : (Number(adicional.cantidad_minima) || 1);

      } else {
        delete eleccion.adicionales[adicional.id];
      }

      dibujarAdicionales();

      return;
    }

    const campoCantidad = evento.target.closest(
      '[data-cantidad-adicional]'
    );

    if (campoCantidad) {
      const adicional = adicionalesCatalogo.find(item =>
        Number(item.id) ===
        Number(campoCantidad.dataset.cantidadAdicional)
      );

      if (!adicional) return;

      const minimo = Number(adicional.cantidad_minima) || 1;

      const cantidad = Math.max(
        minimo,
        Math.floor(Number(campoCantidad.value) || minimo)
      );

      eleccion.adicionales[adicional.id] = cantidad;

      campoCantidad.value = cantidad;

      actualizarResumenPrecio();
    }
  });


  // Formulario.

  $('#rv-formulario').addEventListener('submit', enviar);

  $('#rv-formulario').addEventListener('input', evento => {
    if (evento.target.classList.contains('rv-invalido')) {
      marcarCampo(null, '');
    }
  });


  // Reiniciar una solicitud.

  $('#rv-otra').addEventListener('click', () => {
    eleccion.ninos = 30;
    eleccion.adultos = 0;

    eleccion.mes = mesDe(hoy());
    eleccion.fecha = null;
    eleccion.sala = null;
    eleccion.horario = null;
    eleccion.adicionales = {};

    salasDisponiblesDia = [];
    ultimoDia = null;
    salaAbierta = null;

    pasoMaximo = 1;

    $('#rv-formulario').reset();
    $('#rv-precio').hidden = true;

    actualizarInvitadosUI();

    irAPaso(1);
  });

});
