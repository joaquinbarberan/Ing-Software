import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { nanoid } from 'nanoid';
import salaControlador from '../controladores/salas.controller.mjs';
import { permitir } from '../middleware/permisos.mjs';

const enrutador = express.Router();

// 1. CONFIGURACIÓN DEL ALMACENAMIENTO DE MULTER
// En la compu las imágenes se guardan en public/imagenes.
// En Vercel el disco es de sólo lectura, así que si está configurado Vercel Blob
// (variable BLOB_READ_WRITE_TOKEN) la imagen se sube ahí y se guarda su URL pública.
const usarBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// Nombre único: nanoid() evita colisiones y la extensión sale del tipo MIME (ej: image/png -> png).
// (La librería mime-type v5 ya no expone extension() sin su base de datos, por eso se resuelve acá.)
const EXTENSIONES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
function nombreUnico(archivo) {
  const extension = EXTENSIONES[archivo.mimetype] || archivo.mimetype.split('/')[1].replace(/[^a-z0-9]/gi, '');
  return `${nanoid()}.${extension}`;
}

const almacenamiento = usarBlob
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: function (peticion, archivo, callback) {
        // Las imágenes se guardan en la carpeta pública del servidor
        callback(null, path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/imagenes'));
      },
      filename: function (peticion, archivo, callback) {
        callback(null, nombreUnico(archivo));
      }
    });

// Inicializamos el middleware de Multer.
// Límite de 4 MB: Vercel no acepta peticiones de más de 4,5 MB.
const subirArchivo = multer({
  storage: almacenamiento,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (peticion, archivo, callback) => callback(null, archivo.mimetype.startsWith('image/'))
});

// Procesa un único archivo cuyo campo en el formulario sea "imagen".
// Con Vercel Blob, además lo sube y deja la URL en peticion.file.url para el controlador.
function cargarImagen(peticion, respuesta, siguiente) {
  subirArchivo.single('imagen')(peticion, respuesta, async (error) => {
    if (error || !usarBlob || !peticion.file) return siguiente(error);
    try {
      const { put } = await import('@vercel/blob');
      const subida = await put(`salas/${nombreUnico(peticion.file)}`, peticion.file.buffer, {
        access: 'public',
        contentType: peticion.file.mimetype
      });
      peticion.file.url = subida.url;
      siguiente();
    } catch (errorSubida) {
      console.error('Error al subir la imagen a Vercel Blob:', errorSubida);
      respuesta.status(502).json({ error: 'No se pudo subir la imagen. Intentá de nuevo.' });
    }
  });
}


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
