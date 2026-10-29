import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { nanoid } from 'nanoid';
import mime from 'mime-type';
import salaControlador from '../controladores/salas.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

const enrutador = express.Router();

// 1. CONFIGURACIÓN DEL ALMACENAMIENTO DE MULTER
// Configura dónde y con qué nombre guardar las imágenes subidas en el servidor.
const almacenamiento = multer.diskStorage({
  destination: function (peticion, archivo, callback) {
    // Las imágenes se guardan en la carpeta pública del servidor
    callback(null, path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/imagenes'));
  },
  filename: function (peticion, archivo, callback) {
    // Obtenemos la extensión del archivo a partir de su tipo MIME (ej: image/png -> png)
    const extension = mime.extension(archivo.mimetype);
    // Generamos un identificador único usando nanoid() para evitar colisiones de nombres
    const nombreImagen = `${nanoid()}.${extension}`;
    callback(null, nombreImagen);
  }
});

// Inicializamos el middleware de Multer
const subirArchivo = multer({
  storage: almacenamiento
});

// Middleware para procesar un único archivo cuyo campo en el formulario sea "imagen"
const cargarImagen = subirArchivo.single('imagen');


// 2. DEFINICIÓN DE RUTAS DEL CRUD
// Leer es libre para cualquier usuario logueado; modificar salas es tarea de Administración y Gerencia.
// Todas estas rutas asumen la base "/api/v1/salas" montada en app.mjs

// Obtener todas las salas (LECTURA 1)
enrutador.get('/', salaControlador.listarSalas);

// Obtener una sala por ID (LECTURA 2)
enrutador.get('/:id', salaControlador.obtenerSala);

// Crear una sala (ALTA - requiere procesar la subida de la imagen)
enrutador.post('/', permitir('administracion'), cargarImagen, salaControlador.crearSala);

// Modificar una sala (MODIFICACIÓN - la subida de imagen es opcional)
enrutador.put('/:id', permitir('administracion'), cargarImagen, salaControlador.actualizarSala);

// Eliminar una sala (BAJA)
enrutador.delete('/:id', permitir('administracion'), salaControlador.eliminarSala);

export default enrutador;
