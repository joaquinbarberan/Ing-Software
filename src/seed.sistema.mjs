import bcrypt from 'bcryptjs';
import conexion from './conexion.bd.mjs';
import { crearEsquema } from './bd/esquema.mjs';
import { precioPara, senaPara } from './utilidades/calculos.mjs';

// Script que crea todas las tablas del sistema de gestión y carga datos de ejemplo:
// usuarios por perfil, paquetes, adicionales, insumos, coordinadores, clientes y reservas
// en distintos estados (pasadas liquidadas, de hoy y futuras), para poder probar y demostrar
// todos los casos de uso. Las fechas se calculan a partir del día en que se ejecuta.
//
// Usuarios de prueba (contraseñas de ejemplo, cambiarlas en producción):
//   admin          / admin123     -> Gerencia (creado por seed.usuarios.mjs)
//   ventas         / ventas2026   -> Encargado de Ventas
//   administracion / admin2026    -> Administración
//   encargado      / salon2026    -> Encargado de Salón

const USUARIOS = [
  { nombre_usuario: 'ventas', contrasena: 'ventas2026', nombre: 'Carla Ríos', perfil: 'ventas' },
  { nombre_usuario: 'administracion', contrasena: 'admin2026', nombre: 'Martín Suárez', perfil: 'administracion' },
  { nombre_usuario: 'encargado', contrasena: 'salon2026', nombre: 'Diego Ferreyra', perfil: 'encargado' }
];

const PAQUETES = [
  { nombre: 'Cumpleaños Clásico — 3 h', descripcion: 'Salón, juegos e inflables, menú básico y torta.', precio_base: 280000, personas_incluidas: 25, duracion_horas: 3, tarifa_excedente: 9000 },
  { nombre: 'Cumpleaños Full — 4 h', descripcion: 'Salón, juegos mecánicos, animación, menú completo y torta.', precio_base: 400000, personas_incluidas: 30, duracion_horas: 4, tarifa_excedente: 8000 },
  { nombre: 'Cumpleaños Premium — 4 h', descripcion: 'Full + pista de baile, show temático y mesa dulce.', precio_base: 560000, personas_incluidas: 40, duracion_horas: 4, tarifa_excedente: 11000 },
  { nombre: 'Personalizado', descripcion: 'Paquete a medida. El importe lo define Administración.', precio_base: 0, personas_incluidas: 0, duracion_horas: 4, tarifa_excedente: 9000, es_personalizado: true }
];

const ADICIONALES = [
  { nombre: 'Hora adicional de salón', precio: 60000, unidad: 'hora' },
  { nombre: 'Porción de pizza extra', precio: 2500, unidad: 'porción' },
  { nombre: 'Bebida extra (1,5 L)', precio: 3500, unidad: 'botella' },
  { nombre: 'Combo papas y salchichas', precio: 4500, unidad: 'combo' },
  { nombre: 'Show de magia', precio: 45000, unidad: 'show' },
  { nombre: 'Souvenirs extra', precio: 1800, unidad: 'unidad' }
];

const INSUMOS = [
  { nombre: 'Porciones de pizza', unidad: 'porción', costo_unitario: 900 },
  { nombre: 'Gaseosa 1,5 L', unidad: 'botella', costo_unitario: 1600 },
  { nombre: 'Vasos descartables', unidad: 'unidad', costo_unitario: 60 },
  { nombre: 'Platos descartables', unidad: 'unidad', costo_unitario: 70 },
  { nombre: 'Servilletas', unidad: 'paquete', costo_unitario: 450 },
  { nombre: 'Torta (porción)', unidad: 'porción', costo_unitario: 700 },
  { nombre: 'Golosinas mesa dulce', unidad: 'kg', costo_unitario: 6500 }
];

// Cantidad de cada insumo por invitado según el paquete (nombre de insumo -> cantidad)
const INSUMOS_POR_PAQUETE = {
  'Cumpleaños Clásico — 3 h': { 'Porciones de pizza': 2, 'Gaseosa 1,5 L': 0.25, 'Vasos descartables': 2, 'Platos descartables': 1, 'Servilletas': 0.1, 'Torta (porción)': 1 },
  'Cumpleaños Full — 4 h': { 'Porciones de pizza': 3, 'Gaseosa 1,5 L': 0.35, 'Vasos descartables': 3, 'Platos descartables': 2, 'Servilletas': 0.15, 'Torta (porción)': 1 },
  'Cumpleaños Premium — 4 h': { 'Porciones de pizza': 3, 'Gaseosa 1,5 L': 0.4, 'Vasos descartables': 3, 'Platos descartables': 2, 'Servilletas': 0.15, 'Torta (porción)': 1, 'Golosinas mesa dulce': 0.05 },
  'Personalizado': { 'Porciones de pizza': 3, 'Gaseosa 1,5 L': 0.35, 'Vasos descartables': 3, 'Platos descartables': 2, 'Servilletas': 0.15 }
};

