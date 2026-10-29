// Navegación entre pantallas (rutas con #) y migas de pan
import { esc } from './util.js';

export function navegar(destino) {
  window.location.hash = destino.startsWith('#') ? destino : `#/${destino}`;
}

// Actualiza la ruta sin volver a dibujar (por ejemplo, al cambiar de mes en la agenda)
export function reemplazarRuta(destino) {
  history.replaceState(null, '', `#/${destino}`);
}

// Recibe textos o pares [texto, ruta]: ponerMigas(['Agenda', 'agenda'], 'Nueva reserva')
export function ponerMigas(...partes) {
  document.getElementById('migas').innerHTML = partes.map((parte, indice) => {
    const [texto, enlace] = Array.isArray(parte) ? parte : [parte];
    const ultimo = indice === partes.length - 1;
    return enlace && !ultimo ? `<a href="#/${enlace}">${esc(texto)}</a>` : `<span>${esc(texto)}</span>`;
  }).join('<span class="migas-separador">›</span>');
}
