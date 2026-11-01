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
});
