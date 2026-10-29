import conexion from '../conexion.bd.mjs';

// Modelo de Clientes (módulo M2)
const clienteModelo = {

  // Lista con búsqueda libre por nombre, apellido, DNI, teléfono o correo.
  // Incluye la cantidad de reservas y la fecha de la última, para la vista de historial.
  async buscar(texto = '', bd = conexion) {
    const resultado = await bd.query(`
      SELECT c.*,
             COUNT(r.id)::int AS cantidad_reservas,
             MAX(r.fecha) AS ultima_reserva
      FROM clientes c
      LEFT JOIN reservas r ON r.cliente_id = c.id
      WHERE $1 = '' OR (c.nombre || ' ' || c.apellido || ' ' || c.dni || ' ' || COALESCE(c.telefono, '') || ' ' || COALESCE(c.email, '')) ILIKE '%' || $1 || '%'
      GROUP BY c.id
      ORDER BY c.apellido, c.nombre
      LIMIT 200
    `, [texto.trim()]);
    return resultado.rows;
  },

  async obtenerPorId(id, bd = conexion) {
    const resultado = await bd.query('SELECT * FROM clientes WHERE id = $1', [id]);
    return resultado.rows[0];
  },

  async obtenerPorDni(dni, bd = conexion) {
    const resultado = await bd.query('SELECT * FROM clientes WHERE dni = $1', [dni]);
    return resultado.rows[0];
  },

  async crear(datos, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO clientes (nombre, apellido, dni, telefono, email, creado_por)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [datos.nombre, datos.apellido, datos.dni, datos.telefono || null, datos.email || null, datos.creado_por]);
    return resultado.rows[0];
  },

  async actualizar(id, datos, bd = conexion) {
    const resultado = await bd.query(`
      UPDATE clientes SET nombre = $1, apellido = $2, dni = $3, telefono = $4, email = $5
      WHERE id = $6
      RETURNING *
    `, [datos.nombre, datos.apellido, datos.dni, datos.telefono || null, datos.email || null, id]);
    return resultado.rows[0];
  }
};

export default clienteModelo;
