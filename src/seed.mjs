import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import conexion from './conexion.bd.mjs'; // Importamos la conexion desde la nueva ruta

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta relativa a datos_salas.json
const rutaJSON = path.join(__dirname, '../recursos/datos_salas.json');

async function sembrarBaseDeDatos() {
  try {
    console.log('--- Iniciando Sembrado de Base de Datos ---');

    // SQL para crear la tabla de salas
    const consultaCrearTabla = `
      CREATE TABLE IF NOT EXISTS salas (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        capacidad_ninos INT NOT NULL DEFAULT 0,
        capacidad_adultos INT NOT NULL DEFAULT 0,
        precio DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        descripcion TEXT,
        imagen VARCHAR(255),
        alt_imagen VARCHAR(255)
      );
    `;

    console.log('Creando tabla "salas" si no existe...');
    await conexion.query(consultaCrearTabla);
    console.log('Tabla creada o ya existente con éxito.');

    // Validamos si ya existen registros para evitar duplicados
    const resultadoCheck = await conexion.query('SELECT COUNT(*) FROM salas');
    const cantidadRegistros = parseInt(resultadoCheck.rows[0].count);

    if (cantidadRegistros > 0) {
      console.log(`La tabla ya contiene ${cantidadRegistros} salas. No se insertarán duplicados.`);
      return;
    }

    // Leemos el archivo JSON
    console.log('Leyendo datos iniciales desde datos_salas.json...');
    const contenidoJSON = fs.readFileSync(rutaJSON, 'utf-8');
    const salasIniciales = JSON.parse(contenidoJSON);

    console.log('Insertando salas iniciales...');
    for (const sala of salasIniciales) {
      const nombre = sala.nombre;
      const capacidadNinos = sala.capacidad_ninos;
      const capacidadAdultos = sala.capacidad_adultos;
      const precioDefecto = 15000.00;
      const descripcion = sala.descripcion;
      const imagen = sala.imagen;
      const altImagen = sala.alt_imagen;

      const consultaInsertar = `
        INSERT INTO salas (nombre, capacidad_ninos, capacidad_adultos, precio, descripcion, imagen, alt_imagen)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await conexion.query(consultaInsertar, [
        nombre,
        capacidadNinos,
        capacidadAdultos,
        precioDefecto,
        descripcion,
        imagen,
        altImagen
      ]);
      console.log(`Sala insertada: ${nombre}`);
    }

    console.log('¡Sembrado completado con éxito!');
  } catch (error) {
    console.error('Error durante el sembrado de la base de datos:');
    console.error(error.message);
  } finally {
    // Cerramos la conexión
    await conexion.end();
    console.log('--- Conexión con la Base de Datos Cerrada ---');
  }
}

sembrarBaseDeDatos();
