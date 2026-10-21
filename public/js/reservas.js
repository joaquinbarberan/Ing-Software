import { validarNombre, validarEmail } from './validacion.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formularioReserva');
    const nombreInput = document.getElementById('nombre');
    const emailInput = document.getElementById('email');

    nombreInput.addEventListener('blur', (e) => validarNombre(e.target));
    emailInput.addEventListener('blur', (e) => validarEmail(e.target));

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const esNombreValido = validarNombre(nombreInput);
        const esEmailValido = validarEmail(emailInput);

        if (esNombreValido && esEmailValido) {

            const datos = new FormData(form);
            fetch('reservas.html', {
                method: 'POST',
                body: datos
            });

            alert('¡Enviado! Tu reserva se realizo con exito.');
            form.reset();

        } else {
            alert('Por favor, revisá los campos en rojo.');
        }
    });
});