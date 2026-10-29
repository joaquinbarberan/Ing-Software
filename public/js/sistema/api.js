// Cliente de la API REST del sistema. Todas las pantallas pasan por acá.

// Error que representa una falta de conexión con el servidor (excepciones "sin conexión" de los casos de uso)
export class ErrorConexion extends Error {
  constructor() {
    super('No hay conexión con el servidor. Revisá la red e intentá de nuevo.');
    this.sinConexion = true;
  }
}

// Error que devuelve el servidor con su código HTTP y los datos extra (ej: el conflicto de superposición)
export class ErrorApi extends Error {
  constructor(estado, datos) {
    super(datos?.error || `Error ${estado}`);
    this.estado = estado;
    this.datos = datos || {};
  }
}

async function pedir(metodo, ruta, cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(`/api/v1${ruta}`, {
      method: metodo,
      credentials: 'include',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
  } catch {
    throw new ErrorConexion();
  }

  // Sesión vencida: volvemos al login
  if (respuesta.status === 401 && !ruta.startsWith('/usuarios/login')) {
    window.location.href = './login.html';
    throw new ErrorApi(401, { error: 'La sesión expiró.' });
  }

  let datos = null;
  try { datos = await respuesta.json(); } catch { /* respuesta sin cuerpo */ }
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, datos);
  return datos;
}

// Arma la query string ignorando los valores vacíos
export function query(parametros) {
  const texto = new URLSearchParams(Object.entries(parametros).filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')).toString();
  return texto ? `?${texto}` : '';
}

export const api = {
  get: (ruta) => pedir('GET', ruta),
  post: (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo),
  put: (ruta, cuerpo = {}) => pedir('PUT', ruta, cuerpo),
  delete: (ruta) => pedir('DELETE', ruta)
};
