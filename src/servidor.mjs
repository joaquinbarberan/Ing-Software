import app, { prepararBase } from './app.mjs';
import { expirarPresenadas } from './controladores/agenda.controller.mjs';

// Arranque del servidor en la compu (npm run dev / npm start).
// En Vercel no se usa este archivo: la app corre como función desde api/index.mjs.
const PUERTO = process.env.PORT || 3000;

async function iniciar() {
  try {
    await prepararBase();
  } catch (error) {
    console.error('No se pudo conectar con PostgreSQL. Revisá DATABASE_URL o los datos DB_* del archivo .env.');
    console.error(error.message);
    process.exit(1);
  }

  // RN03: cada 10 minutos se liberan las reservas preseñadas con más de 72 horas sin seña
  setInterval(() => expirarPresenadas().catch(error => console.error('Error al expirar reservas:', error.message)), 10 * 60 * 1000);

  app.listen(PUERTO, () => {
    console.log(`Servidor corriendo en: http://localhost:${PUERTO}`);
    console.log(`Sistema de gestión: http://localhost:${PUERTO}/login.html`);
  });
}

iniciar();
