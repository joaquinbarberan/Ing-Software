import salaModelo from '../modelos/salas.model.mjs';

// El Controlador recibe las peticiones, procesa los datos (incluyendo la subida de imágenes con Multer)
// e interactúa con el Modelo para guardar o recuperar información de la DB.
const salaControlador = {
  // 1. Obtener todas las salas (GET /api/v1/salas)
  async listarSalas(peticion, respuesta) {
    try {
      const salas = await salaModelo.obtenerTodas();
      respuesta.json(salas);
    } catch (error) {
      console.error('Error al listar salas:', error);
      respuesta.status(500).json({ error: 'Hubo un problema al obtener las salas.' });
    }
  },

  // 2. Obtener una sala por ID (GET /api/v1/salas/:id)
  async obtenerSala(peticion, respuesta) {
    try {
      const id = peticion.params.id;
      const sala = await salaModelo.obtenerPorId(id);

      if (!sala) {
        return respuesta.status(404).json({ error: 'La sala solicitada no existe.' });
      }

      respuesta.json(sala);
    } catch (error) {
      console.error('Error al obtener sala por ID:', error);
      respuesta.status(500).json({ error: 'Hubo un problema al obtener los datos de la sala.' });
    }
  },

  // 3. Crear una nueva sala (POST /api/v1/salas - ALTA con subida de archivo Multer)
  async crearSala(peticion, respuesta) {
    try {
      const cuerpo = peticion.body;
      const archivo = peticion.file;

      // Validación básica
      if (!cuerpo.nombre || cuerpo.nombre.trim() === '') {
        return respuesta.status(400).json({ error: 'El nombre de la sala es obligatorio.' });
      }

      // Procesamos el archivo subido por Multer si existe
      let rutaImagen = './recursos/imagenes/payasio.png'; // Imagen por defecto si no suben ninguna
      if (archivo) {
        // Guardamos la ruta virtual que utiliza el frontend para mostrarla
        rutaImagen = `./recursos/imagenes/${archivo.filename}`;
      }

      // Convertimos los campos que vienen del formulario (en form-data todo viene como texto)
      const datosSala = {
        nombre: cuerpo.nombre.trim(),
        capacidad_ninos: parseInt(cuerpo.capacidad_ninos) || 0,
        capacidad_adultos: parseInt(cuerpo.capacidad_adultos) || 0,
        precio: parseFloat(cuerpo.precio) || 0.00,
        descripcion: cuerpo.descripcion || '',
        imagen: rutaImagen,
        alt_imagen: cuerpo.alt_imagen || cuerpo.nombre
      };

      const nuevaSala = await salaModelo.crear(datosSala);
      respuesta.status(201).json(nuevaSala);
    } catch (error) {
      console.error('Error al crear sala:', error);
      respuesta.status(500).json({ error: 'Hubo un problema al crear la sala.' });
    }
  },

  // 4. Actualizar una sala (PUT /api/v1/salas/:id - MODIFICACIÓN con Multer opcional)
  async actualizarSala(peticion, respuesta) {
    try {
      const id = peticion.params.id;
      const cuerpo = peticion.body;
      const archivo = peticion.file;

      if (!cuerpo.nombre || cuerpo.nombre.trim() === '') {
        return respuesta.status(400).json({ error: 'El nombre de la sala es obligatorio.' });
      }

      // Si el cliente subió un nuevo archivo, usamos ese.
      // De lo contrario, mantenemos la imagen existente que envía el formulario.
      let rutaImagen = cuerpo.imagen_existente;
      if (archivo) {
        rutaImagen = `./recursos/imagenes/${archivo.filename}`;
      }

      const datosSala = {
        nombre: cuerpo.nombre.trim(),
        capacidad_ninos: parseInt(cuerpo.capacidad_ninos) || 0,
        capacidad_adultos: parseInt(cuerpo.capacidad_adultos) || 0,
        precio: parseFloat(cuerpo.precio) || 0.00,
        descripcion: cuerpo.descripcion || '',
        imagen: rutaImagen,
        alt_imagen: cuerpo.alt_imagen || cuerpo.nombre
      };

      const salaActualizada = await salaModelo.actualizar(id, datosSala);

      if (!salaActualizada) {
        return respuesta.status(404).json({ error: 'No se encontró la sala a actualizar.' });
      }

      respuesta.json(salaActualizada);
    } catch (error) {
      console.error('Error al actualizar sala:', error);
      respuesta.status(500).json({ error: 'Hubo un problema al actualizar la sala.' });
    }
  },

  // 5. Eliminar una sala (DELETE /api/v1/salas/:id - BAJA)
  async eliminarSala(peticion, respuesta) {
    try {
      const id = peticion.params.id;
      const salaEliminada = await salaModelo.eliminar(id);

      if (!salaEliminada) {
        return respuesta.status(404).json({ error: 'No se encontró la sala a eliminar.' });
      }

      respuesta.json({ mensaje: 'Sala eliminada correctamente', sala: salaEliminada });
    } catch (error) {
      console.error('Error al eliminar sala:', error);
      respuesta.status(500).json({ error: 'Hubo un problema al eliminar la sala.' });
    }
  }
};

export default salaControlador;
