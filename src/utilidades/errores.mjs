// Error de regla de negocio: lleva el código HTTP y, opcionalmente, datos extra para el frontend
// (por ejemplo, la reserva que ocupa la franja cuando hay superposición).
export class ErrorNegocio extends Error {
  constructor(estadoHttp, mensaje, extra = {}) {
    super(mensaje);
    this.estadoHttp = estadoHttp;
    this.extra = extra;
  }
}

// Envuelve un controlador async: si lanza un ErrorNegocio responde con su código,
// y cualquier otro error se registra en consola y responde 500.
// Así cada controlador no necesita repetir su propio try/catch.
export function manejar(funcion) {
  return async function (peticion, respuesta, siguiente) {
    try {
      await funcion(peticion, respuesta, siguiente);
    } catch (error) {
      if (error instanceof ErrorNegocio) {
        return respuesta.status(error.estadoHttp).json({ error: error.message, ...error.extra });
      }
      // Violación de UNIQUE en PostgreSQL (ej: DNI repetido)
      if (error.code === '23505') {
        return respuesta.status(409).json({ error: 'Ya existe un registro con esos datos.' });
      }
      // La base fue creada con una codificación que no admite algún carácter (ej: emojis en WIN1252)
      if (error.code === '22P05' || error.code === '22021') {
        return respuesta.status(400).json({ error: 'El texto tiene caracteres que no se pueden guardar (por ejemplo, emojis). Quitalos e intentá de nuevo.' });
      }
      console.error(`Error en ${peticion.method} ${peticion.originalUrl}:`, error);
      respuesta.status(500).json({ error: 'Hubo un problema en el servidor. Intentá nuevamente.' });
    }
  };
}

// Helpers de validación de datos que llegan en el cuerpo de la petición
export function entero(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : NaN;
}

export function importe(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : NaN;
}

export const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// Fecha de hoy en formato AAAA-MM-DD según la hora local del servidor (Córdoba)
export function hoy() {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}
