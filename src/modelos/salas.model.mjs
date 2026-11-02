import conexion from '../conexion.bd.mjs';

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

  // 3. Crear una nueva sala
  async crear(datos) {
    const precioLunes = datos.precio_lunes_jueves ?? datos.precio ?? 0;
    const precioViernes = datos.precio_viernes_domingo ?? datos.precio ?? 0;

    const consulta = `
      INSERT INTO salas (
        nombre,
        capacidad_ninos,
        capacidad_adultos,
        precio,
        precio_lunes_jueves,
        precio_viernes_domingo,
        descripcion,
        imagen,
        alt_imagen
      )
      VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const parametros = [
      datos.nombre,
      datos.capacidad_ninos || 0,
      datos.capacidad_adultos || 0,
      precioLunes,
      precioViernes,
      datos.descripcion || '',
      datos.imagen || '',
      datos.alt_imagen || ''
    ];

    const resultado = await conexion.query(consulta, parametros);
    return resultado.rows[0];
  },

  // 4. Actualizar una sala
  async actualizar(id, datos) {
    const precioLunes = datos.precio_lunes_jueves ?? datos.precio ?? 0;
    const precioViernes = datos.precio_viernes_domingo ?? datos.precio ?? 0;

    const consulta = `
      UPDATE salas
      SET nombre = $1,
          capacidad_ninos = $2,
          capacidad_adultos = $3,
          precio = $4,
          precio_lunes_jueves = $4,
          precio_viernes_domingo = $5,
          descripcion = $6,
          imagen = $7,
          alt_imagen = $8
      WHERE id = $9
      RETURNING *
    `;

    const parametros = [
      datos.nombre,
      datos.capacidad_ninos,
      datos.capacidad_adultos,
      precioLunes,
      precioViernes,
      datos.descripcion,
      datos.imagen,
      datos.alt_imagen,
      id
    ];

    const resultado = await conexion.query(consulta, parametros);
    return resultado.rows[0];
  },

  // 5. Eliminar una sala
  async eliminar(id) {
    const consulta = 'DELETE FROM salas WHERE id = $1 RETURNING *';
    const resultado = await conexion.query(consulta, [id]);
    return resultado.rows[0];
  }
};

export default salaModelo;