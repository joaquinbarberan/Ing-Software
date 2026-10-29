// Punto de entrada del sistema de gestión: verifica la sesión, arma el menú según el perfil
// y muestra la pantalla que corresponde a la ruta (#/agenda, #/reservas/12, etc.).
import { api } from './api.js';
import { sesion, puede, PERFILES, abrirModal, avisar, mostrarError, conBoton } from './util.js';
import { navegar, ponerMigas } from './navegacion.js';

import vistaAgenda from './vistas/agenda.js';
import vistaDisponibilidad from './vistas/disponibilidad.js';
import vistaNuevaReserva from './vistas/nueva-reserva.js';
import vistaReserva from './vistas/reserva.js';
import vistaClientes from './vistas/clientes.js';
import vistaEventoDia from './vistas/evento-dia.js';
import vistaCaja from './vistas/caja.js';
import vistaCoordinadores from './vistas/coordinadores.js';
import vistaInsumos from './vistas/insumos.js';
import vistaReportes from './vistas/reportes.js';
import vistaConfiguracion from './vistas/configuracion.js';

// Cada sección: ruta, texto del menú, módulo del informe y perfiles que la ven
const SECCIONES = [
  { ruta: 'agenda', texto: 'Agenda', modulo: 'M1', vista: vistaAgenda, perfiles: ['ventas', 'administracion', 'encargado'] },
  { ruta: 'disponibilidad', texto: 'Consultar disponibilidad', modulo: 'M1', vista: vistaDisponibilidad, perfiles: ['ventas', 'administracion', 'encargado'] },
  { ruta: 'nueva-reserva', texto: 'Nueva reserva', modulo: 'M1', vista: vistaNuevaReserva, perfiles: ['ventas', 'administracion'] },
  { ruta: 'clientes', texto: 'Clientes', modulo: 'M2', vista: vistaClientes, perfiles: ['ventas', 'administracion', 'encargado'] },
  { ruta: 'evento', texto: 'Evento del día', modulo: 'M3', vista: vistaEventoDia, perfiles: ['encargado', 'administracion'] },
  { ruta: 'coordinadores', texto: 'Coordinadores', modulo: 'M3', vista: vistaCoordinadores, perfiles: ['administracion'] },
  { ruta: 'insumos', texto: 'Insumos', modulo: 'M3', vista: vistaInsumos, perfiles: ['administracion'] },
  { ruta: 'caja', texto: 'Caja y cobros', modulo: 'M4', vista: vistaCaja, perfiles: ['ventas', 'encargado', 'administracion'] },
  { ruta: 'reportes', texto: 'Reportes', modulo: 'M4', vista: vistaReportes, perfiles: ['administracion'] },
  { ruta: 'configuracion', texto: 'Configuración', modulo: '', vista: vistaConfiguracion, perfiles: ['administracion'] }
];

// Rutas que no están en el menú pero se pueden abrir
const RUTAS_EXTRA = [
  { ruta: 'reservas', vista: vistaReserva, perfiles: ['ventas', 'administracion', 'encargado'] }
];

const contenedorVista = document.getElementById('vista');
const menu = document.getElementById('menu-lateral');

