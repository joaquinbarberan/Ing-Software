// recursos/js/modulos.js

// Esta función se encarga de recibir el array de salas del backend y construir
// el código HTML necesario para mostrarlas en la sección pública "salas.html".
// Cada sala se muestra como una ficha con foto, descripción, capacidad y un botón para reservar.

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

function nombreSala(nombre) {
    return String(nombre || 'Sala').toLowerCase()
        .replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

function pesos(monto) {
    return '$' + Number(monto || 0).toLocaleString('es-AR', {
        maximumFractionDigits: 0
    });
}

export const renderizarSalas = (listaSalas, contenedor) => {
    if (!listaSalas.length) {
        contenedor.innerHTML =
            '<p class="inicio-nota">Pronto vas a ver acá nuestras salas.</p>';
        return;
    }

    const htmlSalas = listaSalas.map(sala => {
        const nombre = nombreSala(sala.nombre);
        const imagen = sala.imagen || './recursos/imagenes/fachada.jpg';

        const capNinos = Number(sala.capacidad_ninos) || 0;
        const capAdultos = Number(sala.capacidad_adultos) || 0;

        const precioSemana = pesos(sala.precio_lunes_jueves);
        const precioFinSemana = pesos(sala.precio_viernes_domingo);

        const descripcion = (sala.descripcion || '')
            .replace('[N]', capNinos)
            .replace('[A]', capAdultos);

        return `
            <article class="sala-detalle" id="sala-${sala.id}">

                <div class="sala-detalle-foto">
                    <img
                        src="${escapar(imagen)}"
                        alt="${escapar(sala.alt_imagen || nombre)}"
                        loading="lazy"
                        onerror="this.src='./recursos/imagenes/fachada.jpg'">
                </div>

                <div class="sala-detalle-texto">

                    <h2>${escapar(nombre)}</h2>

                    ${descripcion
                        ? `<p>${escapar(descripcion)}</p>`
                        : ''}

                    <ul class="sala-capacidad">
                        <li>${capNinos} <span>niños</span></li>
                        <li>${capAdultos} <span>adultos</span></li>
                        <li>${capNinos + capAdultos} <span>invitados en total</span></li>
                    </ul>

                    <div class="sala-precios">
                        <h3>Precios de la sala</h3>

                        <div>
                            <span>Lunes a jueves</span>
                            <strong>${precioSemana}</strong>
                        </div>

                        <div>
                            <span>Viernes a domingo</span>
                            <strong>${precioFinSemana}</strong>
                        </div>
                    </div>

                    <div>
                        <a
                            class="sitio-boton sitio-boton-rojo"
                            href="./reservas.html">
                            Ver fechas para esta sala
                        </a>
                    </div>

                </div>
            </article>
        `;
    }).join('');

    contenedor.innerHTML = htmlSalas;

    if (location.hash) {
        document.querySelector(location.hash)?.scrollIntoView();
    }
};
