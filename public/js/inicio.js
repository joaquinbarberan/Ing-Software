// Portada: muestra las salas y los paquetes con los datos reales del sistema.
function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function pesos(monto) {
  return '$ ' + Number(monto || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

// "SALA AMARILLA" -> "Sala Amarilla"
function nombreSala(nombre) {
  return nombre.toLowerCase().replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

async function cargarSalas() {
  const contenedor = document.getElementById('inicio-salas');
  try {
    const respuesta = await fetch('/salas');
    if (!respuesta.ok) throw new Error();
    const salas = await respuesta.json();
    contenedor.innerHTML = salas.slice(0, 4).map(sala => `
      <a class="tarjeta-sala" href="./salas.html#sala-${sala.id}">
        <img src="${escapar(sala.imagen || './recursos/imagenes/fachada.jpg')}" alt="${escapar(sala.alt_imagen || sala.nombre)}" loading="lazy"
             onerror="this.src='./recursos/imagenes/fachada.jpg'">
        <div>
          <h3>${escapar(nombreSala(sala.nombre))}</h3>
          <p>Hasta ${sala.capacidad_ninos + sala.capacidad_adultos} invitados</p>
        </div>
      </a>`).join('');
  } catch {
    contenedor.innerHTML = '<p class="inicio-nota">No pudimos cargar las salas. <a href="./salas.html">Verlas en la página de salas</a>.</p>';
  }
}


// Si se entró con un ancla (#paquetes, #contacto...), se vuelve a ubicar la sección
// cuando terminan de cargar las salas y los paquetes, que cambian el alto de la página.
// Esperamos a que se carguen las salas y la página.
const paginaCargada = new Promise(resolver => (
  document.readyState === 'complete'
    ? resolver()
    : addEventListener('load', resolver)
));

Promise.all([
  cargarSalas(),
  paginaCargada,
  document.fonts?.ready
]).then(() => {
  if (location.hash) {
    document.querySelector(location.hash)?.scrollIntoView({
      behavior: 'instant'
    });
  }
});