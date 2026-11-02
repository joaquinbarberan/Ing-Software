import conexion from '../conexion.bd.mjs';

// Esquema completo del Sistema de Gestión Diverty Park.
// Todas las sentencias son idempotentes (IF NOT EXISTS), así que se puede ejecutar
// cada vez que arranca el servidor sin romper los datos existentes.
//
// Organización por módulo (ver Modelo de paquetes del informe, sección 11):
//   Seguridad y Usuarios -> usuarios
//   M1 Agenda y Reservas -> salas, paquetes, reservas, reservas_historial, solicitudes_reserva
//   M2 Clientes          -> clientes
//   M3 Gestión de Evento -> eventos, adicionales, consumos, coordinadores, asignaciones,
//                           insumos, paquetes_insumos, pedidos_insumos
//   M4 Caja y Cobros     -> pagos, liquidaciones

export const PERFILES = ['gerencia', 'ventas', 'administracion', 'encargado'];

// Estados de la clase Reserva (Figura 6 — Diagrama de estados)
export const ESTADOS_RESERVA = ['presenada', 'confirmada', 'en_curso', 'realizada', 'cancelada', 'expirada'];

// Estados que ocupan la franja horaria (RN01). Los terminales la liberan.
export const ESTADOS_QUE_BLOQUEAN = ['presenada', 'confirmada', 'en_curso'];

// Estados terminales: la reserva queda en sólo lectura (RN08)
export const ESTADOS_TERMINALES = ['realizada', 'cancelada', 'expirada'];

