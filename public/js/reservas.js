import { validarNombre, validarEmail } from './validacion.js';

// Formulario público de reservas.
// El cliente no carga la reserva por su cuenta (queda fuera de la frontera del sistema, sección 10.3 del informe):
// acá ve si la franja está libre y se lo deriva por WhatsApp al área de Ventas, que es quien la registra.

const WHATSAPP_SALON = '5493513785678';
const DURACION_HORAS = 4;

function sumarHoras(hora, horas) {
  const [h, m] = hora.split(':').map(Number);
  return `${String(h + horas).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hoy() {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('formularioReserva');
    const nombreInput = document.getElementById('nombre');
    const emailInput = document.getElementById('email');
    const fechaInput = document.getElementById('fecha');
    const selectSala = document.getElementById('sala');
    const resultado = document.getElementById('resultado-disponibilidad');

    fechaInput.min = hoy();
    nombreInput.addEventListener('blur', (e) => validarNombre(e.target));
    emailInput.addEventListener('blur', (e) => validarEmail(e.target));

    // Cargamos las salas reales desde la base de datos
    try {
        const respuesta = await fetch('/salas');
        const salas = await respuesta.json();
        salas.forEach(sala => {
            const opcion = document.createElement('option');
            opcion.value = sala.id;
            opcion.textContent = sala.nombre.charAt(0) + sala.nombre.slice(1).toLowerCase();
            selectSala.appendChild(opcion);
        });
    } catch (error) {
        console.error('No se pudieron cargar las salas:', error);
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const esNombreValido = validarNombre(nombreInput);
        const esEmailValido = validarEmail(emailInput);
        const errorFecha = document.getElementById('error-fecha');
        errorFecha.textContent = fechaInput.value && fechaInput.value < hoy() ? 'La fecha ya pasó.' : '';

        if (!esNombreValido || !esEmailValido || errorFecha.textContent || !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const datos = Object.fromEntries(new FormData(form));
        const desde = datos.hora;
        const hasta = sumarHoras(desde, DURACION_HORAS);
        const nombreSala = selectSala.options[selectSala.selectedIndex].textContent;

        resultado.hidden = false;
        resultado.innerHTML = '<p>Consultando disponibilidad...</p>';

        try {
            const respuesta = await fetch(`/disponibilidad?fecha=${datos.fecha}&sala_id=${datos.sala}`);
            const disponibilidad = await respuesta.json();
            if (!respuesta.ok) throw new Error(disponibilidad.error);

            // Misma regla que usa el sistema: dos franjas se pisan si una empieza antes de que termine la otra
            const ocupada = disponibilidad.ocupadas.some(f => f.hora_inicio < hasta && f.hora_fin > desde);
            const mensaje = `Hola! Soy ${datos.nombre}. Quiero reservar la ${nombreSala} el ${datos.fecha.split('-').reverse().join('/')} de ${desde} a ${hasta}.` +
                ` Mi teléfono es ${datos.telefono} y mi correo ${datos.email}.${datos.comentarios ? ` ${datos.comentarios}` : ''}`;
            const enlace = `https://wa.me/${WHATSAPP_SALON}?text=${encodeURIComponent(mensaje)}`;

            const horariosOcupados = disponibilidad.ocupadas.length
                ? `<p>Horarios ya reservados ese día en la sala: ${disponibilidad.ocupadas.map(f => `${f.hora_inicio} a ${f.hora_fin}`).join(', ')}.</p>`
                : '';

            resultado.className = `resultado-publico ${ocupada ? 'ocupado' : 'libre'}`;
            resultado.innerHTML = ocupada
                ? `<h2>Ese horario no está disponible</h2>${horariosOcupados}<p>Probá con otro horario, otra sala u otra fecha.</p>`
                : `<h2>¡Está disponible!</h2>
                   <p>La ${escapar(nombreSala)} está libre de ${desde} a ${hasta}. Para confirmar la reserva escribinos por WhatsApp: te pasamos el presupuesto y los datos para la seña.</p>
                   ${horariosOcupados}
                   <a class="boton-whatsapp" href="${enlace}" target="_blank" rel="noopener">Enviar consulta por WhatsApp</a>
                   <p class="aclaracion">La fecha queda tomada recién cuando nuestro equipo registra la reserva.</p>`;
        } catch (error) {
            resultado.className = 'resultado-publico ocupado';
            resultado.innerHTML = `<p>No pudimos consultar la disponibilidad${error.message ? `: ${escapar(error.message)}` : ''}. Probá de nuevo en unos minutos.</p>`;
        }
    });
});
