// Reglas de cálculo compartidas entre módulos (presupuesto, seña y liquidación final).

// Seña requerida para confirmar la reserva (prototipo de CU-02: 30 %)
export const PORCENTAJE_SENA = 0.30;

// Horario de atención del salón (lunes a domingo de 9:00 a 23:00)
export const HORA_APERTURA = '09:00';
export const HORA_CIERRE = '23:00';

export function redondear(monto) {
  return Math.round(monto * 100) / 100;
}

// Paquete.precioPara(personas): precio base + personas por encima de las incluidas × tarifa de excedente (RF05)
export function precioPara(paquete, personas) {
  const extra = Math.max(0, personas - paquete.personas_incluidas);
  return redondear(Number(paquete.precio_base) + extra * Number(paquete.tarifa_excedente));
}

export function senaPara(importe) {
  return redondear(importe * PORCENTAJE_SENA);
}

// Liquidación final (RF09):
// presupuesto + excedentes + adicionales − pagos realizados = saldo a cobrar
export function calcularLiquidacion({ reserva, evento, totalAdicionales, totalPagado }) {
  const asistentesReales = evento ? evento.ninos_reales + evento.adultos_reales : 0;
  // Si todavía no se cargaron asistentes no hay excedente que cobrar
  const excedentePersonas = evento ? Math.max(0, asistentesReales - reserva.personas_contratadas) : 0;
  const montoExcedente = redondear(excedentePersonas * Number(reserva.tarifa_excedente));
  const presupuesto = Number(reserva.importe_estimado);
  const total = redondear(presupuesto + montoExcedente + Number(totalAdicionales));

  return {
    presupuesto,
    personas_contratadas: reserva.personas_contratadas,
    asistentes_reales: asistentesReales,
    excedente_personas: excedentePersonas,
    tarifa_excedente: Number(reserva.tarifa_excedente),
    monto_excedente: montoExcedente,
    monto_adicionales: Number(totalAdicionales),
    total,
    total_pagado: Number(totalPagado),
    saldo: redondear(total - Number(totalPagado))
  };
}

// Convierte 'HH:MM' a minutos desde las 00:00, y al revés
export function aMinutos(hora) {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

export function aHora(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

// Busca el horario libre más cercano al pedido, dentro del horario de atención (CU-01, flujo A2).
// "ocupadas" son las franjas vigentes de la sala ese día. Prueba de a 30 minutos.
export function horarioLibreMasCercano(ocupadas, horaInicio, horaFin, minimoInicio = HORA_APERTURA) {
  const duracion = aMinutos(horaFin) - aMinutos(horaInicio);
  const pedido = aMinutos(horaInicio);
  const desde = Math.max(aMinutos(HORA_APERTURA), aMinutos(minimoInicio));
  const hasta = aMinutos(HORA_CIERRE) - duracion;

  let mejor = null;
  for (let inicio = Math.ceil(desde / 30) * 30; inicio <= hasta; inicio += 30) {
    const fin = inicio + duracion;
    const libre = ocupadas.every(r => aMinutos(r.hora_inicio) >= fin || aMinutos(r.hora_fin) <= inicio);
    if (libre && (mejor === null || Math.abs(inicio - pedido) < Math.abs(mejor - pedido))) {
      mejor = inicio;
    }
  }

  return mejor === null ? null : { hora_inicio: aHora(mejor), hora_fin: aHora(mejor + duracion) };
}

// --- Horarios libres (mejora de reservas, ver CAMBIOS.md) ---

// Cada cuántos minutos se ofrece un horario de inicio (09:00, 09:30, 10:00...)
export const PASO_HORARIOS = 30;

// Todos los horarios de inicio en los que entra un evento de "duracionMinutos" en la sala,
// sin pisarse con ninguna reserva vigente (RN01) y dentro del horario de atención.
// "ocupadas" son las franjas vigentes de la sala ese día ({ hora_inicio, hora_fin }).
// "minimoInicio" sirve para no ofrecer horarios que ya pasaron cuando la fecha es hoy.
// "paso": cada cuántos minutos se ofrece un inicio. Con paso de 60 (web pública, para no mostrar
// demasiados botones) se agregan igual los inicios justo al terminar otro evento, así no se pierde
// ningún hueco aprovechable (ej.: un evento termina 15:30 -> se ofrece 15:30).
export function horariosLibres(ocupadas, duracionMinutos, minimoInicio = HORA_APERTURA, paso = PASO_HORARIOS) {
  const desde = Math.max(aMinutos(HORA_APERTURA), aMinutos(minimoInicio));
  const hasta = aMinutos(HORA_CIERRE) - duracionMinutos;

  const candidatos = new Set();
  for (let inicio = Math.ceil(desde / paso) * paso; inicio <= hasta; inicio += paso) candidatos.add(inicio);
  ocupadas.forEach(r => {
    const finOcupada = aMinutos(r.hora_fin);
    if (finOcupada >= desde && finOcupada <= hasta) candidatos.add(finOcupada);
  });

  return [...candidatos].sort((a, b) => a - b)
    .filter(inicio => !ocupadas.some(r => aMinutos(r.hora_inicio) < inicio + duracionMinutos && aMinutos(r.hora_fin) > inicio))
    .map(inicio => ({ hora_inicio: aHora(inicio), hora_fin: aHora(inicio + duracionMinutos) }));
}
