import salaModelo from '../modelos/salas.model.mjs';

// Valida los dos precios recibidos desde el formulario
function obtenerPrecios(cuerpo) {
  const lunes = String(cuerpo.precio_lunes_jueves ?? '').trim();
  const viernes = String(cuerpo.precio_viernes_domingo ?? '').trim();

  if (lunes === '' || viernes === '') return null;

  const precioLunes = Number(lunes);
  const precioViernes = Number(viernes);

  if (
    !Number.isFinite(precioLunes) ||
    !Number.isFinite(precioViernes) ||
    precioLunes < 0 ||
    precioViernes < 0
  ) {
    return null;
  }

  return {
    precio_lunes_jueves: precioLunes,
    precio_viernes_domingo: precioViernes
  };
}

const salaControlador = {

  // 1. Listar salas
  async listarSalas(peticion, respuesta) {
    try {
      const salas = await salaModelo.obtenerTodas();
      respuesta.json(salas);
    } catch (error) {
      console.error('Error al listar salas:', error);
      respuesta.status(500).json({
        error: 'Hubo un problema al obtener las salas.'
      });
    }
  },

  // 2. Obtener una sala
  async obtenerSala(peticion, respuesta) {
    try {
      const sala = await salaModelo.obtenerPorId(peticion.params.id);

      if (!sala) {
        return respuesta.status(404).json({
          error: 'La sala solicitada no existe.'
        });
      }

      respuesta.json(sala);
    } catch (error) {
      console.error('Error al obtener sala:', error);
      respuesta.status(500).json({
        error: 'Hubo un problema al obtener los datos de la sala.'
      });
    }
  },

  // 3. Crear una sala
  async crearSala(peticion, respuesta) {
    try {
      const cuerpo = peticion.body;
      const archivo = peticion.file;

      if (!cuerpo.nombre || cuerpo.nombre.trim() === '') {
        return respuesta.status(400).json({
          error: 'El nombre de la sala es obligatorio.'
        });
      }

      const precios = obtenerPrecios(cuerpo);

      if (!precios) {
        return respuesta.status(400).json({
          error: 'Ingresá correctamente los dos precios de la sala.'
        });
      }

      let rutaImagen = './recursos/imagenes/payasio.png';

      if (archivo) {
        rutaImagen = archivo.url ||
          `./recursos/imagenes/${archivo.filename}`;
      }

      const datosSala = {
        nombre: cuerpo.nombre.trim(),
        capacidad_ninos: parseInt(cuerpo.capacidad_ninos, 10) || 0,
        capacidad_adultos: parseInt(cuerpo.capacidad_adultos, 10) || 0,
        ...precios,
        descripcion: cuerpo.descripcion || '',
        imagen: rutaImagen,
        alt_imagen: cuerpo.alt_imagen || cuerpo.nombre
      };

      const nuevaSala = await salaModelo.crear(datosSala);

      respuesta.status(201).json(nuevaSala);

    } catch (error) {
      console.error('Error al crear sala:', error);
      respuesta.status(500).json({
        error: 'Hubo un problema al crear la sala.'
      });
    }
  },

  // 4. Actualizar una sala
  async actualizarSala(peticion, respuesta) {
    try {
      const id = peticion.params.id;
      const cuerpo = peticion.body;
      const archivo = peticion.file;

      if (!cuerpo.nombre || cuerpo.nombre.trim() === '') {
        return respuesta.status(400).json({
          error: 'El nombre de la sala es obligatorio.'
        });
      }

      const precios = obtenerPrecios(cuerpo);

      if (!precios) {
        return respuesta.status(400).json({
          error: 'Ingresá correctamente los dos precios de la sala.'
        });
      }

      let rutaImagen = cuerpo.imagen_existente;

      if (archivo) {
        rutaImagen = archivo.url ||
          `./recursos/imagenes/${archivo.filename}`;
      }

      const datosSala = {
        nombre: cuerpo.nombre.trim(),
        capacidad_ninos: parseInt(cuerpo.capacidad_ninos, 10) || 0,
        capacidad_adultos: parseInt(cuerpo.capacidad_adultos, 10) || 0,
        ...precios,
        descripcion: cuerpo.descripcion || '',
        imagen: rutaImagen,
        alt_imagen: cuerpo.alt_imagen || cuerpo.nombre
      };

      const salaActualizada = await salaModelo.actualizar(id, datosSala);

      if (!salaActualizada) {
        return respuesta.status(404).json({
          error: 'No se encontró la sala a actualizar.'
        });
      }

      respuesta.json(salaActualizada);

    } catch (error) {
      console.error('Error al actualizar sala:', error);
      respuesta.status(500).json({
        error: 'Hubo un problema al actualizar la sala.'
      });
    }
  },

  // 5. Eliminar una sala
  async eliminarSala(peticion, respuesta) {
    try {
      const salaEliminada = await salaModelo.eliminar(peticion.params.id);

      if (!salaEliminada) {
        return respuesta.status(404).json({
          error: 'No se encontró la sala a eliminar.'
        });
      }

      respuesta.json({
        mensaje: 'Sala eliminada correctamente',
        sala: salaEliminada
      });

    } catch (error) {
      if (error.code === '23503') {
        return respuesta.status(409).json({
          error: 'La sala tiene reservas registradas y no se puede eliminar.'
        });
      }

      console.error('Error al eliminar sala:', error);
      respuesta.status(500).json({
        error: 'Hubo un problema al eliminar la sala.'
      });
    }
  }
};

export default salaControlador;
