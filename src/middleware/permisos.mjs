// Middleware de permisos por perfil (RF12, RNF05).
// Se usa DESPUÉS de verificarToken, que deja los datos del usuario en peticion.usuario.
// Gerencia (dueño) tiene acceso a todo, por eso siempre se incluye.
//
// Ejemplo: enrutador.post('/', permitir('ventas', 'administracion'), controlador.crear)
export function permitir(...perfiles) {
  const autorizados = new Set(['gerencia', ...perfiles]);

  return function (peticion, respuesta, siguiente) {
    const perfil = peticion.usuario?.perfil;

    if (!autorizados.has(perfil)) {
      return respuesta.status(403).json({ error: 'Tu perfil no tiene permiso para realizar esta acción.' });
    }

    siguiente();
  };
}

// Versión para usar dentro de un controlador cuando el permiso depende de los datos
// (por ejemplo: sólo Administración puede cargar un paquete personalizado).
export function tienePermiso(usuario, ...perfiles) {
  return usuario?.perfil === 'gerencia' || perfiles.includes(usuario?.perfil);
}
