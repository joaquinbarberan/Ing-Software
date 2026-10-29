import conexion from '../conexion.bd.mjs';

// Modelo de Reservas (entidad Reserva del módulo M1).
// Cada función recibe opcionalmente "bd": si viene un cliente de transacción se usa ese,
// si no, se usa el pool común. Así el controlador puede agrupar varias consultas en una transacción.

// Columnas que devolvemos siempre, con los datos de sala, cliente y paquete ya unidos
const SELECCION = `
  SELECT r.id, r.sala_id, r.cliente_id, r.paquete_id, r.fecha,
         to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio,
         to_char(r.hora_fin, 'HH24:MI') AS hora_fin,
         r.estado, r.personas_contratadas, r.importe_estimado, r.sena_requerida,
         r.observaciones, r.motivo_cancelacion, r.fecha_alta, r.actualizado_en,
         s.nombre AS sala_nombre,
         c.nombre AS cliente_nombre, c.apellido AS cliente_apellido, c.dni AS cliente_dni,
         c.telefono AS cliente_telefono, c.email AS cliente_email,
         p.nombre AS paquete_nombre, p.es_personalizado AS paquete_personalizado,
         p.tarifa_excedente, p.personas_incluidas,
         u.nombre_usuario AS creado_por_usuario
  FROM reservas r
  JOIN salas s ON s.id = r.sala_id
  JOIN clientes c ON c.id = r.cliente_id
  JOIN paquetes p ON p.id = r.paquete_id
  LEFT JOIN usuarios u ON u.id = r.creado_por
`;

const reservaModelo = {

  async obtenerPorId(id, bd = conexion) {
    const resultado = await bd.query(`${SELECCION} WHERE r.id = $1`, [id]);
    return resultado.rows[0];
  },

  // Reservas de un período (para la agenda mensual o semanal), ordenadas por fecha y hora
  async obtenerPorPeriodo(desde, hasta, { salaId = null, incluirTerminales = true } = {}, bd = conexion) {
    const resultado = await bd.query(`
      ${SELECCION}
      WHERE r.fecha BETWEEN $1 AND $2
        AND ($3::int IS NULL OR r.sala_id = $3)
        AND ($4::boolean OR r.estado IN ('presenada','confirmada','en_curso'))
      ORDER BY r.fecha, r.hora_inicio, s.nombre
    `, [desde, hasta, salaId, incluirTerminales]);
    return resultado.rows;
  },

  // Reservas vigentes (que ocupan la franja) de una sala en una fecha
  async obtenerVigentesDeSala(salaId, fecha, bd = conexion) {
    const resultado = await bd.query(`
      ${SELECCION}
      WHERE r.sala_id = $1 AND r.fecha = $2 AND r.estado IN ('presenada','confirmada','en_curso')
      ORDER BY r.hora_inicio
    `, [salaId, fecha]);
    return resultado.rows;
  },

  // Busca reservas vigentes de la sala que se pisen con la franja [horaInicio, horaFin).
  // Dos franjas se superponen cuando una empieza antes de que termine la otra (RN01).
  // excluirId permite ignorar la propia reserva cuando se está modificando.
  async buscarSuperpuestas(salaId, fecha, horaInicio, horaFin, excluirId = null, bd = conexion) {
    const resultado = await bd.query(`
      ${SELECCION}
      WHERE r.sala_id = $1 AND r.fecha = $2
        AND r.estado IN ('presenada','confirmada','en_curso')
        AND r.hora_inicio < $4::time AND r.hora_fin > $3::time
        AND ($5::int IS NULL OR r.id <> $5)
      ORDER BY r.hora_inicio
    `, [salaId, fecha, horaInicio, horaFin, excluirId]);
    return resultado.rows;
  },

  // Bloquea (sólo durante la transacción) la combinación sala + fecha.
  // Si dos operadores guardan a la vez la misma franja, el segundo espera al primero y
  // al revalidar ve la reserva recién creada (excepción E1 de CU-02).
  async bloquearSalaFecha(salaId, fecha, bd) {
    await bd.query(`SELECT pg_advisory_xact_lock($1, ($2::date - DATE '2000-01-01'))`, [salaId, fecha]);
  },

  async crear(datos, bd = conexion) {
    const resultado = await bd.query(`
      INSERT INTO reservas (sala_id, cliente_id, paquete_id, fecha, hora_inicio, hora_fin, estado,
                            personas_contratadas, importe_estimado, sena_requerida, observaciones, creado_por)
      VALUES ($1, $2, $3, $4, $5, $6, 'presenada', $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      datos.sala_id, datos.cliente_id, datos.paquete_id, datos.fecha, datos.hora_inicio, datos.hora_fin,
      datos.personas_contratadas, datos.importe_estimado, datos.sena_requerida, datos.observaciones || null,
      datos.creado_por
    ]);
    return resultado.rows[0].id;
  },

  async actualizarDatos(id, datos, bd = conexion) {
    await bd.query(`
      UPDATE reservas
      SET sala_id = $1, fecha = $2, hora_inicio = $3, hora_fin = $4, personas_contratadas = $5,
          importe_estimado = $6, sena_requerida = $7, observaciones = $8, actualizado_en = NOW()
      WHERE id = $9
    `, [
      datos.sala_id, datos.fecha, datos.hora_inicio, datos.hora_fin, datos.personas_contratadas,
      datos.importe_estimado, datos.sena_requerida, datos.observaciones || null, id
    ]);
  },

  async cambiarEstado(id, estado, bd = conexion) {
    await bd.query('UPDATE reservas SET estado = $1, actualizado_en = NOW() WHERE id = $2', [estado, id]);
  },

  async cancelar(id, motivo, bd = conexion) {
    await bd.query(`
      UPDATE reservas SET estado = 'cancelada', motivo_cancelacion = $1, actualizado_en = NOW() WHERE id = $2
    `, [motivo, id]);
  },

  // Pasa a Expirada toda reserva Preseñada con más de 72 horas sin seña (RN03).
  // Es la única transición del diagrama de estados que dispara el paso del tiempo.
  async expirarPresenadas(bd = conexion) {
    const resultado = await bd.query(`
      UPDATE reservas SET estado = 'expirada', actualizado_en = NOW()
      WHERE estado = 'presenada' AND fecha_alta < NOW() - INTERVAL '72 hours'
      RETURNING id
    `);
    return resultado.rows.map(fila => fila.id);
  },

  // Historial de un cliente (CU-06)
  async obtenerPorCliente(clienteId, bd = conexion) {
    const resultado = await bd.query(`${SELECCION} WHERE r.cliente_id = $1 ORDER BY r.fecha DESC, r.hora_inicio DESC`, [clienteId]);
    return resultado.rows;
  },

  // --- Trazabilidad (RNF06) ---
  async registrarHistorial(reservaId, usuarioId, accion, detalle, bd = conexion) {
    await bd.query(`
      INSERT INTO reservas_historial (reserva_id, usuario_id, accion, detalle) VALUES ($1, $2, $3, $4)
    `, [reservaId, usuarioId, accion, detalle || null]);
  },

  async obtenerHistorial(reservaId, bd = conexion) {
    const resultado = await bd.query(`
      SELECT h.id, h.accion, h.detalle, h.fecha, COALESCE(u.nombre_usuario, 'sistema') AS usuario
      FROM reservas_historial h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.reserva_id = $1
      ORDER BY h.fecha DESC, h.id DESC
    `, [reservaId]);
    return resultado.rows;
  }
};

export default reservaModelo;