const COORDINADORES = [
  { nombre: 'Sofía Paz', telefono: '3515551201', tarifa_hora: 9000 },
  { nombre: 'Tomás Acosta', telefono: '3515551202', tarifa_hora: 9000 },
  { nombre: 'Lucía Medina', telefono: '3515551203', tarifa_hora: 9500 },
  { nombre: 'Bruno Herrera', telefono: '3515551204', tarifa_hora: 8500 },
  { nombre: 'Valentina Torres', telefono: '3515551205', tarifa_hora: 9000 },
  { nombre: 'Joaquín Molina', telefono: '3515551206', tarifa_hora: 8500 }
];

const CLIENTES = [
  ['María', 'Gómez', '32145876', '351 500-1234', 'maria.gomez@mail.com'],
  ['Laura', 'Pérez', '30111222', '351 500-2233', 'laura.perez@mail.com'],
  ['Pablo', 'Ruiz', '29876543', '351 500-3344', 'pablo.ruiz@mail.com'],
  ['Andrea', 'Díaz', '33444555', '351 500-4455', 'andrea.diaz@mail.com'],
  ['Gustavo', 'Sosa', '28765432', '351 500-5566', ''],
  ['Natalia', 'Luna', '34555666', '351 500-6677', 'nati.luna@mail.com'],
  ['Federico', 'Vera', '31222333', '351 500-7788', 'fede.vera@mail.com'],
  ['Romina', 'Ortiz', '35666777', '351 500-8899', 'romi.ortiz@mail.com'],
  ['Hernán', 'Bravo', '27654321', '351 500-9900', ''],
  ['Julieta', 'Ríos', '36777888', '351 501-0011', 'juli.rios@mail.com'],
  ['Carolina', 'Castro', '33999000', '351 501-1122', 'caro.castro@mail.com'],
  ['Ezequiel', 'Romero', '30555444', '351 501-2233', '']
];

