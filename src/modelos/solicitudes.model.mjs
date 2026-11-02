
import conexion from '../conexion.bd.mjs';

// Modelo de solicitudes web.
// Las solicitudes no bloquean la agenda: Ventas debe convertirlas en reservas.

const SELECCION = `
  SELECT
    s.id,
    s.sala_id,
    s.paquete_id,
    s.fecha,
    to_char(s.hora_inicio, 'HH24:MI') AS hora_inicio,
    to_char(s.hora_fin, 'HH24:MI') AS hora_fin,
    s.personas,
    s.ninos,
    s.adultos,
    s.precio_sala_estimado,
    s.importe_estimado,
    s.sena_requerida,
    s.nombre,
    s.apellido,
    s.dni,
    s.telefono,
    s.email,
    s.comentarios,
    s.estado,
    s.reserva_id,
    s.motivo_descarte,
    s.atendida_en,
    s.creada_en,

    sa.nombre AS sala_nombre,
    p.nombre AS paquete_nombre,
    p.duracion_horas,
    u.nombre_usuario AS atendida_por_usuario,
    c.id AS cliente_id,

    COALESCE((
      SELECT json_agg(
        json_build_object(
          'id', ac.id,
          'adicional_id', ac.adicional_id,
          'nombre', ac.nombre,
          'unidad', ac.unidad,
          'modalidad_cobro', ac.modalidad_cobro,
          'cantidad', ac.cantidad,
          'precio_unitario', ac.precio_unitario,
          'subtotal', ac.subtotal,
          'anticipacion_horas', ac.anticipacion_horas,
          'anulable', ac.anulable
        ) ORDER BY ac.id
      )
      FROM adicionales_contratados ac
      WHERE ac.solicitud_id = s.id
    ), '[]'::json) AS adicionales

  FROM solicitudes_reserva s
  JOIN salas sa ON sa.id = s.sala_id
  LEFT JOIN paquetes p ON p.id = s.paquete_id
  LEFT JOIN usuarios u ON u.id = s.atendida_por
  LEFT JOIN clientes c ON c.dni = s.dni
`;

