import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import usuarioModelo from '../modelos/usuarios.model.mjs';

// Leemos la clave secreta desde las variables de entorno
const CLAVE_SECRETA = process.env.JWT_SECRETO;

const usuarioControlador = {

  // POST /api/v1/usuarios/login
  // Verifica las credenciales y, si son correctas, genera un token JWT en una cookie
  async login(peticion, respuesta) {
    try {
      const { nombre_usuario, contrasena } = peticion.body;

      // 1. Validamos que se enviaron los datos
      if (!nombre_usuario || !contrasena) {
        return respuesta.status(400).json({ error: 'El usuario y la contraseña son obligatorios.' });
      }

      // 2. Buscamos el usuario en la base de datos
      const usuario = await usuarioModelo.buscarPorNombre(nombre_usuario);
      if (!usuario) {
        return respuesta.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      }

      // 3. Comparamos la contraseña ingresada con el hash guardado en la BD
      const contrasenaCorrecta = await bcrypt.compare(contrasena, usuario.contrasena_hash);
      if (!contrasenaCorrecta) {
        return respuesta.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      }

      // 4. Generamos el token JWT con los datos del usuario (sin la contraseña)
      const datosToken = {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario
      };
      const token = jwt.sign(datosToken, CLAVE_SECRETA, { expiresIn: '8h' });

      // 5. Guardamos el token en una cookie httpOnly (no accesible desde JavaScript del navegador)
      respuesta.cookie('token_acceso', token, {
        httpOnly: true,  // Protege contra ataques XSS
        sameSite: 'strict', // Protege contra ataques CSRF
        maxAge: 8 * 60 * 60 * 1000 // 8 horas en milisegundos
      });

      respuesta.json({ mensaje: 'Inicio de sesión exitoso.', usuario: datosToken });

    } catch (error) {
      console.error('Error en login:', error);
      respuesta.status(500).json({ error: 'Hubo un problema al iniciar sesión.' });
    }
  },

  // POST /api/v1/usuarios/logout
  // Borra la cookie del token para cerrar la sesión
  logout(peticion, respuesta) {
    respuesta.clearCookie('token_acceso');
    respuesta.json({ mensaje: 'Sesión cerrada correctamente.' });
  },

  // GET /api/v1/usuarios/verificar
  // Confirma si el usuario tiene una sesión activa válida (lo llama el frontend al cargar admin.html)
  verificarSesion(peticion, respuesta) {
    // Si llegó hasta aquí, el middleware de autenticación ya validó el token
    respuesta.json({ autenticado: true, usuario: peticion.usuario });
  }

};

export default usuarioControlador;
