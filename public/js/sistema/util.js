// Utilidades compartidas por todas las pantallas del sistema de gestión

// --- Estados de la reserva (Figura 6) ---
export const ESTADOS = {
  presenada: { nombre: 'Preseñada', clase: 'estado-presenada' },
  confirmada: { nombre: 'Confirmada', clase: 'estado-confirmada' },
  en_curso: { nombre: 'En curso', clase: 'estado-en-curso' },
  realizada: { nombre: 'Realizada', clase: 'estado-realizada' },
  cancelada: { nombre: 'Cancelada', clase: 'estado-cancelada' },
  expirada: { nombre: 'Expirada', clase: 'estado-expirada' }
};

export const PERFILES = {
  gerencia: 'Gerencia',
  ventas: 'Encargado de Ventas',
  administracion: 'Administración',
  encargado: 'Encargado de Salón'
};

export const MEDIOS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  tarjeta: 'Tarjeta'
};

export const TIPOS_PAGO = { sena: 'Seña', parcial: 'Pago parcial', saldo: 'Saldo', ajuste: 'Ajuste' };

// --- Sesión actual (la completa app.js al iniciar) ---
export const sesion = { usuario: null };

// Gerencia puede todo; el resto según su perfil
export function puede(...perfiles) {
  const perfil = sesion.usuario?.perfil;
  return perfil === 'gerencia' || perfiles.includes(perfil);
}

