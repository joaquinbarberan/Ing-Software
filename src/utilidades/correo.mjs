import nodemailer from 'nodemailer';

// Envío de correos al cliente. Usa cualquier servidor SMTP (por ejemplo, una cuenta de Gmail
// con "contraseña de aplicación"), configurado con las variables SMTP_* del entorno.
// Si no están configuradas, el sistema sigue funcionando y sólo avisa que no se envió el correo.

const REMITENTE_DEFECTO = 'Diverty Park';
const WHATSAPP_SALON = '+54 9 351 378 5678';
const DIRECCION_SALON = 'Av. Rafael Núñez 6217, Argüello, Córdoba';

let transporte = null;

function obtenerTransporte() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;
  const puerto = Number(SMTP_PORT) || 587;
  transporte ||= nodemailer.createTransport({
    host: SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    // Si el servidor de correo no responde, la reserva no se queda esperando
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000
  });
  return transporte;
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pesos(monto) {
  return '$ ' + Number(monto || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

// '2026-11-15' -> 'domingo 15 de noviembre de 2026'
function fechaLarga(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function nombreSala(nombre) {
  return String(nombre || '').toLowerCase().replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

// Arma el recordatorio a partir del detalle de la reserva
export function armarRecordatorio(reserva, linkPago = null) {
  const cuando = fechaLarga(reserva.fecha);
  const sala = nombreSala(reserva.sala_nombre);
  const filas = [
    ['Fecha', cuando],
    ['Horario', `${reserva.hora_inicio} a ${reserva.hora_fin} hs`],
    ['Sala', sala],
    ...(reserva.paquete_nombre ? [['Paquete', reserva.paquete_nombre]] : []),
    ['Invitados', reserva.personas_contratadas],
    ['Importe estimado', pesos(reserva.importe_estimado)],
    ['Seña para confirmar (30 %)', pesos(reserva.sena_requerida)]
  ];
  const avisoSena = 'La fecha queda tomada por 72 horas. Si en ese plazo no se registra la seña, la reserva se cancela sola y la fecha vuelve a quedar libre.';

  return {
    asunto: `Tu reserva en Diverty Park: ${cuando}`,
    texto: [
      `Hola ${reserva.cliente_nombre}:`,
      '',
      `Registramos tu reserva N.º ${reserva.id} en Diverty Park. Te dejamos los datos como recordatorio:`,
      '',
      ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
      '',
      avisoSena,
      ...(linkPago ? ['', `Podés pagar la seña con Mercado Pago desde este link: ${linkPago}`] : []),
      '',
      `Dirección: ${DIRECCION_SALON}`,
      `WhatsApp: ${WHATSAPP_SALON}`
    ].join('\n'),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2b1b17">
        <div style="background:#d92332;color:#fff;padding:18px 22px;border-bottom:4px solid #ffc629">
          <strong style="font-size:20px">Diverty Park</strong>
        </div>
        <div style="padding:22px;border:1px solid #f0e2d3;border-top:none">
          <p style="margin-top:0">Hola ${escapar(reserva.cliente_nombre)}:</p>
          <p>Registramos tu reserva <strong>N.º ${escapar(reserva.id)}</strong>. Te dejamos los datos como recordatorio:</p>
          <table style="width:100%;border-collapse:collapse">
            ${filas.map(([etiqueta, valor]) => `
              <tr>
                <td style="padding:7px 0;border-bottom:1px solid #f0e2d3;color:#6e5d55">${escapar(etiqueta)}</td>
                <td style="padding:7px 0;border-bottom:1px solid #f0e2d3;text-align:right"><strong>${escapar(valor)}</strong></td>
              </tr>`).join('')}
          </table>
          <p style="background:#fff8ef;padding:12px;border-radius:6px">${escapar(avisoSena)}</p>
          ${linkPago ? `<p style="text-align:center;margin:20px 0"><a href="${escapar(linkPago)}" style="background:#009ee3;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Pagar la seña con Mercado Pago</a></p>` : ''}
          <p style="margin-bottom:0;color:#6e5d55;font-size:14px">
            ${escapar(DIRECCION_SALON)}<br>WhatsApp: ${escapar(WHATSAPP_SALON)}
          </p>
        </div>
      </div>`
  };
}

// Envía el recordatorio. Nunca lanza error: un problema con el correo no puede frenar una reserva.
// Devuelve { enviado, destinatario, motivo } para informarlo en pantalla y en el historial.
// El salón recibe una copia de cada recordatorio (MAIL_COPIA, o la misma casilla que envía)
function casillaDelSalon() {
  return process.env.MAIL_COPIA || process.env.MAIL_FROM || process.env.SMTP_USER || null;
}

export async function enviarRecordatorio(reserva, linkPago = null) {
  const destinatario = reserva.cliente_email || null;
  const servidor = obtenerTransporte();
  if (!servidor) {
    return destinatario
      ? { enviado: false, destinatario, motivo: 'El envío de correos no está configurado.' }
      : { enviado: false, motivo: 'El cliente no tiene correo cargado.' };
  }

  const copia = casillaDelSalon();
  // Sin correo del cliente, el salón igual recibe el aviso de la reserva nueva
  if (!destinatario && !copia) return { enviado: false, motivo: 'El cliente no tiene correo cargado.' };

  const { asunto, texto, html } = armarRecordatorio(reserva, linkPago);
  try {
    await servidor.sendMail({
      from: `"${process.env.MAIL_REMITENTE || REMITENTE_DEFECTO}" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
      to: destinatario || copia,
      // Copia oculta: el cliente no ve la casilla del salón, y si responde, la respuesta llega al salón
      ...(destinatario && copia && copia !== destinatario ? { bcc: copia, replyTo: copia } : {}),
      subject: destinatario ? asunto : `[Sin correo del cliente] ${asunto}`,
      text: texto,
      html
    });
    if (!destinatario) return { enviado: false, copia, motivo: 'El cliente no tiene correo cargado. Se envió sólo la copia al salón.' };
    return { enviado: true, destinatario, copia };
  } catch (error) {
    console.error('No se pudo enviar el recordatorio:', error.message);
    return { enviado: false, destinatario, motivo: 'El servidor de correo no aceptó el envío.' };
  }
}
