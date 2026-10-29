import conexion from '../conexion.bd.mjs';

// Modelo de Usuarios: contiene las consultas SQL para la tabla "usuarios"
// Nunca devolvemos el hash de la contraseña salvo en buscarPorNombre, que lo necesita el login.
const COLUMNAS_PUBLICAS = 'id, nombre_usuario, nombre, perfil, activo, creado_en';

const usuarioModelo = {

  // Busca un usuario por su nombre de usuario (para el login)
  async buscarPorNombre(nombreUsuario) {
    const consulta = 'SELECT * FROM usuarios WHERE nombre_usuario = $1';
    const resultado = await conexion.query(consulta, [nombreUsuario]);
    return resultado.rows[0]; // Devuelve el primer resultado o undefined
  },

  async obtenerPorId(id) {
    const resultado = await conexion.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1`, [id]);
    return resultado.rows[0];
  },

  async listar() {
    const resultado = await conexion.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios ORDER BY perfil, nombre_usuario`);
    return resultado.rows;
  },

  // Crea un nuevo usuario en la base de datos
  async crear(datos) {
    const consulta = `
      INSERT INTO usuarios (nombre_usuario, contrasena_hash, nombre, perfil, activo)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING ${COLUMNAS_PUBLICAS}
    `;
    const resultado = await conexion.query(consulta, [datos.nombre_usuario, datos.contrasena_hash, datos.nombre, datos.perfil]);
    return resultado.rows[0];
  },

  async actualizar(id, datos) {
    const resultado = await conexion.query(`
      UPDATE usuarios SET nombre = $1, perfil = $2, activo = $3 WHERE id = $4
      RETURNING ${COLUMNAS_PUBLICAS}
    `, [datos.nombre, datos.perfil, datos.activo, id]);
    return resultado.rows[0];
  },

  async cambiarContrasena(id, contrasenaHash) {
    await conexion.query('UPDATE usuarios SET contrasena_hash = $1 WHERE id = $2', [contrasenaHash, id]);
  },

  async contarGerentesActivos() {
    const resultado = await conexion.query("SELECT COUNT(*)::int AS cantidad FROM usuarios WHERE perfil = 'gerencia' AND activo");
    return resultado.rows[0].cantidad;
  }

};

export default usuarioModelo;
