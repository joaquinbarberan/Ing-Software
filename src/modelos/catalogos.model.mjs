import conexion from '../conexion.bd.mjs';

// Modelo de los catálogos que configura Administración:
// paquetes (M1), servicios adicionales, insumos y coordinadores (M3).
// Ninguno se elimina físicamente porque hay reservas que los referencian: se dan de baja con "activo".

const catalogoModelo = {

  // --- PAQUETES ---
  async listarPaquetes({ soloActivos = false } = {}, bd = conexion) {
    const resultado = await bd.query(`
      SELECT p.*,
             COALESCE(json_agg(json_build_object('insumo_id', pi.insumo_id, 'cantidad_por_persona', pi.cantidad_por_persona))
                      FILTER (WHERE pi.insumo_id IS NOT NULL), '[]') AS insumos
      FROM paquetes p
      LEFT JOIN paquetes_insumos pi ON pi.paquete_id = p.id
      WHERE NOT $1::boolean OR p.activo
      GROUP BY p.id
      ORDER BY p.es_personalizado, p.precio_base
    `, [soloActivos]);
    return resultado.rows;
  },

  async obtenerPaquete(id, bd = conexion) {
    const resultado = await bd.query('SELECT * FROM paquetes WHERE id = $1', [id]);
    return resultado.rows[0];
  },

  async guardarPaquete(id, datos, bd = conexion) {
    const parametros = [
      datos.nombre, datos.descripcion || '', datos.precio_base, datos.personas_incluidas,
      datos.duracion_horas, datos.tarifa_excedente, datos.es_personalizado, datos.activo
    ];
    const resultado = id
      ? await bd.query(`
          UPDATE paquetes SET nombre = $1, descripcion = $2, precio_base = $3, personas_incluidas = $4,
                 duracion_horas = $5, tarifa_excedente = $6, es_personalizado = $7, activo = $8
          WHERE id = $9 RETURNING *`, [...parametros, id])
      : await bd.query(`
          INSERT INTO paquetes (nombre, descripcion, precio_base, personas_incluidas, duracion_horas,
                                tarifa_excedente, es_personalizado, activo)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, parametros);
    return resultado.rows[0];
  },

  // Reemplaza la lista de insumos que lleva un paquete
  async guardarInsumosDePaquete(paqueteId, insumos, bd = conexion) {
    await bd.query('DELETE FROM paquetes_insumos WHERE paquete_id = $1', [paqueteId]);
    for (const item of insumos) {
      await bd.query(`
        INSERT INTO paquetes_insumos (paquete_id, insumo_id, cantidad_por_persona) VALUES ($1, $2, $3)
      `, [paqueteId, item.insumo_id, item.cantidad_por_persona]);
    }
  },

  // --- SERVICIOS ADICIONALES ---
  async listarAdicionales({ soloActivos = false } = {}, bd = conexion) {
    const resultado = await bd.query(`
      SELECT * FROM adicionales WHERE NOT $1::boolean OR activo ORDER BY nombre
    `, [soloActivos]);
    return resultado.rows;
  },

  async obtenerAdicional(id, bd = conexion) {
    const resultado = await bd.query('SELECT * FROM adicionales WHERE id = $1', [id]);
    return resultado.rows[0];
  },

  async guardarAdicional(id, datos, bd = conexion) {
    const parametros = [datos.nombre, datos.precio, datos.unidad || 'unidad', datos.activo];
    const resultado = id
      ? await bd.query('UPDATE adicionales SET nombre = $1, precio = $2, unidad = $3, activo = $4 WHERE id = $5 RETURNING *', [...parametros, id])
      : await bd.query('INSERT INTO adicionales (nombre, precio, unidad, activo) VALUES ($1, $2, $3, $4) RETURNING *', parametros);
    return resultado.rows[0];
  },

  // --- INSUMOS ---
  async listarInsumos({ soloActivos = false } = {}, bd = conexion) {
    const resultado = await bd.query(`
      SELECT * FROM insumos WHERE NOT $1::boolean OR activo ORDER BY nombre
    `, [soloActivos]);
    return resultado.rows;
  },

  async guardarInsumo(id, datos, bd = conexion) {
    const parametros = [datos.nombre, datos.unidad || 'unidad', datos.costo_unitario, datos.activo];
    const resultado = id
      ? await bd.query('UPDATE insumos SET nombre = $1, unidad = $2, costo_unitario = $3, activo = $4 WHERE id = $5 RETURNING *', [...parametros, id])
      : await bd.query('INSERT INTO insumos (nombre, unidad, costo_unitario, activo) VALUES ($1, $2, $3, $4) RETURNING *', parametros);
    return resultado.rows[0];
  },

  // --- COORDINADORES ---
  async listarCoordinadores({ soloActivos = false } = {}, bd = conexion) {
    const resultado = await bd.query(`
      SELECT * FROM coordinadores WHERE NOT $1::boolean OR activo ORDER BY nombre
    `, [soloActivos]);
    return resultado.rows;
  },

  async obtenerCoordinador(id, bd = conexion) {
    const resultado = await bd.query('SELECT * FROM coordinadores WHERE id = $1', [id]);
    return resultado.rows[0];
  },

  async guardarCoordinador(id, datos, bd = conexion) {
    const parametros = [datos.nombre, datos.telefono || null, datos.tarifa_hora, datos.activo];
    const resultado = id
      ? await bd.query('UPDATE coordinadores SET nombre = $1, telefono = $2, tarifa_hora = $3, activo = $4 WHERE id = $5 RETURNING *', [...parametros, id])
      : await bd.query('INSERT INTO coordinadores (nombre, telefono, tarifa_hora, activo) VALUES ($1, $2, $3, $4) RETURNING *', parametros);
    return resultado.rows[0];
  }
};

export default catalogoModelo;