const sentencias = [
  // La base trabaja en hora de Córdoba (Neon usa UTC por defecto), así NOW() y CURRENT_DATE
  // coinciden con la hora del salón. Se configura en la base y no en cada conexión:
  // aplica a todas las conexiones nuevas, también las del pooler de Neon.
  `DO $$
   BEGIN
     EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Argentina/Cordoba');
   EXCEPTION WHEN insufficient_privilege THEN
     NULL; -- si el usuario no es dueño de la base, se sigue igual (sólo cambia la hora de NOW())
   END $$`,

  // --- SEGURIDAD Y USUARIOS ---
  `CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre_usuario VARCHAR(100) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    creado_en TIMESTAMP DEFAULT NOW()
  )`,
  // Columnas agregadas para los perfiles diferenciados (RF12)
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre VARCHAR(150)`,
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) NOT NULL DEFAULT 'gerencia'`,
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE`,

  // --- M1: SALAS (ya existía para el sitio público) ---
  `CREATE TABLE IF NOT EXISTS salas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    capacidad_ninos INT NOT NULL DEFAULT 0,
    capacidad_adultos INT NOT NULL DEFAULT 0,
    precio DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    descripcion TEXT,
    imagen VARCHAR(255),
    alt_imagen VARCHAR(255)
  )`,
// Precio de lunes a jueves
  `ALTER TABLE salas
   ADD COLUMN IF NOT EXISTS precio_lunes_jueves NUMERIC(12, 2)`,

  // Precio de viernes a domingo
  `ALTER TABLE salas
   ADD COLUMN IF NOT EXISTS precio_viernes_domingo NUMERIC(12, 2)`,

  // Copiamos el precio anterior para conservar los datos existentes.
  // Solo se ejecuta cuando las nuevas columnas todavía están vacías.
  `UPDATE salas
   SET precio_lunes_jueves = COALESCE(precio_lunes_jueves, precio),
       precio_viernes_domingo = COALESCE(precio_viernes_domingo, precio)
   WHERE precio_lunes_jueves IS NULL
      OR precio_viernes_domingo IS NULL`,

  `ALTER TABLE salas
   ALTER COLUMN precio_lunes_jueves SET DEFAULT 0`,

  `ALTER TABLE salas
   ALTER COLUMN precio_viernes_domingo SET DEFAULT 0`,

  `ALTER TABLE salas
   ALTER COLUMN precio_lunes_jueves SET NOT NULL`,

  `ALTER TABLE salas
   ALTER COLUMN precio_viernes_domingo SET NOT NULL`,

  // --- CONFIGURACIÓN GENERAL DE RESERVAS ---

  `CREATE TABLE IF NOT EXISTS configuracion_reservas (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    duracion_evento_minutos INT NOT NULL DEFAULT 150 CHECK (duracion_evento_minutos > 0),
    minutos_ingreso_anticipado INT NOT NULL DEFAULT 10 CHECK (minutos_ingreso_anticipado >= 0),
    minutos_tolerancia_salida INT NOT NULL DEFAULT 10 CHECK (minutos_tolerancia_salida >= 0),
    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  `INSERT INTO configuracion_reservas (
    id,
    duracion_evento_minutos,
    minutos_ingreso_anticipado,
    minutos_tolerancia_salida
  )
  VALUES (1, 150, 10, 10)
  ON CONFLICT (id) DO NOTHING`,
  // --- M2: CLIENTES ---
  `CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    dni VARCHAR(15) NOT NULL UNIQUE,
    telefono VARCHAR(40),
    email VARCHAR(150),
    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    creado_por INT REFERENCES usuarios(id)
  )`,

  // --- M1: PAQUETES ---
  `CREATE TABLE IF NOT EXISTS paquetes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,
    precio_base NUMERIC(12, 2) NOT NULL DEFAULT 0,
    personas_incluidas INT NOT NULL DEFAULT 0,
    duracion_horas INT NOT NULL DEFAULT 4,
    tarifa_excedente NUMERIC(12, 2) NOT NULL DEFAULT 0,
    es_personalizado BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE
  )`,

  // --- M1: RESERVAS ---
  `CREATE TABLE IF NOT EXISTS reservas (
    id SERIAL PRIMARY KEY,
    sala_id INT NOT NULL REFERENCES salas(id),
    cliente_id INT NOT NULL REFERENCES clientes(id),
    paquete_id INT NOT NULL REFERENCES paquetes(id),
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'presenada',
    personas_contratadas INT NOT NULL,
    importe_estimado NUMERIC(12, 2) NOT NULL,
    sena_requerida NUMERIC(12, 2) NOT NULL,
    observaciones TEXT,
    motivo_cancelacion TEXT,
    creado_por INT REFERENCES usuarios(id),
    fecha_alta TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT reservas_franja_valida CHECK (hora_fin > hora_inicio),
    CONSTRAINT reservas_estado_valido CHECK (estado IN ('presenada','confirmada','en_curso','realizada','cancelada','expirada'))
  )`,
  // --- MIGRACIÓN: RESERVAS SIN PAQUETES OBLIGATORIOS ---

  `ALTER TABLE reservas
   ALTER COLUMN paquete_id DROP NOT NULL`,

  `ALTER TABLE reservas
   ADD COLUMN IF NOT EXISTS ninos_contratados INTEGER`,

  `ALTER TABLE reservas
   ADD COLUMN IF NOT EXISTS adultos_contratados INTEGER`,

  `ALTER TABLE reservas
   ADD COLUMN IF NOT EXISTS precio_sala_aplicado NUMERIC(12,2)`,

  `CREATE INDEX IF NOT EXISTS idx_reservas_sala_fecha ON reservas (sala_id, fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_reservas_fecha ON reservas (fecha)`,
  
  // Trazabilidad de cada alta, modificación o cancelación (RNF06, R02.7, R03.6)
  `CREATE TABLE IF NOT EXISTS reservas_historial (
    id SERIAL PRIMARY KEY,
    reserva_id INT NOT NULL REFERENCES reservas(id),
    usuario_id INT REFERENCES usuarios(id),
    accion VARCHAR(40) NOT NULL,
    detalle TEXT,
    fecha TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Solicitudes de reserva que deja el cliente desde la página web (ver CAMBIOS.md).
  // NO es una reserva y NO bloquea la fecha: el área de Ventas la revisa y, si corresponde,
  // la convierte en reserva con CU-02 (el cliente sigue fuera de la frontera del sistema).
  `CREATE TABLE IF NOT EXISTS solicitudes_reserva (
    id SERIAL PRIMARY KEY,
    sala_id INT NOT NULL REFERENCES salas(id),
    paquete_id INT NOT NULL REFERENCES paquetes(id),
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    personas INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    dni VARCHAR(15) NOT NULL,
    telefono VARCHAR(40) NOT NULL,
    email VARCHAR(150),
    comentarios TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    reserva_id INT REFERENCES reservas(id),
    motivo_descarte TEXT,
    atendida_por INT REFERENCES usuarios(id),
    atendida_en TIMESTAMP,
    creada_en TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT solicitudes_estado_valido CHECK (estado IN ('pendiente','convertida','descartada')),
    CONSTRAINT solicitudes_franja_valida CHECK (hora_fin > hora_inicio)
  )`,
  // --- MIGRACIÓN: SOLICITUDES SIN PAQUETES OBLIGATORIOS ---

  `ALTER TABLE solicitudes_reserva
   ALTER COLUMN paquete_id DROP NOT NULL`,

  `ALTER TABLE solicitudes_reserva
   ADD COLUMN IF NOT EXISTS ninos INTEGER`,

  `ALTER TABLE solicitudes_reserva
   ADD COLUMN IF NOT EXISTS adultos INTEGER`,

  `ALTER TABLE solicitudes_reserva
   ADD COLUMN IF NOT EXISTS precio_sala_estimado NUMERIC(12,2)`,

  `ALTER TABLE solicitudes_reserva
   ADD COLUMN IF NOT EXISTS importe_estimado NUMERIC(12,2)`,

  `ALTER TABLE solicitudes_reserva
   ADD COLUMN IF NOT EXISTS sena_requerida NUMERIC(12,2)`,
  `CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_reserva (estado, fecha)`,

  // --- M3: GESTIÓN DE EVENTO ---
  `CREATE TABLE IF NOT EXISTS eventos (
    id SERIAL PRIMARY KEY,
    reserva_id INT NOT NULL UNIQUE REFERENCES reservas(id),
    habilitado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    habilitado_por INT REFERENCES usuarios(id),
    ninos_reales INT NOT NULL DEFAULT 0,
    adultos_reales INT NOT NULL DEFAULT 0,
    asistentes_actualizado_en TIMESTAMP,
    asistentes_actualizado_por INT REFERENCES usuarios(id)
  )`,

  `CREATE TABLE IF NOT EXISTS adicionales (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    precio NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unidad VARCHAR(30) NOT NULL DEFAULT 'unidad',
    activo BOOLEAN NOT NULL DEFAULT TRUE
  )`,
   // --- CONFIGURACIÓN DE ADICIONALES ---

  // Define cómo se cobra cada adicional
  `ALTER TABLE adicionales
   ADD COLUMN IF NOT EXISTS modalidad_cobro VARCHAR(20)
   NOT NULL DEFAULT 'cantidad'
   CHECK (modalidad_cobro IN ('cantidad', 'por_evento'))`,

  // Cantidad mínima que se puede contratar (ej. 20 pizzetas)
  `ALTER TABLE adicionales
   ADD COLUMN IF NOT EXISTS cantidad_minima NUMERIC(10,2)
   NOT NULL DEFAULT 1`,

  // Anticipación requerida para contratar
  `ALTER TABLE adicionales
   ADD COLUMN IF NOT EXISTS anticipacion_horas INTEGER
   NOT NULL DEFAULT 72`,

  // Los adicionales contratados no se pueden anular
  `ALTER TABLE adicionales
   ADD COLUMN IF NOT EXISTS anulable BOOLEAN
   NOT NULL DEFAULT FALSE`,

  // --- ADICIONALES CONTRATADOS EN RESERVAS ---

  `CREATE TABLE IF NOT EXISTS adicionales_contratados (
    id SERIAL PRIMARY KEY,

    solicitud_id INT REFERENCES solicitudes_reserva(id),
    reserva_id INT REFERENCES reservas(id),

    adicional_id INT NOT NULL REFERENCES adicionales(id),

    nombre VARCHAR(120) NOT NULL,
    unidad VARCHAR(30) NOT NULL DEFAULT 'unidad',
    modalidad_cobro VARCHAR(20) NOT NULL DEFAULT 'cantidad',

    cantidad NUMERIC(10,2) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,

    anticipacion_horas INTEGER NOT NULL DEFAULT 72,
    anulable BOOLEAN NOT NULL DEFAULT FALSE,

    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT adicional_contratado_origen
      CHECK (solicitud_id IS NOT NULL OR reserva_id IS NOT NULL),

    CONSTRAINT adicional_contratado_cantidad
      CHECK (cantidad > 0),

    CONSTRAINT adicional_contratado_importes
      CHECK (precio_unitario >= 0 AND subtotal >= 0)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_adicionales_solicitud
   ON adicionales_contratados(solicitud_id)`,

  `CREATE INDEX IF NOT EXISTS idx_adicionales_reserva
   ON adicionales_contratados(reserva_id)`,

  // Comanda digital: consumos cargados durante el evento (RF08). No se borran, se anulan (RN09).
  `CREATE TABLE IF NOT EXISTS consumos (
    id SERIAL PRIMARY KEY,
    reserva_id INT NOT NULL REFERENCES reservas(id),
    adicional_id INT REFERENCES adicionales(id),
    descripcion VARCHAR(200) NOT NULL,
    cantidad NUMERIC(10, 2) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12, 2) NOT NULL,
    registrado_por INT REFERENCES usuarios(id),
    registrado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    anulado BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_anulacion TEXT,
    anulado_por INT REFERENCES usuarios(id),
    anulado_en TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS coordinadores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(40),
    tarifa_hora NUMERIC(12, 2) NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE
  )`,

  `CREATE TABLE IF NOT EXISTS asignaciones (
    id SERIAL PRIMARY KEY,
    reserva_id INT NOT NULL REFERENCES reservas(id),
    coordinador_id INT NOT NULL REFERENCES coordinadores(id),
    asignado_por INT REFERENCES usuarios(id),
    asignado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (reserva_id, coordinador_id)
  )`,

  `CREATE TABLE IF NOT EXISTS insumos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    unidad VARCHAR(30) NOT NULL DEFAULT 'unidad',
    costo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE
  )`,

  // Qué insumos lleva cada paquete y en qué cantidad por invitado (RF13)
  `CREATE TABLE IF NOT EXISTS paquetes_insumos (
    paquete_id INT NOT NULL REFERENCES paquetes(id) ON DELETE CASCADE,
    insumo_id INT NOT NULL REFERENCES insumos(id),
    cantidad_por_persona NUMERIC(10, 2) NOT NULL,
    PRIMARY KEY (paquete_id, insumo_id)
  )`,

  `CREATE TABLE IF NOT EXISTS pedidos_insumos (
    id SERIAL PRIMARY KEY,
    reserva_id INT NOT NULL REFERENCES reservas(id),
    insumo_id INT NOT NULL REFERENCES insumos(id),
    cantidad NUMERIC(10, 2) NOT NULL,
    costo_estimado NUMERIC(12, 2) NOT NULL DEFAULT 0,
    recibido BOOLEAN NOT NULL DEFAULT FALSE,
    costo_real NUMERIC(12, 2),
    recibido_en TIMESTAMP,
    recibido_por INT REFERENCES usuarios(id),
    generado_por INT REFERENCES usuarios(id),
    generado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (reserva_id, insumo_id)
  )`,

  // --- M4: CAJA Y COBROS ---
  // Ningún pago se elimina: sólo se anula dejando usuario, fecha y motivo (RNF06, RN09)
  `CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    reserva_id INT NOT NULL REFERENCES reservas(id),
    tipo VARCHAR(20) NOT NULL,
    monto NUMERIC(12, 2) NOT NULL,
    medio VARCHAR(20) NOT NULL,
    comprobante VARCHAR(200),
    fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
    registrado_por INT REFERENCES usuarios(id),
    registrado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    anulado BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_anulacion TEXT,
    anulado_por INT REFERENCES usuarios(id),
    anulado_en TIMESTAMP,
    CONSTRAINT pagos_tipo_valido CHECK (tipo IN ('sena','parcial','saldo','ajuste')),
    CONSTRAINT pagos_medio_valido CHECK (medio IN ('efectivo','transferencia','mercado_pago','tarjeta')),
    CONSTRAINT pagos_monto_valido CHECK (monto <> 0)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pagos_reserva ON pagos (reserva_id)`,

  // Foto de la liquidación final al momento de emitirla (RF09)
  `CREATE TABLE IF NOT EXISTS liquidaciones (
    id SERIAL PRIMARY KEY,
    reserva_id INT NOT NULL UNIQUE REFERENCES reservas(id),
    presupuesto NUMERIC(12, 2) NOT NULL,
    personas_contratadas INT NOT NULL,
    asistentes_reales INT NOT NULL,
    excedente_personas INT NOT NULL,
    monto_excedente NUMERIC(12, 2) NOT NULL,
    monto_adicionales NUMERIC(12, 2) NOT NULL,
    total NUMERIC(12, 2) NOT NULL,
    total_pagado NUMERIC(12, 2) NOT NULL,
    saldo NUMERIC(12, 2) NOT NULL,
    emitida_por INT REFERENCES usuarios(id),
    emitida_en TIMESTAMP NOT NULL DEFAULT NOW()
  )`
];

// Crea (o completa) todas las tablas del sistema
export async function crearEsquema(bd = conexion) {
  for (const sentencia of sentencias) {
    await bd.query(sentencia);
  }
}
