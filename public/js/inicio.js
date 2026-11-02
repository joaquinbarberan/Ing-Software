// Portada: muestra las salas y los paquetes con los datos reales del sistema.

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

function pesos(monto) {
    return '$' + Number(monto || 0).toLocaleString('es-AR', {
        maximumFractionDigits: 0
    });
}

function nombreSala(nombre) {
    return String(nombre || 'Sala').toLowerCase()
        .replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

async function cargarSalas() {
    const contenedor = document.getElementById('inicio-salas');

    if (!contenedor) return;

    try {
        const respuesta = await fetch('/salas');

        if (!respuesta.ok) {
            throw new Error('Error al obtener las salas');
        }

        const salas = await respuesta.json();

        contenedor.innerHTML = salas.slice(0, 4).map(sala => `
            <a class="tarjeta-sala" href="./salas.html#sala-${sala.id}">

                <img
                    src="${escapar(sala.imagen || './recursos/imagenes/fachada.jpg')}"
                    alt="${escapar(sala.alt_imagen || sala.nombre)}"
                    loading="lazy"
                    onerror="this.src='./recursos/imagenes/fachada.jpg'">

                <div>
                    <h3>${escapar(nombreSala(sala.nombre))}</h3>

                    <p>
                        Hasta ${Number(sala.capacidad_ninos) +
                        Number(sala.capacidad_adultos)} invitados
                    </p>

                    <p class="precio-sala-inicio">
                        Lunes a jueves:
                        <strong>${pesos(sala.precio_lunes_jueves)}</strong>
                    </p>

                    <p class="precio-sala-inicio">
                        Viernes a domingo:
                        <strong>${pesos(sala.precio_viernes_domingo)}</strong>
                    </p>
                </div>

            </a>
        `).join('');

    } catch (error) {
        console.error('Error cargando salas:', error);

        contenedor.innerHTML = `
            <p class="inicio-nota">
                No pudimos cargar las salas.
                <a href="./salas.html">Ver todas las salas</a>.
            </p>
        `;
    }
}

const paginaCargada = new Promise(resolver => {
    if (document.readyState === 'complete') {
        resolver();
    } else {
        window.addEventListener('load', resolver, { once: true });
    }
});

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