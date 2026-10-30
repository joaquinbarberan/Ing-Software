import conexion from '../conexion.bd.mjs';

// Modelo de Solicitudes de reserva (las que deja el cliente desde la página web).
// Una solicitud no es una reserva: no ocupa la franja. Ventas la convierte en reserva o la descarta.

const SELECCION = `
  SELECT s.id, s.sala_id, s.paquete_id, s.fecha,
         to_char(s.hora_inicio, 'HH24:MI') AS hora_inicio,
         to_char(s.hora_fin, 'HH24:MI') AS hora_fin,
         s.personas, s.nombre, s.apellido, s.dni, s.telefono, s.email, s.comentarios,
         s.estado, s.reserva_id, s.motivo_descarte, s.atendida_en, s.creada_en,
         sa.nombre AS sala_nombre,
         p.nombre AS paquete_nombre, p.duracion_horas,
         u.nombre_usuario AS atendida_por_usuario,
         c.id AS cliente_id
  FROM solicitudes_reserva s
  JOIN salas sa ON sa.id = s.sala_id
  JOIN paquetes p ON p.id = s.paquete_id
  LEFT JOIN usuarios u ON u.id = s.atendida_por
  LEFT JOIN clientes c ON c.dni = s.dni
`;

const solicitudModelo = {

  async crear(datos, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO solicitudes_reserva (sala_id, paquete_id, fecha, hora_inicio, hora_fin, personas,
                                       nombre, apellido, dni, telefono, email, comentarios)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      datos.sala_id, datos.paquete_id, datos.fecha, datos.hora_inicio, datos.hora_fin, datos.personas,
      datos.nombre, datos.apellido, datos.dni, datos.telefono, datos.email || null, datos.comentarios || null
    ]);
    return resultado.rows[0].id;
  },

  async obtenerPorId(id, bd = conexion) {
    const resultado = await bd.query(`${SELECCION} WHERE s.id = $1`, [id]);
    return resultado.rows[0];
  },

  // Evita duplicados por doble clic o reenvío: misma persona, misma sala, fecha y horario, todavía pendiente
  async buscarPendienteIgual(datos, bd = conexion) {
    const resultado = await bd.query(`
      SELECT id FROM solicitudes_reserva
      WHERE estado = 'pendiente' AND dni = $1 AND sala_id = $2 AND fecha = $3 AND hora_inicio = $4
    `, [datos.dni, datos.sala_id, datos.fecha, datos.hora_inicio]);
    return resultado.rows[0]?.id || null;
  },

  // Cuántas solicitudes pendientes tiene un mismo DNI (límite anti abuso)
  async contarPendientesDeDni(dni, bd = conexion) {
    const resultado = await bd.query(
      `SELECT COUNT(*)::int AS cantidad FROM solicitudes_reserva WHERE estado = 'pendiente' AND dni = $1`, [dni]);
    return resultado.rows[0].cantidad;
  },

  // estado: 'pendiente' | 'convertida' | 'descartada' | null (todas). Las pendientes más próximas primero.
  async listar(estado = null, bd = conexion) {
    const resultado = await bd.query(`
      ${SELECCION}
      WHERE ($1::text IS NULL OR s.estado = $1)
      ORDER BY CASE WHEN s.estado = 'pendiente' THEN 0 ELSE 1 END,
               CASE WHEN s.estado = 'pendiente' THEN s.fecha END ASC,
               s.creada_en DESC
      LIMIT 200
    `, [estado]);
    return resultado.rows;
  },

  async contarPendientes(bd = conexion) {
    const resultado = await bd.query(
      `SELECT COUNT(*)::int AS cantidad FROM solicitudes_reserva WHERE estado = 'pendiente' AND fecha >= CURRENT_DATE`);
    return resultado.rows[0].cantidad;
  },

  // Marca la solicitud como convertida en reserva. Devuelve false si ya no estaba pendiente.
  async marcarConvertida(id, reservaId, usuarioId, bd = conexion) {
    const resultado = await bd.query(`
      UPDATE solicitudes_reserva
      SET estado = 'convertida', reserva_id = $2, atendida_por = $3, atendida_en = NOW()
      WHERE id = $1 AND estado = 'pendiente'
    `, [id, reservaId, usuarioId]);
    return resultado.rowCount > 0;
  },

  async descartar(id, motivo, usuarioId, bd = conexion) {
    const resultado = await bd.query(`
      UPDATE solicitudes_reserva
      SET estado = 'descartada', motivo_descarte = $2, atendida_por = $3, atendida_en = NOW()
      WHERE id = $1 AND estado = 'pendiente'
    `, [id, motivo, usuarioId]);
    return resultado.rowCount > 0;
  }
};

export default solicitudModelo;
