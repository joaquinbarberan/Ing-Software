import crypto from 'crypto';

// Integración con Mercado Pago (CU-A4, Incremento 4).
// Se usa Checkout Pro: el sistema genera un link de pago para la seña o el saldo de una reserva,
// el cliente paga desde ese link y Mercado Pago avisa al sistema (webhook) cuando el pago se aprueba.
//
// Variables de entorno:
//   MP_ACCESS_TOKEN     token de la cuenta del salón (Tus integraciones > Credenciales)
//   MP_WEBHOOK_SECRET   clave secreta de las notificaciones (opcional, recomendada)
//   FRONTEND_URL        dirección pública del sitio, para armar la URL del webhook y los regresos
//   MP_API_URL          sólo para pruebas: reemplaza https://api.mercadopago.com

const API = () => process.env.MP_API_URL || 'https://api.mercadopago.com';

export function mercadoPagoConfigurado() {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

async function llamar(metodo, ruta, cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(`${API()}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        // Evita que un reintento cree dos links iguales
        ...(metodo === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {})
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new Error('No se pudo conectar con Mercado Pago.');
  }
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(`Mercado Pago rechazó el pedido (${respuesta.status}${datos.message ? `: ${datos.message}` : ''}).`);
    error.estado = respuesta.status;
    throw error;
  }
  return datos;
}

// La reserva viaja en external_reference para saber a qué reserva corresponde cada pago
export function referenciaDe(reservaId) {
  return `reserva-${reservaId}`;
}

export function reservaDeReferencia(referencia) {
  const coincide = /^reserva-(\d+)$/.exec(referencia || '');
  return coincide ? Number(coincide[1]) : null;
}

// Crea el link de pago. Devuelve { id, url }.
export async function crearLinkDePago({ reservaId, concepto, monto, vence }) {
  const sitio = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const preferencia = await llamar('POST', '/checkout/preferences', {
    items: [{ id: referenciaDe(reservaId), title: concepto, quantity: 1, currency_id: 'ARS', unit_price: Number(monto) }],
    external_reference: referenciaDe(reservaId),
    statement_descriptor: 'DIVERTY PARK',
    ...(sitio && {
      notification_url: `${sitio}/api/mercadopago/webhook`,
      back_urls: { success: `${sitio}/index.html?pago=aprobado`, pending: `${sitio}/index.html?pago=pendiente`, failure: `${sitio}/index.html?pago=rechazado` },
      // Al aprobarse el pago, el cliente vuelve solo al sitio del salón
      auto_return: 'approved'
    }),
    // El link de la seña vence junto con la reserva preseñada (RN03)
    ...(vence && { expires: true, expiration_date_to: vence.toISOString() })
  });
  return { id: preferencia.id, url: preferencia.init_point };
}

export async function obtenerPago(pagoId) {
  return llamar('GET', `/v1/payments/${encodeURIComponent(pagoId)}`);
}

// Pagos de una reserva (para verificar a mano si el aviso de Mercado Pago no llegó)
export async function buscarPagosDeReserva(reservaId) {
  const datos = await llamar('GET', `/v1/payments/search?external_reference=${encodeURIComponent(referenciaDe(reservaId))}&sort=date_created&criteria=desc`);
  return datos.results || [];
}

// Valida la firma del aviso de Mercado Pago (encabezado x-signature).
// Si no hay clave configurada no se puede validar, pero igual es seguro: el pago se vuelve a
// consultar a la API de Mercado Pago con nuestro token antes de registrarlo.
export function firmaValida({ firma, idPedido, idDato }) {
  const secreto = process.env.MP_WEBHOOK_SECRET;
  if (!secreto) return true;
  const partes = Object.fromEntries(String(firma || '').split(',').map(par => par.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(String(idDato)) ? String(idDato).toLowerCase() : String(idDato);
  const manifiesto = `id:${id};request-id:${idPedido || ''};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', secreto).update(manifiesto).digest('hex');
  return esperado.length === partes.v1.length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(partes.v1));
}
