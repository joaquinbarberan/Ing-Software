// recursos/js/modulos.js

// Esta función se encarga de recibir el array de salas del backend y construir
// el código HTML necesario para mostrarlas en la sección pública "salas.html".
export const renderizarSalas = (listaSalas, contenedor) => {
    const htmlSalas = listaSalas.map(sala => {
        
        // 1. Mapeamos las variables de forma sencilla y legible.
        // Damos soporte tanto a los campos de la base de datos como a los campos MockAPI anteriores por si acaso.
        const nombre = sala.nombre || sala['company-name'] || "Sala sin nombre";
        const imagen = sala.imagen || sala.img || "./recursos/imagenes/payasio.png";
        const altTexto = sala.alt_imagen || nombre;
        
        const capNinos = sala.capacidad_ninos !== undefined ? sala.capacidad_ninos : (sala.capacidad || 0);
        const capAdultos = sala.capacidad_adultos || 0;
        const precio = sala.precio || 0;
        
        // 2. Reemplazamos dinámicamente los marcadores de capacidad en la descripción
        let descripcionFiltrada = sala.descripcion || "Esta sala no posee descripción aún.";
        descripcionFiltrada = descripcionFiltrada
            .replace('[N]', capNinos)
            .replace('[A]', capAdultos);

        // 3. Devolvemos el HTML con la estructura requerida, incluyendo el precio formateado
        return `
            <article class="sala">
                <h2>${nombre}</h2>
                <p>${descripcionFiltrada}</p>
                <p style="text-align: center; font-weight: bold; color: #d92332; margin-top: -10px; font-size: 1.1em;">
                    Precio del Evento: $${parseFloat(precio).toLocaleString('es-AR')}
                </p>
                <img src="${imagen}" alt="${altTexto}" class="sala-imagen" onerror="this.src='./recursos/imagenes/payasio.png'">
            </article>
        `;
    }).join('');

    // Insertamos todo el HTML generado en el contenedor dinámico
    contenedor.innerHTML = htmlSalas;
};