const solicitudModelo = {

  async crear(datos, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO solicitudes_reserva (
        sala_id,
        paquete_id,
        fecha,
        hora_inicio,
        hora_fin,
        personas,
        nombre,
        apellido,
        dni,
        telefono,
        email,
        comentarios,
        ninos,
        adultos,
        precio_sala_estimado,
        importe_estimado,
        sena_requerida
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17
      )
      RETURNING id
    `, [
      datos.sala_id,
      null,
      datos.fecha,
      datos.hora_inicio,
      datos.hora_fin,
      datos.personas,
      datos.nombre,
      datos.apellido,
      datos.dni,
      datos.telefono,
      datos.email || null,
      datos.comentarios || null,
      datos.ninos,
      datos.adultos,
      datos.precio_sala_estimado,
      datos.importe_estimado,
      datos.sena_requerida
    ]);

    return resultado.rows[0].id;
  },

  // Guarda los adicionales contratados con una copia de sus precios.
  async guardarAdicionales(solicitudId, adicionales, bd = conexion) {
    for (const adicional of adicionales) {
      await bd.query(`
        INSERT INTO adicionales_contratados (
          solicitud_id,
          adicional_id,
          nombre,
          unidad,
          modalidad_cobro,
          cantidad,
          precio_unitario,
          subtotal,
          anticipacion_horas,
          anulable
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        solicitudId,
        adicional.adicional_id,
        adicional.nombre,
        adicional.unidad,
        adicional.modalidad_cobro,
        adicional.cantidad,
        adicional.precio_unitario,
        adicional.subtotal,
        adicional.anticipacion_horas,
        adicional.anulable
      ]);
    }
  },

  async obtenerPorId(id, bd = conexion) {
    const resultado = await bd.query(
      `${SELECCION} WHERE s.id = $1`,
      [id]
    );

    return resultado.rows[0];
  },

  // Evita duplicar solicitudes enviadas varias veces.
  async buscarPendienteIgual(datos, adicionales = [], bd = conexion) {
    const firmaAdicionales = JSON.stringify(
      adicionales
        .map(a => ({
          adicional_id: a.adicional_id,
          cantidad: a.cantidad
        }))
        .sort((a, b) => a.adicional_id - b.adicional_id)
    );

    const resultado = await bd.query(`
      SELECT s.id
      FROM solicitudes_reserva s
      WHERE s.estado = 'pendiente'
        AND s.dni = $1
        AND s.sala_id = $2
        AND s.fecha = $3
        AND s.hora_inicio = $4
        AND s.ninos IS NOT DISTINCT FROM $5
        AND s.adultos IS NOT DISTINCT FROM $6
        AND s.precio_sala_estimado = $8
        AND s.importe_estimado = $9

        AND COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'adicional_id', ac.adicional_id,
              'cantidad', ac.cantidad
            )
            ORDER BY ac.adicional_id
          )
          FROM adicionales_contratados ac
          WHERE ac.solicitud_id = s.id
        ), '[]'::jsonb) = $7::jsonb

      LIMIT 1
    `, [
      datos.dni,
      datos.sala_id,
      datos.fecha,
      datos.hora_inicio,
      datos.ninos,
      datos.adultos,
      firmaAdicionales,
      datos.precio_sala_estimado,
      datos.importe_estimado
    ]);

    return resultado.rows[0]?.id || null;
  },

  async contarPendientesDeDni(dni, bd = conexion) {
    const resultado = await bd.query(`
      SELECT COUNT(*)::int AS cantidad
      FROM solicitudes_reserva
      WHERE estado = 'pendiente' AND dni = $1
    `, [dni]);

    return resultado.rows[0].cantidad;
  },

  async listar(estado = null, bd = conexion) {
    const resultado = await bd.query(`
      ${SELECCION}
      WHERE ($1::text IS NULL OR s.estado = $1)
      ORDER BY
        CASE WHEN s.estado = 'pendiente' THEN 0 ELSE 1 END,
        CASE WHEN s.estado = 'pendiente' THEN s.fecha END ASC,
        s.creada_en DESC
      LIMIT 200
    `, [estado]);

    return resultado.rows;
  },

  async contarPendientes(bd = conexion) {
    const resultado = await bd.query(`
      SELECT COUNT(*)::int AS cantidad
      FROM solicitudes_reserva
      WHERE estado = 'pendiente'
        AND fecha >= CURRENT_DATE
    `);

    return resultado.rows[0].cantidad;
  },

  // Marca la solicitud como convertida y vincula sus adicionales a la reserva.
  async marcarConvertida(id, reservaId, usuarioId, bd = conexion) {
    const resultado = await bd.query(`
      UPDATE solicitudes_reserva
      SET
        estado = 'convertida',
        reserva_id = $2,
        atendida_por = $3,
        atendida_en = NOW()
      WHERE id = $1 AND estado = 'pendiente'
    `, [id, reservaId, usuarioId]);

    if (resultado.rowCount > 0) {
      await bd.query(`
        UPDATE adicionales_contratados
        SET reserva_id = $2
        WHERE solicitud_id = $1
          AND reserva_id IS NULL
      `, [id, reservaId]);
    }

    return resultado.rowCount > 0;
  },

  async descartar(id, motivo, usuarioId, bd = conexion) {
    const resultado = await bd.query(`
      UPDATE solicitudes_reserva
      SET
        estado = 'descartada',
        motivo_descarte = $2,
        atendida_por = $3,
        atendida_en = NOW()
      WHERE id = $1 AND estado = 'pendiente'
    `, [id, motivo, usuarioId]);

    return resultado.rowCount > 0;
  }
};

export default solicitudModelo;
