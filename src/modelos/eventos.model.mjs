import conexion from '../conexion.bd.mjs';

// Modelo del módulo M3 — Gestión de Evento:
// evento del día (asistentes reales), consumos adicionales, coordinadores asignados e insumos.
const eventoModelo = {

  // --- EVENTO (asistentes reales) ---
  async obtenerPorReserva(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT e.*, u.nombre_usuario AS habilitado_por_usuario
      FROM eventos e LEFT JOIN usuarios u ON u.id = e.habilitado_por
      WHERE e.reserva_id = $1
    `, [reservaId]);
    return resultado.rows[0];
  },

  async crear(reservaId, usuarioId, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO eventos (reserva_id, habilitado_por) VALUES ($1, $2) RETURNING *
    `, [reservaId, usuarioId]);
    return resultado.rows[0];
  },

  async actualizarAsistentes(reservaId, ninos, adultos, usuarioId, bd = conexion) {
    const resultado = await bd.query(`
      UPDATE eventos SET ninos_reales = $1, adultos_reales = $2,
             asistentes_actualizado_en = NOW(), asistentes_actualizado_por = $3
      WHERE reserva_id = $4 RETURNING *
    `, [ninos, adultos, usuarioId, reservaId]);
    return resultado.rows[0];
  },

  // --- CONSUMOS ADICIONALES (comanda digital) ---
  async listarConsumos(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT c.*, (c.cantidad * c.precio_unitario) AS subtotal,
             u.nombre_usuario AS registrado_por_usuario, ua.nombre_usuario AS anulado_por_usuario
      FROM consumos c
      LEFT JOIN usuarios u ON u.id = c.registrado_por
      LEFT JOIN usuarios ua ON ua.id = c.anulado_por
      WHERE c.reserva_id = $1
      ORDER BY c.registrado_en
    `, [reservaId]);
    return resultado.rows;
  },

  async obtenerConsumo(id, bd = conexion) {
    const resultado = await bd.query('SELECT * FROM consumos WHERE id = $1', [id]);
    return resultado.rows[0];
  },

  async crearConsumo(datos, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO consumos (reserva_id, adicional_id, descripcion, cantidad, precio_unitario, registrado_por)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [datos.reserva_id, datos.adicional_id || null, datos.descripcion, datos.cantidad, datos.precio_unitario, datos.registrado_por]);
    return resultado.rows[0];
  },

  async anularConsumo(id, motivo, usuarioId, bd = conexion) {
    await bd.query(`
      UPDATE consumos SET anulado = TRUE, motivo_anulacion = $1, anulado_por = $2, anulado_en = NOW() WHERE id = $3
    `, [motivo, usuarioId, id]);
  },

  async totalConsumos(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT COALESCE(SUM(cantidad * precio_unitario), 0)::numeric AS total
      FROM consumos WHERE reserva_id = $1 AND NOT anulado
    `, [reservaId]);
    return resultado.rows[0].total;
  },

  // --- COORDINADORES ASIGNADOS ---
  async listarAsignaciones(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT a.id, a.reserva_id, a.coordinador_id, a.asignado_en, c.nombre, c.telefono, c.tarifa_hora
      FROM asignaciones a JOIN coordinadores c ON c.id = a.coordinador_id
      WHERE a.reserva_id = $1
      ORDER BY c.nombre
    `, [reservaId]);
    return resultado.rows;
  },

  // Grilla de asignaciones de un rango de fechas (RF10: fin de semana)
  async grillaAsignaciones(desde, hasta, bd = conexion) {
    const resultado = await bd.query(`
      SELECT a.id, a.reserva_id, a.coordinador_id, c.nombre AS coordinador, c.telefono, c.tarifa_hora,
             r.fecha, to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(r.hora_fin, 'HH24:MI') AS hora_fin,
             EXTRACT(EPOCH FROM (r.hora_fin - r.hora_inicio)) / 3600 AS horas
      FROM asignaciones a
      JOIN coordinadores c ON c.id = a.coordinador_id
      JOIN reservas r ON r.id = a.reserva_id
      WHERE r.fecha BETWEEN $1 AND $2 AND r.estado IN ('presenada','confirmada','en_curso','realizada')
      ORDER BY r.fecha, r.hora_inicio, c.nombre
    `, [desde, hasta]);
    return resultado.rows;
  },

  // ¿El coordinador ya está en otro evento que se pisa con este horario?
  async coordinadorOcupado(coordinadorId, fecha, horaInicio, horaFin, reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT r.id, s.nombre AS sala_nombre, to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(r.hora_fin, 'HH24:MI') AS hora_fin
      FROM asignaciones a
      JOIN reservas r ON r.id = a.reserva_id
      JOIN salas s ON s.id = r.sala_id
      WHERE a.coordinador_id = $1 AND r.fecha = $2 AND r.id <> $5
        AND r.estado IN ('presenada','confirmada','en_curso')
        AND r.hora_inicio < $4::time AND r.hora_fin > $3::time
      LIMIT 1
    `, [coordinadorId, fecha, horaInicio, horaFin, reservaId]);
    return resultado.rows[0];
  },

  async asignarCoordinador(reservaId, coordinadorId, usuarioId, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO asignaciones (reserva_id, coordinador_id, asignado_por) VALUES ($1, $2, $3) RETURNING *
    `, [reservaId, coordinadorId, usuarioId]);
    return resultado.rows[0];
  },

  async quitarAsignacion(id, bd = conexion) {
    const resultado = await bd.query('DELETE FROM asignaciones WHERE id = $1 RETURNING *', [id]);
    return resultado.rows[0];
  },

  // --- INSUMOS DEL EVENTO ---
  async listarPedido(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT pi.*, i.nombre, i.unidad, u.nombre_usuario AS recibido_por_usuario
      FROM pedidos_insumos pi
      JOIN insumos i ON i.id = pi.insumo_id
      LEFT JOIN usuarios u ON u.id = pi.recibido_por
      WHERE pi.reserva_id = $1
      ORDER BY i.nombre
    `, [reservaId]);
    return resultado.rows;
  },

  // Insumos que lleva el paquete, con la cantidad por persona y el costo de referencia
  async insumosDelPaquete(paqueteId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT i.id AS insumo_id, i.nombre, i.unidad, i.costo_unitario, pi.cantidad_por_persona
      FROM paquetes_insumos pi JOIN insumos i ON i.id = pi.insumo_id
      WHERE pi.paquete_id = $1 AND i.activo
      ORDER BY i.nombre
    `, [paqueteId]);
    return resultado.rows;
  },

  // Genera (o regenera) una línea del pedido. Si el insumo ya estaba recibido no se toca.
  async guardarLineaPedido(reservaId, insumoId, cantidad, costoEstimado, usuarioId, bd = conexion) {
    await bd.query(`
      INSERT INTO pedidos_insumos (reserva_id, insumo_id, cantidad, costo_estimado, generado_por)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (reserva_id, insumo_id) DO UPDATE
        SET cantidad = EXCLUDED.cantidad, costo_estimado = EXCLUDED.costo_estimado,
            generado_por = EXCLUDED.generado_por, generado_en = NOW()
        WHERE NOT pedidos_insumos.recibido
    `, [reservaId, insumoId, cantidad, costoEstimado, usuarioId]);
  },

  async obtenerLineaPedido(id, bd = conexion) {
    const resultado = await bd.query('SELECT * FROM pedidos_insumos WHERE id = $1', [id]);
    return resultado.rows[0];
  },

  async registrarRecepcion(id, costoReal, usuarioId, bd = conexion) {
    await bd.query(`
      UPDATE pedidos_insumos SET recibido = TRUE, costo_real = $1, recibido_en = NOW(), recibido_por = $2 WHERE id = $3
    `, [costoReal, usuarioId, id]);
  },

  // Resumen de pedidos de las próximas reservas (para la pantalla de insumos)
  async resumenPedidos(desde, hasta, bd = conexion) {
    const resultado = await bd.query(`
      SELECT r.id AS reserva_id,
             COUNT(pi.id)::int AS lineas,
             COUNT(pi.id) FILTER (WHERE pi.recibido)::int AS recibidas,
             COALESCE(SUM(pi.costo_estimado), 0)::numeric AS costo_estimado,
             COALESCE(SUM(pi.costo_real), 0)::numeric AS costo_real
      FROM reservas r
      LEFT JOIN pedidos_insumos pi ON pi.reserva_id = r.id
      WHERE r.fecha BETWEEN $1 AND $2
      GROUP BY r.id
    `, [desde, hasta]);
    return resultado.rows;
  }
};

export default eventoModelo;
