import conexion from '../conexion.bd.mjs';

// El Modelo se encarga exclusivamente de las consultas SQL a la base de datos (PostgreSQL).
const salaModelo = {
  // 1. Obtener todas las salas
  async obtenerTodas() {
    const consulta = 'SELECT * FROM salas ORDER BY id ASC';
    const resultado = await conexion.query(consulta);
    return resultado.rows;
  },

  // 2. Obtener una sala por ID
  async obtenerPorId(id) {
    const consulta = 'SELECT * FROM salas WHERE id = $1';
    const resultado = await conexion.query(consulta, [id]);
    return resultado.rows[0];
  },

  // 3. Crear una nueva sala (Alta)
  async crear(datos) {
    const consulta = `
      INSERT INTO salas (nombre, capacidad_ninos, capacidad_adultos, precio, descripcion, imagen, alt_imagen)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const parametros = [
      datos.nombre,
      datos.capacidad_ninos || 0,
      datos.capacidad_adultos || 0,
      datos.precio || 0.00,
      datos.descripcion || '',
      datos.imagen || '',
      datos.alt_imagen || ''
    ];
    const resultado = await conexion.query(consulta, parametros);
    return resultado.rows[0];
  },

  // 4. Actualizar una sala (Modificación)
  async actualizar(id, datos) {
    const consulta = `
      UPDATE salas
      SET nombre = $1,
          capacidad_ninos = $2,
          capacidad_adultos = $3,
          precio = $4,
          descripcion = $5,
          imagen = $6,
          alt_imagen = $7
      WHERE id = $8
      RETURNING *
    `;
    const parametros = [
      datos.nombre,
      datos.capacidad_ninos,
      datos.capacidad_adultos,
      datos.precio,
      datos.descripcion,
      datos.imagen,
      datos.alt_imagen,
      id
    ];
    const resultado = await conexion.query(consulta, parametros);
    return resultado.rows[0];
  },

  // 5. Eliminar una sala (Baja)
  async eliminar(id) {
    const consulta = 'DELETE FROM salas WHERE id = $1 RETURNING *';
    const resultado = await conexion.query(consulta, [id]);
    return resultado.rows[0];
  }
};

export default salaModelo;