// Fecha local AAAA-MM-DD sumando días a hoy
function fechaRelativa(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

// Días que faltan hasta el próximo sábado (0 si hoy es sábado) más n semanas
function proximoSabado(semanas = 0) {
  const diaSemana = new Date().getDay(); // 0 domingo ... 6 sábado
  return ((6 - diaSemana + 7) % 7) + semanas * 7;
}

async function insertarFilas(tabla, filas) {
  const insertadas = [];
  for (const fila of filas) {
    const columnas = Object.keys(fila);
    const valores = Object.values(fila);
    const marcadores = valores.map((_, indice) => `$${indice + 1}`).join(', ');
    const resultado = await conexion.query(
      `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores}) RETURNING *`, valores
    );
    insertadas.push(resultado.rows[0]);
  }
  return insertadas;
}

async function sembrarSistema() {
  try {
    console.log('--- Sembrado del Sistema de Gestión ---');
    await crearEsquema();
    console.log('Esquema creado o actualizado.');

    // El admin original pasa a ser el usuario de Gerencia
    await conexion.query(`UPDATE usuarios SET perfil = 'gerencia', nombre = COALESCE(nombre, 'Juan Pedro Muñoz') WHERE nombre_usuario = 'admin'`);

    const yaSembrado = await conexion.query('SELECT COUNT(*)::int AS cantidad FROM paquetes');
    if (yaSembrado.rows[0].cantidad > 0) {
      console.log('El sistema ya tiene datos de ejemplo. No se insertarán duplicados.');
      return;
    }

    const salas = (await conexion.query('SELECT * FROM salas ORDER BY id')).rows;
    if (salas.length === 0) {
      console.log('No hay salas. Ejecutá primero "node src/seed.mjs".');
      return;
    }

    // --- Usuarios por perfil ---
    const usuarios = {};
    const admin = (await conexion.query(`SELECT id FROM usuarios WHERE nombre_usuario = 'admin'`)).rows[0];
    usuarios.gerencia = admin?.id ?? null;
    for (const datos of USUARIOS) {
      const existente = (await conexion.query('SELECT id FROM usuarios WHERE nombre_usuario = $1', [datos.nombre_usuario])).rows[0];
      if (existente) {
        usuarios[datos.perfil] = existente.id;
        continue;
      }
      const hash = await bcrypt.hash(datos.contrasena, 10);
      const [creado] = await insertarFilas('usuarios', [{
        nombre_usuario: datos.nombre_usuario, contrasena_hash: hash, nombre: datos.nombre, perfil: datos.perfil
      }]);
      usuarios[datos.perfil] = creado.id;
      console.log(`Usuario creado: ${datos.nombre_usuario} / ${datos.contrasena} (${datos.perfil})`);
    }

    // --- Catálogos ---
    const paquetes = await insertarFilas('paquetes', PAQUETES.map(p => ({ es_personalizado: false, ...p })));
    const adicionales = await insertarFilas('adicionales', ADICIONALES);
    const insumos = await insertarFilas('insumos', INSUMOS);
    const coordinadores = await insertarFilas('coordinadores', COORDINADORES);
    for (const paquete of paquetes) {
      for (const [nombreInsumo, cantidad] of Object.entries(INSUMOS_POR_PAQUETE[paquete.nombre] || {})) {
        const insumo = insumos.find(i => i.nombre === nombreInsumo);
        await insertarFilas('paquetes_insumos', [{ paquete_id: paquete.id, insumo_id: insumo.id, cantidad_por_persona: cantidad }]);
      }
    }
    console.log('Catálogos cargados: paquetes, adicionales, insumos y coordinadores.');

    // --- Clientes ---
    const clientes = await insertarFilas('clientes', CLIENTES.map(([nombre, apellido, dni, telefono, email]) => ({
      nombre, apellido, dni, telefono, email: email || null, creado_por: usuarios.ventas
    })));

    const cliente = (apellido) => clientes.find(c => c.apellido === apellido);
    const paquete = (inicio) => paquetes.find(p => p.nombre.startsWith(inicio));
    const sala = (indice) => salas[indice % salas.length];

    // --- Reservas de ejemplo ---
    // estado final, días desde hoy, sala, horario, cliente, paquete, personas, y datos del evento si ya ocurrió
    const sab = proximoSabado();
    const RESERVAS = [
      // Eventos pasados, ya liquidados (alimentan los reportes)
      { estado: 'realizada', dias: -52, sala: 0, desde: '11:00', hasta: '15:00', cliente: 'Castro', paquete: 'Cumpleaños Full', personas: 35, ninos: 28, adultos: 12, consumos: [['Porción de pizza extra', 20], ['Bebida extra (1,5 L)', 4]] },
      { estado: 'realizada', dias: -45, sala: 2, desde: '16:00', hasta: '20:00', cliente: 'Romero', paquete: 'Cumpleaños Premium', personas: 45, ninos: 40, adultos: 9, consumos: [['Hora adicional de salón', 1], ['Show de magia', 1]] },
      { estado: 'realizada', dias: -38, sala: 1, desde: '17:00', hasta: '20:00', cliente: 'Ríos', paquete: 'Cumpleaños Clásico', personas: 25, ninos: 22, adultos: 6, consumos: [['Combo papas y salchichas', 6]] },
      { estado: 'realizada', dias: -24, sala: 0, desde: '11:00', hasta: '15:00', cliente: 'Gómez', paquete: 'Cumpleaños Full', personas: 30, ninos: 25, adultos: 5, consumos: [['Porción de pizza extra', 15]] },
      { estado: 'realizada', dias: -17, sala: 3, desde: '16:00', hasta: '20:00', cliente: 'Pérez', paquete: 'Cumpleaños Full', personas: 40, ninos: 33, adultos: 14, consumos: [['Bebida extra (1,5 L)', 6], ['Souvenirs extra', 10]] },
      { estado: 'realizada', dias: -10, sala: 1, desde: '11:00', hasta: '14:00', cliente: 'Bravo', paquete: 'Cumpleaños Clásico', personas: 28, ninos: 24, adultos: 4, consumos: [] },
      { estado: 'cancelada', dias: -5, sala: 2, desde: '16:00', hasta: '20:00', cliente: 'Sosa', paquete: 'Cumpleaños Full', personas: 30, motivo: 'El cliente cambió de fecha por viaje familiar.' },

      // Hoy: uno listo para habilitar y otro ya en curso, para probar M3 y la liquidación
      { estado: 'confirmada', dias: 0, sala: 0, desde: '17:00', hasta: '21:00', cliente: 'Luna', paquete: 'Cumpleaños Full', personas: 30, coordinadores: 2 },
      { estado: 'en_curso', dias: 0, sala: 1, desde: '11:00', hasta: '15:00', cliente: 'Vera', paquete: 'Cumpleaños Premium', personas: 40, ninos: 34, adultos: 12, consumos: [['Porción de pizza extra', 12]], coordinadores: 3, insumos: true },

      // Próximos fines de semana
      { estado: 'confirmada', dias: sab, sala: 0, desde: '11:00', hasta: '15:00', cliente: 'Gómez', paquete: 'Cumpleaños Full', personas: 40, coordinadores: 2, insumos: true },
      { estado: 'confirmada', dias: sab, sala: 1, desde: '16:00', hasta: '20:00', cliente: 'Ruiz', paquete: 'Cumpleaños Clásico', personas: 25 },
      { estado: 'presenada', dias: sab + 1, sala: 0, desde: '16:00', hasta: '20:00', cliente: 'Pérez', paquete: 'Cumpleaños Full', personas: 35 },
      { estado: 'confirmada', dias: sab + 7, sala: 0, desde: '11:00', hasta: '15:00', cliente: 'Ruiz', paquete: 'Cumpleaños Full', personas: 30 },
      { estado: 'presenada', dias: sab + 7, sala: 2, desde: '17:00', hasta: '21:00', cliente: 'Díaz', paquete: 'Cumpleaños Premium', personas: 45 },
      { estado: 'confirmada', dias: sab + 4, sala: 3, desde: '16:00', hasta: '20:00', cliente: 'Sosa', paquete: 'Cumpleaños Full', personas: 30 },
      { estado: 'confirmada', dias: sab + 14, sala: 0, desde: '11:00', hasta: '15:00', cliente: 'Luna', paquete: 'Cumpleaños Clásico', personas: 22 },
      { estado: 'confirmada', dias: sab + 15, sala: 1, desde: '16:00', hasta: '20:00', cliente: 'Vera', paquete: 'Cumpleaños Full', personas: 32 },
      { estado: 'presenada', dias: sab + 21, sala: 0, desde: '11:00', hasta: '15:00', cliente: 'Ortiz', paquete: 'Cumpleaños Full', personas: 30 },
      { estado: 'confirmada', dias: sab + 28, sala: 2, desde: '11:00', hasta: '15:00', cliente: 'Bravo', paquete: 'Cumpleaños Premium', personas: 40 }
    ];

    let indiceCoordinador = 0;
    for (const datos of RESERVAS) {
      const fecha = fechaRelativa(datos.dias);
      const elPaquete = paquete(datos.paquete);
      const importeEstimado = precioPara(elPaquete, datos.personas);
      const sena = senaPara(importeEstimado);
      // Las preseñadas se dan de alta "ayer" para que no expiren enseguida (RN03)
      const diasAlta = datos.estado === 'presenada' ? 1 : Math.max(20, -datos.dias + 20);

      const [reserva] = await insertarFilas('reservas', [{
        sala_id: sala(datos.sala).id, cliente_id: cliente(datos.cliente).id, paquete_id: elPaquete.id,
        fecha, hora_inicio: datos.desde, hora_fin: datos.hasta, estado: datos.estado,
        personas_contratadas: datos.personas, importe_estimado: importeEstimado, sena_requerida: sena,
        motivo_cancelacion: datos.motivo || null, creado_por: usuarios.ventas
      }]);
      await conexion.query(`UPDATE reservas SET fecha_alta = NOW() - ($1 || ' days')::interval WHERE id = $2`, [diasAlta, reserva.id]);

      const historial = [['alta', usuarios.ventas, `Reserva creada para el ${fecha} de ${datos.desde} a ${datos.hasta}. Paquete ${elPaquete.nombre}, ${datos.personas} personas.`]];
      const pagos = [];

      if (['confirmada', 'en_curso', 'realizada'].includes(datos.estado)) {
        pagos.push({ tipo: 'sena', monto: sena, medio: 'transferencia', comprobante: `TRF-${100000 + reserva.id}`, dias: datos.dias - 14 });
        historial.push(['confirmacion', usuarios.ventas, 'Seña cubierta. La reserva pasó a Confirmada.']);
      }
      if (datos.estado === 'cancelada') {
        historial.push(['cancelacion', usuarios.ventas, `Motivo: ${datos.motivo}`]);
      }

      // Evento ya ocurrido o en curso: asistentes y consumos (M3)
      let totalConsumos = 0;
      if (['en_curso', 'realizada'].includes(datos.estado)) {
        await insertarFilas('eventos', [{
          reserva_id: reserva.id, habilitado_por: usuarios.encargado, ninos_reales: datos.ninos, adultos_reales: datos.adultos,
          asistentes_actualizado_en: new Date(), asistentes_actualizado_por: usuarios.encargado
        }]);
        historial.push(['habilitacion', usuarios.encargado, 'Evento habilitado. La reserva pasó a En curso.']);
        historial.push(['asistentes', usuarios.encargado, `Asistentes reales: ${datos.ninos} niños y ${datos.adultos} adultos.`]);
        for (const [nombreAdicional, cantidad] of datos.consumos || []) {
          const adicional = adicionales.find(a => a.nombre === nombreAdicional);
          await insertarFilas('consumos', [{
            reserva_id: reserva.id, adicional_id: adicional.id, descripcion: adicional.nombre, cantidad,
            precio_unitario: adicional.precio, registrado_por: usuarios.encargado
          }]);
          totalConsumos += cantidad * Number(adicional.precio);
          historial.push(['consumo', usuarios.encargado, `${cantidad} × ${adicional.nombre}`]);
        }
      }

      // Liquidación final de los eventos pasados (M4)
      if (datos.estado === 'realizada') {
        const asistentes = datos.ninos + datos.adultos;
        const excedente = Math.max(0, asistentes - datos.personas);
        const montoExcedente = excedente * Number(elPaquete.tarifa_excedente);
        const total = importeEstimado + montoExcedente + totalConsumos;
        pagos.push({ tipo: 'saldo', monto: total - sena, medio: datos.dias % 2 === 0 ? 'efectivo' : 'mercado_pago', comprobante: datos.dias % 2 === 0 ? null : `MP-${900000 + reserva.id}`, dias: datos.dias });
        await insertarFilas('liquidaciones', [{
          reserva_id: reserva.id, presupuesto: importeEstimado, personas_contratadas: datos.personas, asistentes_reales: asistentes,
          excedente_personas: excedente, monto_excedente: montoExcedente, monto_adicionales: totalConsumos, total,
          total_pagado: total, saldo: 0, emitida_por: usuarios.encargado
        }]);
        historial.push(['liquidacion', usuarios.encargado, `Liquidación final emitida por $${total.toLocaleString('es-AR')}. Evento cerrado.`]);
      }

      for (const pago of pagos) {
        await insertarFilas('pagos', [{
          reserva_id: reserva.id, tipo: pago.tipo, monto: pago.monto, medio: pago.medio, comprobante: pago.comprobante,
          fecha_pago: fechaRelativa(Math.min(0, pago.dias)), registrado_por: pago.tipo === 'saldo' ? usuarios.encargado : usuarios.ventas
        }]);
      }

      // Coordinadores e insumos para los eventos que lo piden
      for (let i = 0; i < (datos.coordinadores || 0); i++) {
        const coordinador = coordinadores[indiceCoordinador++ % coordinadores.length];
        await insertarFilas('asignaciones', [{ reserva_id: reserva.id, coordinador_id: coordinador.id, asignado_por: usuarios.administracion }]);
      }
      if (datos.insumos) {
        const lineas = (await conexion.query(`
          SELECT pi.insumo_id, pi.cantidad_por_persona, i.costo_unitario
          FROM paquetes_insumos pi JOIN insumos i ON i.id = pi.insumo_id WHERE pi.paquete_id = $1
        `, [elPaquete.id])).rows;
        for (const linea of lineas) {
          const cantidad = Math.ceil(Number(linea.cantidad_por_persona) * datos.personas);
          const recibido = datos.estado === 'en_curso';
          await insertarFilas('pedidos_insumos', [{
            reserva_id: reserva.id, insumo_id: linea.insumo_id, cantidad, costo_estimado: cantidad * Number(linea.costo_unitario),
            recibido, costo_real: recibido ? cantidad * Number(linea.costo_unitario) : null,
            recibido_en: recibido ? new Date() : null, recibido_por: recibido ? usuarios.administracion : null,
            generado_por: usuarios.administracion
          }]);
        }
      }

      for (const [accion, usuarioId, detalle] of historial) {
        await insertarFilas('reservas_historial', [{ reserva_id: reserva.id, usuario_id: usuarioId, accion, detalle }]);
      }
    }

    console.log(`Reservas de ejemplo cargadas: ${RESERVAS.length}.`);
    console.log('¡Sembrado del sistema completado!');
  } catch (error) {
    console.error('Error durante el sembrado del sistema:');
    console.error(error);
  } finally {
    await conexion.end();
    console.log('--- Conexión con la Base de Datos Cerrada ---');
  }
}

sembrarSistema();
