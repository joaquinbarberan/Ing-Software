import conexion from '../conexion.bd.mjs';

// Modelo del módulo M4 — Caja y Cobros: pagos, liquidaciones y reportes de gestión.
const cajaModelo = {

  // --- PAGOS ---
  async listarPagos(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT p.*, u.nombre_usuario AS registrado_por_usuario, ua.nombre_usuario AS anulado_por_usuario
      FROM pagos p
      LEFT JOIN usuarios u ON u.id = p.registrado_por
      LEFT JOIN usuarios ua ON ua.id = p.anulado_por
      WHERE p.reserva_id = $1
      ORDER BY p.registrado_en
    `, [reservaId]);
    return resultado.rows;
  },

  async obtenerPago(id, bd = conexion) {
    const resultado = await bd.query('SELECT * FROM pagos WHERE id = $1', [id]);
    return resultado.rows[0];
  },

  async totalPagado(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT COALESCE(SUM(monto), 0)::numeric AS total FROM pagos WHERE reserva_id = $1 AND NOT anulado
    `, [reservaId]);
    return resultado.rows[0].total;
  },

  async crearPago(datos, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO pagos (reserva_id, tipo, monto, medio, comprobante, fecha_pago, registrado_por)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7) RETURNING *
    `, [datos.reserva_id, datos.tipo, datos.monto, datos.medio, datos.comprobante || null, datos.fecha_pago || null, datos.registrado_por]);
    return resultado.rows[0];
  },

  async anularPago(id, motivo, usuarioId, bd = conexion) {
    await bd.query(`
      UPDATE pagos SET anulado = TRUE, motivo_anulacion = $1, anulado_por = $2, anulado_en = NOW() WHERE id = $3
    `, [motivo, usuarioId, id]);
  },

  // Movimientos de caja de un período (todas las reservas), para la pantalla de Caja
  async movimientos(desde, hasta, bd = conexion) {
    const resultado = await bd.query(`
      SELECT p.*, r.fecha AS fecha_evento, s.nombre AS sala_nombre,
             c.nombre || ' ' || c.apellido AS cliente,
             u.nombre_usuario AS registrado_por_usuario
      FROM pagos p
      JOIN reservas r ON r.id = p.reserva_id
      JOIN salas s ON s.id = r.sala_id
      JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN usuarios u ON u.id = p.registrado_por
      WHERE p.fecha_pago BETWEEN $1 AND $2
      ORDER BY p.registrado_en DESC
    `, [desde, hasta]);
    return resultado.rows;
  },

  // Reservas vigentes con saldo pendiente respecto del importe estimado
  async saldosPendientes(bd = conexion) {
    const resultado = await bd.query(`
      SELECT r.id, r.fecha, to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio, r.estado,
             r.importe_estimado, r.sena_requerida, s.nombre AS sala_nombre,
             c.nombre || ' ' || c.apellido AS cliente,
             COALESCE(SUM(p.monto) FILTER (WHERE NOT p.anulado), 0)::numeric AS pagado
      FROM reservas r
      JOIN salas s ON s.id = r.sala_id
      JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN pagos p ON p.reserva_id = r.id
      WHERE r.estado IN ('presenada','confirmada','en_curso')
      GROUP BY r.id, s.nombre, c.nombre, c.apellido
      ORDER BY r.fecha, r.hora_inicio
    `);
    return resultado.rows;
  },

  // --- LIQUIDACIÓN FINAL ---
  async obtenerLiquidacion(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT l.*, u.nombre_usuario AS emitida_por_usuario
      FROM liquidaciones l LEFT JOIN usuarios u ON u.id = l.emitida_por
      WHERE l.reserva_id = $1
    `, [reservaId]);
    return resultado.rows[0];
  },

  async crearLiquidacion(datos, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO liquidaciones (reserva_id, presupuesto, personas_contratadas, asistentes_reales, excedente_personas,
                                 monto_excedente, monto_adicionales, total, total_pagado, saldo, emitida_por)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
    `, [
      datos.reserva_id, datos.presupuesto, datos.personas_contratadas, datos.asistentes_reales,
      datos.excedente_personas, datos.monto_excedente, datos.monto_adicionales, datos.total,
      datos.total_pagado, datos.saldo, datos.emitida_por
    ]);
    return resultado.rows[0];
  },

  // --- REPORTES DE GESTIÓN (RF11) ---
  // Ingresos cobrados por mes y por medio de pago
  async ingresosPorMes(desde, hasta, bd = conexion) {
    const resultado = await bd.query(`
      SELECT to_char(date_trunc('month', fecha_pago), 'YYYY-MM') AS mes,
             SUM(monto)::numeric AS total,
             SUM(monto) FILTER (WHERE medio = 'efectivo')::numeric AS efectivo,
             SUM(monto) FILTER (WHERE medio = 'transferencia')::numeric AS transferencia,
             SUM(monto) FILTER (WHERE medio = 'mercado_pago')::numeric AS mercado_pago,
             SUM(monto) FILTER (WHERE medio = 'tarjeta')::numeric AS tarjeta,
             COUNT(*)::int AS cantidad
      FROM pagos
      WHERE NOT anulado AND fecha_pago BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY 1
    `, [desde, hasta]);
    return resultado.rows;
  },

  // Ranking de servicios adicionales más vendidos
  async rankingAdicionales(desde, hasta, bd = conexion) {
    const resultado = await bd.query(`
      SELECT co.descripcion AS nombre,
             SUM(co.cantidad)::numeric AS cantidad,
             SUM(co.cantidad * co.precio_unitario)::numeric AS total,
             COUNT(DISTINCT co.reserva_id)::int AS eventos
      FROM consumos co
      JOIN reservas r ON r.id = co.reserva_id
      WHERE NOT co.anulado AND r.fecha BETWEEN $1 AND $2
      GROUP BY co.descripcion
      ORDER BY total DESC
      LIMIT 10
    `, [desde, hasta]);
    return resultado.rows;
  },

  // Totales del período: eventos realizados, excedentes cobrados y reservas por estado
  async resumenPeriodo(desde, hasta, bd = conexion) {
    const liquidado = await bd.query(`
      SELECT COUNT(*)::int AS eventos_liquidados,
             COALESCE(SUM(l.total), 0)::numeric AS facturado,
             COALESCE(SUM(l.monto_excedente), 0)::numeric AS excedentes,
             COALESCE(SUM(l.excedente_personas), 0)::int AS personas_excedentes,
             COALESCE(SUM(l.monto_adicionales), 0)::numeric AS adicionales
      FROM liquidaciones l JOIN reservas r ON r.id = l.reserva_id
      WHERE r.fecha BETWEEN $1 AND $2
    `, [desde, hasta]);
    const estados = await bd.query(`
      SELECT estado, COUNT(*)::int AS cantidad FROM reservas WHERE fecha BETWEEN $1 AND $2 GROUP BY estado
    `, [desde, hasta]);
    const insumos = await bd.query(`
      SELECT COALESCE(SUM(pi.costo_real), 0)::numeric AS costo_insumos
      FROM pedidos_insumos pi JOIN reservas r ON r.id = pi.reserva_id
      WHERE pi.recibido AND r.fecha BETWEEN $1 AND $2
    `, [desde, hasta]);
    return {
      ...liquidado.rows[0],
      ...insumos.rows[0],
      reservas_por_estado: Object.fromEntries(estados.rows.map(fila => [fila.estado, fila.cantidad]))
    };
  }
};

export default cajaModelo;
