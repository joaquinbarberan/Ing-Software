import { renderizarSalas } from './modulos.js';

document.addEventListener('DOMContentLoaded', () => {
    const salasGrid = document.getElementById('contenedor-salas-dinamico');

    const cargarSalas = async () => {
        try {
            const response = await fetch('/salas');

            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }

            const datosSalas = await response.json();

            renderizarSalas(datosSalas, salasGrid);

        } catch (error) {
            console.error('Error al cargar o parsear el JSON de salas:', error);
            salasGrid.innerHTML = '<p style="text-align:center; color:red;">⚠️ Error cargando salas.</p>';
        }
    };

    cargarSalas();
});