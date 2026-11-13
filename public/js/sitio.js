// Comportamiento común del sitio público: menú en celulares y año del pie.
document.addEventListener('DOMContentLoaded', () => {
  const encabezado = document.querySelector('.sitio-encabezado');
  const boton = document.querySelector('.sitio-hamburguesa');

  if (encabezado && boton) {
    boton.addEventListener('click', () => {
      const abierto = encabezado.classList.toggle('menu-abierto');
      boton.setAttribute('aria-expanded', String(abierto));
    });
    // Tocar fuera del menú abierto también lo cierra
    document.addEventListener('click', (evento) => {
      if (encabezado.classList.contains('menu-abierto') && !encabezado.contains(evento.target)) {
        encabezado.classList.remove('menu-abierto');
        boton.setAttribute('aria-expanded', 'false');
      }
    });
    // Al tocar un enlace del menú (incluidos los anclas de la misma página) se cierra
    encabezado.querySelectorAll('.sitio-menu a').forEach(enlace => enlace.addEventListener('click', () => {
      encabezado.classList.remove('menu-abierto');
      boton.setAttribute('aria-expanded', 'false');
    }));
  }

  document.querySelectorAll('[data-anio]').forEach(elemento => { elemento.textContent = new Date().getFullYear(); });

  avisoDePago();
});

// Cuando el cliente vuelve de Mercado Pago (?pago=aprobado|pendiente|rechazado) se le muestra el resultado
function avisoDePago() {
  const textos = {
    aprobado: ['¡Recibimos tu pago!', 'La seña quedó registrada y tu reserva está confirmada. Te esperamos.'],
    pendiente: ['Tu pago está en proceso', 'Cuando Mercado Pago lo apruebe, la reserva se confirma sola.'],
    rechazado: ['El pago no se completó', 'Podés volver a intentarlo desde el mismo link o escribirnos por WhatsApp.']
  };
  const estado = new URLSearchParams(location.search).get('pago');
  if (!textos[estado]) return;
  const aviso = document.createElement('div');
  aviso.className = `sitio-aviso-pago sitio-aviso-pago--${estado}`;
  aviso.setAttribute('role', 'status');
  const [titulo, detalle] = textos[estado];
  aviso.innerHTML = `<strong></strong><span></span><button type="button" aria-label="Cerrar">×</button>`;
  aviso.querySelector('strong').textContent = titulo;
  aviso.querySelector('span').textContent = detalle;
  aviso.querySelector('button').addEventListener('click', () => aviso.remove());
  document.body.appendChild(aviso);
  // Se limpia la dirección para que el aviso no vuelva a salir al recargar
  history.replaceState(null, '', location.pathname + location.hash);
}