// --- Formatos ---
// Escapa texto antes de meterlo en innerHTML (evita inyección de HTML con datos de clientes)
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function pesos(monto) {
  return '$ ' + Number(monto || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function nombreMes(indice) {
  return MESES[indice];
}

// 'AAAA-MM-DD' -> Date local (sin corrimiento de zona horaria)
export function aFecha(texto) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

// Date -> 'AAAA-MM-DD'
export function aTexto(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

export function hoy() {
  return aTexto(new Date());
}

export function sumarDias(texto, dias) {
  const fecha = aFecha(texto);
  fecha.setDate(fecha.getDate() + dias);
  return aTexto(fecha);
}

// '2026-11-15' -> 'sábado 15 de noviembre de 2026'
export function fechaLarga(texto) {
  const fecha = aFecha(texto);
  return `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
}

// '2026-11-15' -> '15/11/2026'
export function fechaCorta(texto) {
  if (!texto) return '';
  const [anio, mes, dia] = String(texto).slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

export function fechaHora(marca) {
  if (!marca) return '';
  const fecha = new Date(marca);
  return fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function etiquetaEstado(estado) {
  const datos = ESTADOS[estado] || { nombre: estado, clase: '' };
  return `<span class="etiqueta ${datos.clase}">${datos.nombre}</span>`;
}

// --- Componentes de interfaz ---

// Muestra un aviso breve abajo a la derecha
export function avisar(mensaje, tipo = 'exito') {
  const aviso = document.createElement('div');
  aviso.className = `aviso aviso-${tipo}`;
  aviso.setAttribute('role', 'status');
  aviso.textContent = mensaje;
  document.getElementById('avisos').appendChild(aviso);
  setTimeout(() => aviso.classList.add('saliendo'), 4200);
  setTimeout(() => aviso.remove(), 4700);
}

// Muestra el error de una operación. Si es de conexión, ofrece reintentar.
export function mostrarError(error, reintentar) {
  if (error?.estado === 401) return;
  if (error?.sinConexion && reintentar) {
    avisar(error.message, 'error');
    return;
  }
  avisar(error?.message || 'Ocurrió un error inesperado.', 'error');
}

// Panel de error dentro de una pantalla, con botón para reintentar
export function panelError(contenedor, error, reintentar) {
  contenedor.innerHTML = `
    <div class="caja-mensaje caja-error">
      <strong>${error?.sinConexion ? 'Sin conexión con el servidor' : 'No se pudo cargar la información'}</strong>
      <p>${esc(error?.message)}</p>
      ${reintentar ? '<button class="boton boton-secundario" data-reintentar>Reintentar</button>' : ''}
    </div>`;
  contenedor.querySelector('[data-reintentar]')?.addEventListener('click', reintentar);
}

// Ventana modal. "contenido" es HTML; devuelve el elemento del cuerpo y una función para cerrarla.
export function abrirModal({ titulo, contenido, ancho = '' }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal-caja ${ancho}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-titulo">
        <h2>${esc(titulo)}</h2>
        <button class="modal-cerrar" aria-label="Cerrar">&times;</button>
      </div>
      <div class="modal-cuerpo">${contenido}</div>
    </div>`;
  document.body.appendChild(fondo);
  document.body.classList.add('con-modal');

  const cerrar = () => {
    fondo.remove();
    if (!document.querySelector('.modal-fondo')) document.body.classList.remove('con-modal');
    document.removeEventListener('keydown', alPresionar);
  };
  const alPresionar = (evento) => { if (evento.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', alPresionar);
  fondo.querySelector('.modal-cerrar').addEventListener('click', cerrar);
  fondo.addEventListener('mousedown', (evento) => { if (evento.target === fondo) cerrar(); });

  const cuerpo = fondo.querySelector('.modal-cuerpo');
  cuerpo.querySelector('input, select, textarea')?.focus();
  return { cuerpo, cerrar };
}

// Confirmación explícita (R03.7). Opcionalmente pide un motivo obligatorio.
export function confirmar({ titulo, mensaje, textoBoton = 'Confirmar', peligro = false, pedirMotivo = false, etiquetaMotivo = 'Motivo' }) {
  return new Promise((resolver) => {
    const { cuerpo, cerrar } = abrirModal({
      titulo,
      contenido: `
        <p>${mensaje}</p>
        ${pedirMotivo ? `
          <label class="campo">
            <span>${esc(etiquetaMotivo)} <em>(obligatorio)</em></span>
            <textarea name="motivo" rows="3" required></textarea>
          </label>
          <p class="error-campo" hidden>Ingresá el motivo para continuar.</p>` : ''}
        <div class="acciones">
          <button class="boton boton-secundario" data-no>Volver</button>
          <button class="boton ${peligro ? 'boton-peligro' : 'boton-primario'}" data-si>${esc(textoBoton)}</button>
        </div>`
    });
    let respondido = false;
    const responder = (valor) => { respondido = true; cerrar(); resolver(valor); };
    cuerpo.querySelector('[data-no]').addEventListener('click', () => responder(null));
    cuerpo.querySelector('[data-si]').addEventListener('click', () => {
      if (!pedirMotivo) return responder(true);
      const motivo = cuerpo.querySelector('[name=motivo]').value.trim();
      if (!motivo) {
        cuerpo.querySelector('.error-campo').hidden = false;
        return;
      }
      responder(motivo);
    });
    // Si se cierra con la X o Escape, se toma como "no"
    const observador = new MutationObserver(() => {
      if (!document.body.contains(cuerpo)) { observador.disconnect(); if (!respondido) resolver(null); }
    });
    observador.observe(document.body, { childList: true });
  });
}

// Deshabilita un botón mientras dura una operación asíncrona
export async function conBoton(boton, tarea) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando...';
  try {
    return await tarea();
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

// Lee un formulario como objeto plano
export function datosFormulario(formulario) {
  return Object.fromEntries(new FormData(formulario).entries());
}

// localStorage puede no estar disponible (modo privado): siempre envuelto en try/catch
export const almacen = {
  leer(clave) {
    try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; }
  },
  guardar(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento local */ }
  },
  borrar(clave) {
    try { localStorage.removeItem(clave); } catch { /* sin almacenamiento local */ }
  }
};

// Enlace de WhatsApp con mensaje (para avisar a coordinadores o clientes)
export function enlaceWhatsapp(telefono, mensaje) {
  let numero = String(telefono || '').replace(/\D/g, '');
  if (numero && !numero.startsWith('54')) numero = `549${numero}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