// Interpreta "#/reservas/12?x=1" -> { ruta: 'reservas', partes: ['12'], parametros: {x: '1'} }
function leerRuta() {
  const [camino, consulta = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const [ruta, ...partes] = camino.split('/').filter(Boolean);
  return { ruta: ruta || '', partes, parametros: Object.fromEntries(new URLSearchParams(consulta)) };
}

function paginaInicial() {
  return sesion.usuario.perfil === 'encargado' ? 'evento' : 'agenda';
}

function dibujarMenu() {
  const grupos = {};
  for (const seccion of SECCIONES.filter(s => puede(...s.perfiles))) {
    const grupo = { M1: 'Agenda y reservas', M2: 'Clientes', M3: 'Gestión de evento', M4: 'Caja y cobros', '': 'Sistema' }[seccion.modulo];
    (grupos[grupo] ||= []).push(seccion);
  }
  menu.innerHTML = Object.entries(grupos).map(([grupo, secciones]) => `
    <div class="menu-grupo">
      <p class="menu-titulo">${grupo}</p>
      ${secciones.map(s => `<a href="#/${s.ruta}" data-ruta="${s.ruta}">${s.texto}</a>`).join('')}
    </div>`).join('');
}

async function mostrarRuta() {
  const { ruta, partes, parametros } = leerRuta();
  if (!ruta) return navegar(paginaInicial());

  const seccion = [...SECCIONES, ...RUTAS_EXTRA].find(s => s.ruta === ruta);
  menu.querySelectorAll('a').forEach(enlace => {
    const activa = enlace.dataset.ruta === ruta || (ruta === 'reservas' && enlace.dataset.ruta === 'agenda');
    enlace.classList.toggle('activo', activa);
  });
  document.body.classList.remove('menu-abierto');
  // Al cambiar de pantalla se cierra cualquier ventana modal que haya quedado abierta
  document.querySelectorAll('.modal-fondo').forEach(modal => modal.remove());
  document.body.classList.remove('con-modal');

  if (!seccion) {
    ponerMigas('Página no encontrada');
    contenedorVista.innerHTML = '<div class="caja-mensaje"><p>Esa sección no existe.</p></div>';
    return;
  }
  if (!puede(...seccion.perfiles)) {
    ponerMigas('Acceso restringido');
    contenedorVista.innerHTML = '<div class="caja-mensaje caja-error"><p>Tu perfil no tiene acceso a esta sección.</p></div>';
    return;
  }

  contenedorVista.innerHTML = '<p class="cargando">Cargando...</p>';
  window.scrollTo(0, 0);
  try {
    await seccion.vista(contenedorVista, { partes, parametros });
  } catch (error) {
    console.error(error);
    mostrarError(error);
  }
}

// Cambio de la propia contraseña
function abrirCambioContrasena() {
  const { cuerpo, cerrar } = abrirModal({
    titulo: 'Cambiar contraseña',
    contenido: `
      <form class="formulario">
        <label class="campo"><span>Contraseña actual</span><input type="password" name="actual" autocomplete="current-password" required></label>
        <label class="campo"><span>Contraseña nueva (mínimo 8 caracteres)</span><input type="password" name="nueva" minlength="8" autocomplete="new-password" required></label>
        <div class="acciones">
          <button type="button" class="boton boton-secundario" data-cancelar>Cancelar</button>
          <button type="submit" class="boton boton-primario">Guardar</button>
        </div>
      </form>`
  });
  cuerpo.querySelector('[data-cancelar]').addEventListener('click', cerrar);
  const formulario = cuerpo.querySelector('form');
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
      await conBoton(formulario.querySelector('[type=submit]'), () => api.post('/usuarios/mi-contrasena', {
        actual: formulario.actual.value, nueva: formulario.nueva.value
      }));
      cerrar();
      avisar('Contraseña actualizada.');
    } catch (error) {
      mostrarError(error);
    }
  });
}

function configurarBarraSuperior() {
  const boton = document.getElementById('usuario-boton');
  const desplegable = document.getElementById('usuario-desplegable');
  document.getElementById('usuario-perfil').textContent = PERFILES[sesion.usuario.perfil] || sesion.usuario.perfil;
  document.getElementById('usuario-nombre').textContent = `${sesion.usuario.nombre || ''} (${sesion.usuario.nombre_usuario})`;

  boton.addEventListener('click', () => {
    desplegable.hidden = !desplegable.hidden;
    boton.setAttribute('aria-expanded', String(!desplegable.hidden));
  });
  document.addEventListener('click', (evento) => {
    if (!evento.target.closest('.usuario-menu')) desplegable.hidden = true;
  });
  desplegable.addEventListener('click', async (evento) => {
    const accion = evento.target.dataset.accion;
    if (accion === 'salir') {
      await api.post('/usuarios/logout').catch(() => {});
      window.location.href = './login.html';
    }
    if (accion === 'contrasena') {
      desplegable.hidden = true;
      abrirCambioContrasena();
    }
  });

  // Menú hamburguesa en celulares (RNF02)
  const botonMenu = document.getElementById('boton-menu');
  botonMenu.addEventListener('click', () => {
    const abierto = document.body.classList.toggle('menu-abierto');
    botonMenu.setAttribute('aria-expanded', String(abierto));
  });
}

async function iniciar() {
  try {
    const datos = await api.get('/usuarios/verificar');
    sesion.usuario = datos.usuario;
  } catch (error) {
    if (error.sinConexion) {
      contenedorVista.innerHTML = '<div class="caja-mensaje caja-error"><p>No hay conexión con el servidor.</p><button class="boton boton-secundario" onclick="location.reload()">Reintentar</button></div>';
      return;
    }
    window.location.href = './login.html';
    return;
  }

  // Tokens emitidos antes de los perfiles: se fuerza un nuevo login
  if (!sesion.usuario.perfil) {
    await api.post('/usuarios/logout').catch(() => {});
    window.location.href = './login.html';
    return;
  }

  configurarBarraSuperior();
  dibujarMenu();
  window.addEventListener('hashchange', mostrarRuta);
  mostrarRuta();
}

iniciar();
