import express from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import mime from 'mime-type';
import salaControlador from '../controladores/salas.controller.mjs';

const enrutador = express.Router();

// 1. CONFIGURACIÓN DEL ALMACENAMIENTO DE MULTER
// Configura dónde y con qué nombre guardar las imágenes subidas en el servidor.
const almacenamiento = multer.diskStorage({
  destination: function (peticion, archivo, callback) {
    // Las imágenes se guardan en la carpeta pública del servidor
    callback(null, './public/imagenes');
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
// Todas estas rutas asumen la base "/api/v1/salas" montada en app.mjs

// Obtener todas las salas (LECTURA 1)
enrutador.get('/', salaControlador.listarSalas);

// Obtener una sala por ID (LECTURA 2)
enrutador.get('/:id', salaControlador.obtenerSala);

// Crear una sala (ALTA - requiere procesar la subida de la imagen)
enrutador.post('/', cargarImagen, salaControlador.crearSala);

// Modificar una sala (MODIFICACIÓN - la subida de imagen es opcional)
enrutador.put('/:id', cargarImagen, salaControlador.actualizarSala);

// Eliminar una sala (BAJA)
enrutador.delete('/:id', salaControlador.eliminarSala);

export default enrutador;
