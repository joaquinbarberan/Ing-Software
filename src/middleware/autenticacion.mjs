import jwt from 'jsonwebtoken';

const CLAVE_SECRETA = process.env.JWT_SECRETO;

// Middleware que verifica si el usuario tiene un token JWT válido en su cookie
// Si el token es válido, deja pasar la petición; si no, devuelve un error 401
function verificarToken(peticion, respuesta, siguiente) {
  const token = peticion.cookies.token_acceso;

  // Si no hay cookie con el token, el usuario no está autenticado
  if (!token) {
    return respuesta.status(401).json({ error: 'Acceso denegado. Debes iniciar sesión.' });
  }

  try {
    // Verificamos y decodificamos el token usando la clave secreta
    const datosDecodificados = jwt.verify(token, CLAVE_SECRETA);

    // Guardamos los datos del usuario en la petición para usarlos en el controlador
    peticion.usuario = datosDecodificados;

    // Llamamos a la siguiente función de la cadena (el controlador)
    siguiente();
  } catch (error) {
    // Si el token expiró o es inválido, lo rechazamos
    return respuesta.status(401).json({ error: 'Token inválido o expirado. Volvé a iniciar sesión.' });
  }
}

export default verificarToken;
