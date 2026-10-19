import conexion from '../conexion.bd.mjs';

// Modelo de Usuarios: contiene las consultas SQL para la tabla "usuarios"
const usuarioModelo = {

  // Busca un usuario por su nombre de usuario (para el login)
  async buscarPorNombre(nombreUsuario) {
    const consulta = 'SELECT * FROM usuarios WHERE nombre_usuario = $1';
    const resultado = await conexion.query(consulta, [nombreUsuario]);
    return resultado.rows[0]; // Devuelve el primer resultado o undefined
  },

  // Crea un nuevo usuario en la base de datos
  async crear(nombre_usuario, contrasena_hash) {
    const consulta = `
      INSERT INTO usuarios (nombre_usuario, contrasena_hash)
      VALUES ($1, $2)
      RETURNING id, nombre_usuario, creado_en
    `;
    const resultado = await conexion.query(consulta, [nombre_usuario, contrasena_hash]);
    return resultado.rows[0];
  }

};

export default usuarioModelo;
