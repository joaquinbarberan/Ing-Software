import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import usuarioModelo from '../modelos/usuarios.model.mjs';
import { PERFILES } from '../bd/esquema.mjs';
import { ErrorNegocio, manejar, entero } from '../utilidades/errores.mjs';

// Leemos la clave secreta desde las variables de entorno
const CLAVE_SECRETA = process.env.JWT_SECRETO;

const LARGO_MINIMO_CONTRASENA = 8;

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
      if (!usuario || !usuario.activo) {
        return respuesta.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      }

      // 3. Comparamos la contraseña ingresada con el hash guardado en la BD
      const contrasenaCorrecta = await bcrypt.compare(contrasena, usuario.contrasena_hash);
      if (!contrasenaCorrecta) {
        return respuesta.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      }

      // 4. Generamos el token JWT con los datos del usuario (sin la contraseña).
      // El perfil viaja en el token para que el middleware de permisos lo pueda consultar.
      const datosToken = {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        nombre: usuario.nombre,
        perfil: usuario.perfil
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
  // Confirma si el usuario tiene una sesión activa válida (lo llama el frontend al cargar el panel)
  verificarSesion(peticion, respuesta) {
    // Si llegó hasta aquí, el middleware de autenticación ya validó el token
    respuesta.json({ autenticado: true, usuario: peticion.usuario });
  },

  // --- ADMINISTRACIÓN DE USUARIOS (RF12, sólo Gerencia) ---

  // GET /api/v1/usuarios
  listar: manejar(async (peticion, respuesta) => {
    respuesta.json(await usuarioModelo.listar());
  }),

  // POST /api/v1/usuarios   { nombre_usuario, nombre, perfil, contrasena }
  crear: manejar(async (peticion, respuesta) => {
    const nombreUsuario = (peticion.body.nombre_usuario || '').trim().toLowerCase();
    const nombre = (peticion.body.nombre || '').trim();
    const { perfil, contrasena } = peticion.body;

    if (!/^[a-z0-9._-]{3,30}$/.test(nombreUsuario)) {
      throw new ErrorNegocio(400, 'El usuario debe tener entre 3 y 30 caracteres (letras, números, punto o guion).');
    }
    if (!nombre) throw new ErrorNegocio(400, 'Ingresá el nombre de la persona.');
    if (!PERFILES.includes(perfil)) throw new ErrorNegocio(400, 'Elegí un perfil válido.');
    if (!contrasena || contrasena.length < LARGO_MINIMO_CONTRASENA) {
      throw new ErrorNegocio(400, `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`);
    }
    if (await usuarioModelo.buscarPorNombre(nombreUsuario)) throw new ErrorNegocio(409, 'Ese nombre de usuario ya existe.');

    // Contraseña guardada cifrada (RNF05)
    const contrasenaHash = await bcrypt.hash(contrasena, 10);
    const usuario = await usuarioModelo.crear({ nombre_usuario: nombreUsuario, nombre, perfil, contrasena_hash: contrasenaHash });
    respuesta.status(201).json(usuario);
  }),

  // PUT /api/v1/usuarios/:id   { nombre, perfil, activo, contrasena? }
  actualizar: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const actual = await usuarioModelo.obtenerPorId(id);
    if (!actual) throw new ErrorNegocio(404, 'El usuario no existe.');

    const nombre = (peticion.body.nombre || '').trim();
    const perfil = peticion.body.perfil;
    const activo = peticion.body.activo !== false && peticion.body.activo !== 'false';
    if (!nombre) throw new ErrorNegocio(400, 'Ingresá el nombre de la persona.');
    if (!PERFILES.includes(perfil)) throw new ErrorNegocio(400, 'Elegí un perfil válido.');

    // Nunca puede quedar el sistema sin un usuario de Gerencia activo
    const dejaDeSerGerente = actual.perfil === 'gerencia' && actual.activo && (perfil !== 'gerencia' || !activo);
    if (dejaDeSerGerente && await usuarioModelo.contarGerentesActivos() <= 1) {
      throw new ErrorNegocio(409, 'Tiene que quedar al menos un usuario de Gerencia activo.');
    }

    const contrasena = peticion.body.contrasena;
    if (contrasena) {
      if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
        throw new ErrorNegocio(400, `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`);
      }
      await usuarioModelo.cambiarContrasena(id, await bcrypt.hash(contrasena, 10));
    }

    respuesta.json(await usuarioModelo.actualizar(id, { nombre, perfil, activo }));
  }),

  // Cualquier usuario puede cambiar su propia contraseña
  // POST /api/v1/usuarios/mi-contrasena   { actual, nueva }
  cambiarMiContrasena: manejar(async (peticion, respuesta) => {
    const { actual, nueva } = peticion.body;
    if (!nueva || nueva.length < LARGO_MINIMO_CONTRASENA) {
      throw new ErrorNegocio(400, `La contraseña nueva debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`);
    }
    const usuario = await usuarioModelo.buscarPorNombre(peticion.usuario.nombre_usuario);
    if (!usuario || !(await bcrypt.compare(actual || '', usuario.contrasena_hash))) {
      throw new ErrorNegocio(400, 'La contraseña actual no es correcta.');
    }
    await usuarioModelo.cambiarContrasena(usuario.id, await bcrypt.hash(nueva, 10));
    respuesta.json({ mensaje: 'Contraseña actualizada.' });
  })

};

export default usuarioControlador;
