// CU-04 · Visualizar agenda (vista mensual y semanal)
import { api, query } from '../api.js';
import { ponerMigas, reemplazarRuta, navegar } from '../navegacion.js';
import {
  ESTADOS, esc, puede, aFecha, aTexto, hoy, sumarDias, nombreMes, fechaCorta, almacen, panelError
} from '../util.js';

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HORA_DESDE = 9;
const HORA_HASTA = 23;
const ALTO_HORA = 44; // píxeles por hora en la vista semanal

// Lunes de la semana de una fecha
function lunesDe(texto) {
  const fecha = aFecha(texto);
  const dia = (fecha.getDay() + 6) % 7; // 0 = lunes
  fecha.setDate(fecha.getDate() - dia);
  return aTexto(fecha);
}

function periodo(vista, referencia) {
  if (vista === 'semana') {
    const desde = lunesDe(referencia);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  const fecha = aFecha(referencia);
  const desde = aTexto(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
  const hasta = aTexto(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0));
  return { desde, hasta };
}

function tituloPeriodo(vista, referencia) {
  const fecha = aFecha(referencia);
  if (vista === 'semana') {
    const { desde, hasta } = periodo('semana', referencia);
    return `Semana del ${fechaCorta(desde).slice(0, 5)} al ${fechaCorta(hasta)}`;
  }
  const mes = nombreMes(fecha.getMonth());
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${fecha.getFullYear()}`;
}

function bloqueReserva(reserva, extra = '') {
  const estado = ESTADOS[reserva.estado];
  return `
    <a class="evento ${estado.clase}" href="#/reservas/${reserva.id}" title="${esc(`${reserva.hora_inicio}-${reserva.hora_fin} · ${reserva.cliente_nombre} ${reserva.cliente_apellido} · ${reserva.sala_nombre} · ${estado.nombre}`)}" ${extra}>
      <strong>${reserva.hora_inicio}</strong> ${esc(reserva.cliente_apellido)}
      <span class="evento-sala">${esc(reserva.sala_nombre.replace(/^SALA /i, ''))}</span>
    </a>`;
}

function dibujarMes(referencia, reservas) {
  const { desde, hasta } = periodo('mes', referencia);
  const inicioGrilla = lunesDe(desde);
  const finGrilla = sumarDias(lunesDe(hasta), 6);
  const porDia = {};
  reservas.forEach(r => (porDia[r.fecha] ||= []).push(r));

  let celdas = '';
  for (let dia = inicioGrilla; dia <= finGrilla; dia = sumarDias(dia, 1)) {
    const fueraDeMes = dia < desde || dia > hasta;
    const delDia = porDia[dia] || [];
    celdas += `
      <div class="dia ${fueraDeMes ? 'dia-fuera' : ''} ${dia === hoy() ? 'dia-hoy' : ''}">
        <span class="dia-numero">${aFecha(dia).getDate()}</span>
        ${delDia.map(r => bloqueReserva(r)).join('')}
      </div>`;
  }

  return `
    <div class="calendario-mes" role="grid">
      ${DIAS_CORTOS.map(d => `<div class="dia-cabecera">${d}</div>`).join('')}
      ${celdas}
    </div>`;
}

function dibujarSemana(referencia, reservas, salas) {
  const lunes = lunesDe(referencia);
  const horas = [];
  for (let h = HORA_DESDE; h <= HORA_HASTA; h++) horas.push(h);
  const alto = (HORA_HASTA - HORA_DESDE) * ALTO_HORA;

  let columnas = '';
  for (let i = 0; i < 7; i++) {
    const dia = sumarDias(lunes, i);
    // Los eventos que se pisan en el horario (en distintas salas) se reparten el ancho en carriles
    const delDia = reservas.filter(r => r.fecha === dia).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    const finCarril = [];
    const carril = new Map();
    delDia.forEach(r => {
      let libre = finCarril.findIndex(fin => fin <= r.hora_inicio);
      if (libre === -1) libre = finCarril.length;
      finCarril[libre] = r.hora_fin;
      carril.set(r.id, libre);
    });
    const anchoCarril = 100 / Math.max(1, finCarril.length);
    const bloques = delDia.map(r => {
      const [hi, mi] = r.hora_inicio.split(':').map(Number);
      const [hf, mf] = r.hora_fin.split(':').map(Number);
      const top = (hi + mi / 60 - HORA_DESDE) * ALTO_HORA;
      const altoBloque = (hf + mf / 60 - hi - mi / 60) * ALTO_HORA;
      return bloqueReserva(r, `style="top:${top}px;height:${altoBloque - 2}px;left:${carril.get(r.id) * anchoCarril}%;width:calc(${anchoCarril}% - 2px)"`);
    }).join('');
    const fecha = aFecha(dia);
    columnas += `
      <div class="semana-columna">
        <div class="semana-cabecera ${dia === hoy() ? 'dia-hoy' : ''}">${DIAS_CORTOS[i]} ${fecha.getDate()}/${fecha.getMonth() + 1}</div>
        <div class="semana-cuerpo" style="height:${alto}px">${bloques}</div>
      </div>`;
  }

  return `
    <div class="calendario-semana">
      <div class="semana-horas">
        <div class="semana-cabecera"></div>
        <div class="semana-cuerpo" style="height:${alto}px">
          ${horas.map(h => `<span style="top:${(h - HORA_DESDE) * ALTO_HORA}px">${String(h).padStart(2, '0')}:00</span>`).join('')}
        </div>
      </div>
      <div class="semana-dias">${columnas}</div>
    </div>
    <p class="nota">Salas: ${salas.map(s => esc(s.nombre)).join(' · ')}. Los eventos simultáneos se muestran uno al lado del otro.</p>`;
}

export default async function vistaAgenda(contenedor, { parametros }) {
  let vista = parametros.vista === 'semana' ? 'semana' : 'mes';
  let referencia = /^\d{4}-\d{2}-\d{2}$/.test(parametros.fecha || '') ? parametros.fecha : hoy();
  let salaId = parametros.sala || '';
  // En celulares la vista semanal no entra: se propone la mensual (que se ve como lista)
  ponerMigas(['Agenda', 'agenda'], vista === 'semana' ? 'Vista semanal' : 'Vista mensual');

  const salas = await api.get('/salas').catch(() => almacen.leer('salas') || []);
  almacen.guardar('salas', salas);

  contenedor.innerHTML = `
    <div class="barra-herramientas">
      <div class="grupo-botones">
        <button class="boton boton-secundario boton-icono" data-mover="-1" aria-label="Período anterior">‹</button>
        <h1 class="titulo-periodo" id="titulo-periodo"></h1>
        <button class="boton boton-secundario boton-icono" data-mover="1" aria-label="Período siguiente">›</button>
        <button class="boton boton-secundario" data-hoy>Hoy</button>
      </div>
      <div class="grupo-botones">
        <div class="selector-vista" role="group" aria-label="Tipo de vista">
          <button class="boton" data-vista="mes">Mes</button>
          <button class="boton" data-vista="semana">Semana</button>
        </div>
        <select id="filtro-sala" aria-label="Filtrar por sala">
          <option value="">Todas las salas</option>
          ${salas.map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('')}
        </select>
        ${puede('ventas', 'administracion') ? '<a class="boton boton-primario" href="#/nueva-reserva">+ Nueva reserva</a>' : ''}
      </div>
    </div>
    <div class="leyenda">
      ${Object.values(ESTADOS).map(e => `<span><i class="muestra ${e.clase}"></i>${e.nombre}</span>`).join('')}
    </div>
    <div id="aviso-copia"></div>
    <div id="calendario"></div>`;

  const calendario = contenedor.querySelector('#calendario');
  const avisoCopia = contenedor.querySelector('#aviso-copia');
  contenedor.querySelector('#filtro-sala').value = salaId;

  async function cargar() {
    const { desde, hasta } = periodo(vista, referencia);
    reemplazarRuta(`agenda${query({ vista, fecha: referencia, sala: salaId })}`);
    ponerMigas(['Agenda', 'agenda'], vista === 'semana' ? 'Vista semanal' : 'Vista mensual');
    contenedor.querySelector('#titulo-periodo').textContent = tituloPeriodo(vista, referencia);
    contenedor.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('activo', b.dataset.vista === vista));
    avisoCopia.innerHTML = '';

    const claveCopia = `agenda:${desde}:${hasta}:${salaId}`;
    let reservas;
    try {
      reservas = await api.get(`/agenda${query({ desde, hasta, sala_id: salaId })}`);
      almacen.guardar(claveCopia, { reservas, guardado: new Date().toISOString() });
    } catch (error) {
      // E1: sin conexión, se muestra la copia local si existe, avisando que puede estar desactualizada
      const copia = error.sinConexion ? almacen.leer(claveCopia) : null;
      if (!copia) return panelError(calendario, error, cargar);
      reservas = copia.reservas;
      avisoCopia.innerHTML = `<div class="caja-mensaje caja-advertencia">Sin conexión. Se muestra la copia guardada el ${new Date(copia.guardado).toLocaleString('es-AR')}; los datos pueden no estar actualizados. <button class="boton boton-secundario" data-reintentar>Reintentar</button></div>`;
      avisoCopia.querySelector('[data-reintentar]').addEventListener('click', cargar);
    }

    const salasVisibles = salaId ? salas.filter(s => String(s.id) === String(salaId)) : salas;
    calendario.innerHTML = vista === 'semana' ? dibujarSemana(referencia, reservas, salasVisibles) : dibujarMes(referencia, reservas);

    // A3: período sin reservas -> mensaje explícito, no una pantalla en blanco
    if (reservas.length === 0) {
      calendario.insertAdjacentHTML('afterbegin', '<div class="caja-mensaje">No hay reservas en este período.</div>');
    }
  }

  contenedor.querySelectorAll('[data-mover]').forEach(boton => boton.addEventListener('click', () => {
    const paso = Number(boton.dataset.mover);
    if (vista === 'semana') {
      referencia = sumarDias(referencia, 7 * paso);
    } else {
      const fecha = aFecha(referencia);
      referencia = aTexto(new Date(fecha.getFullYear(), fecha.getMonth() + paso, 1));
    }
    cargar();
  }));
  contenedor.querySelector('[data-hoy]').addEventListener('click', () => { referencia = hoy(); cargar(); });
  contenedor.querySelectorAll('[data-vista]').forEach(boton => boton.addEventListener('click', () => {
    vista = boton.dataset.vista;
    cargar();
  }));
  contenedor.querySelector('#filtro-sala').addEventListener('change', (evento) => { salaId = evento.target.value; cargar(); });

  // Doble clic en un día vacío del mes: consultar disponibilidad para esa fecha
  calendario.addEventListener('dblclick', (evento) => {
    const dia = evento.target.closest('.dia');
    if (!dia || evento.target.closest('.evento') || dia.classList.contains('dia-fuera')) return;
    const numero = dia.querySelector('.dia-numero').textContent.padStart(2, '0');
    navegar(`disponibilidad?fecha=${referencia.slice(0, 8)}${numero}`);
  });

  await cargar();
}
