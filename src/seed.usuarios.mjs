import bcrypt from 'bcryptjs';
import conexion from './conexion.bd.mjs';

// Script para crear la tabla de usuarios y generar el usuario administrador inicial
async function crearTablaUsuarios() {
  try {
    console.log('--- Creando tabla de usuarios ---');

    // SQL para crear la tabla de usuarios
    const consultaCrearTabla = `
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre_usuario VARCHAR(100) NOT NULL UNIQUE,
        contrasena_hash VARCHAR(255) NOT NULL,
        creado_en TIMESTAMP DEFAULT NOW()
      );
    `;

    await conexion.query(consultaCrearTabla);
    console.log('Tabla "usuarios" creada o ya existente.');

    // Verificamos si ya existe un admin para no duplicar
    const verificacion = await conexion.query(
      "SELECT COUNT(*) FROM usuarios WHERE nombre_usuario = 'admin'"
    );
    const yaExiste = parseInt(verificacion.rows[0].count) > 0;

    if (yaExiste) {
      console.log('El usuario administrador ya existe. No se creará otro.');
      return;
    }

    // Hasheamos la contraseña antes de guardarla (nunca se guarda en texto plano)
    // El número 10 es el "saltRounds": cuántas veces se procesa el hash (más = más seguro pero más lento)
    const contrasenaHash = await bcrypt.hash('admin123', 10);

    await conexion.query(
      'INSERT INTO usuarios (nombre_usuario, contrasena_hash) VALUES ($1, $2)',
      ['admin', contrasenaHash]
    );

    console.log('Usuario administrador creado:');
    console.log('  Usuario: admin');
    console.log('  Contraseña: admin123');
    console.log('  (Recordá cambiarla en producción)');

  } catch (error) {
    console.error('Error al crear la tabla de usuarios:', error.message);
  } finally {
    await conexion.end();
    console.log('--- Conexión cerrada ---');
  }
}

crearTablaUsuarios();
