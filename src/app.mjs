import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import rutasSalas from './routers/salas.routers.mjs';
import rutasUsuarios from './routers/usuarios.routers.mjs';
import rutasAgenda from './routers/agenda.routers.mjs';
import rutasClientes from './routers/clientes.routers.mjs';
import rutasEventos from './routers/eventos.routers.mjs';
import rutasCaja from './routers/caja.routers.mjs';
import rutasCatalogos from './routers/catalogos.routers.mjs';
import rutasSolicitudes from './routers/solicitudes.routers.mjs';
import solicitudControlador from './controladores/solicitudes.controller.mjs';
import salaControlador from './controladores/salas.controller.mjs';
import agendaControlador, { expirarPresenadas } from './controladores/agenda.controller.mjs';
import verificarToken from './middleware/autenticacion.mjs';
import { crearEsquema } from './bd/esquema.mjs';

// La app se exporta sin arrancar el servidor:
//  - en la compu, src/servidor.mjs la pone a escuchar en un puerto (npm run dev / npm start)
//  - en Vercel, api/index.mjs la usa como función serverless
const app = express();

// El salón opera en hora de Córdoba. Vercel corre en UTC: sin esto, después de las 21 h
// "hoy" pasaría a ser el día siguiente (habilitar evento, fechas pasadas, etc.).
process.env.TZ ||= 'America/Argentina/Cordoba';

if (!process.env.JWT_SECRETO) {
  throw new Error('Falta JWT_SECRETO en las variables de entorno (copiá .env.example a .env y completalo).');
}

// Crea o completa las tablas que falten una sola vez por instancia del servidor,
// así el sistema arranca aunque no se haya corrido el seed.
let esquemaListo = null;
export function prepararBase() {
  esquemaListo ||= crearEsquema().catch((error) => {
    esquemaListo = null; // si falló, se reintenta en la próxima petición
    throw error;
  });
  return esquemaListo;
}

// --- 1. CORS ---
// En este proyecto el frontend y el backend corren en el mismo servidor Express,
// por lo tanto CORS no es estrictamente necesario (mismo origen).
// Lo habilitamos de forma restrictiva para estar preparados si en el futuro el
// frontend se despliega en un dominio separado del backend.
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true // Necesario para que las cookies httpOnly viajen entre dominios
}));

// --- 2. MIDDLEWARES GLOBALES ---
app.use(express.json());
app.use(cookieParser()); // Permite leer las cookies en req.cookies

// Rutas absolutas para archivos estáticos.
// En Vercel los sirve directamente su CDN (ver vercel.json); acá quedan para el entorno local.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rutaPublic = path.join(__dirname, '../public');

app.use(express.static(rutaPublic));
app.use('/recursos', express.static(rutaPublic));

// Antes de cualquier ruta dinámica nos aseguramos de que existan las tablas
app.use(async (peticion, respuesta, siguiente) => {
  try {
    await prepararBase();
    siguiente();
  } catch (error) {
    console.error('No se pudo preparar la base de datos:', error.message);
    respuesta.status(503).json({ error: 'No hay conexión con la base de datos. Intentá de nuevo en unos minutos.' });
  }
});


// --- 3. RUTAS DE AUTENTICACIÓN (públicas) ---
app.use('/api/v1/usuarios', rutasUsuarios);


// --- 4. TAREA PROGRAMADA (Vercel Cron) ---
// RN03: libera las reservas preseñadas con más de 72 horas sin seña.
// La expiración también se revisa en cada consulta a la agenda; esto es un respaldo diario.
app.get('/api/cron/expirar', async (peticion, respuesta) => {
  if (process.env.CRON_SECRET && peticion.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return respuesta.status(401).json({ error: 'No autorizado.' });
  }
  const vencidas = await expirarPresenadas();
  respuesta.json({ expiradas: vencidas.length });
});


// --- 5. RUTAS DEL SISTEMA DE GESTIÓN (protegidas con JWT) ---
// verificarToken actúa como "portero": si no hay token válido, rechaza la petición.
// Los permisos por perfil se controlan dentro de cada router.
app.use('/api/v1/salas', verificarToken, rutasSalas);
app.use('/api/v1/clientes', verificarToken, rutasClientes);
app.use('/api/v1/catalogos', verificarToken, rutasCatalogos);
app.use('/api/v1/solicitudes', verificarToken, rutasSolicitudes); // Solicitudes que llegan desde la web
app.use('/api/v1', verificarToken, rutasAgenda);   // M1 Agenda y Reservas
app.use('/api/v1', verificarToken, rutasEventos);  // M3 Gestión de Evento
app.use('/api/v1', verificarToken, rutasCaja);     // M4 Caja y Cobros

// Cualquier otra ruta de la API que no exista
app.use('/api', (peticion, respuesta) => {
  respuesta.status(404).json({ error: 'Ruta de la API inexistente.' });
});


// --- 6. API PÚBLICA DE SOLO LECTURA (sin protección, para la web del cliente) ---
app.get('/salas', salaControlador.listarSalas);
app.get('/salas/:id', salaControlador.obtenerSala);
app.get('/disponibilidad', agendaControlador.disponibilidadPublica);
// Página de reservas en pasos (ver CAMBIOS.md): paquetes, calendario del mes y horarios libres del día
app.get('/paquetes', agendaControlador.paquetesPublicos);
app.get('/disponibilidad/mes', agendaControlador.calendarioPublico);
app.get('/disponibilidad/dia', agendaControlador.horariosPublicos);
// El cliente deja una SOLICITUD (no una reserva): Ventas la revisa y la convierte en reserva
app.post('/solicitudes', solicitudControlador.crear);


// --- 7. MANEJO DE ERRORES GENERALES ---
// Por ejemplo, un cuerpo JSON mal formado o una imagen demasiado grande
app.use((error, peticion, respuesta, siguiente) => {
  if (error.type === 'entity.parse.failed') {
    return respuesta.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  if (error.code === 'LIMIT_FILE_SIZE') {
    return respuesta.status(400).json({ error: 'La imagen supera los 4 MB. Elegí una más liviana.' });
  }
  console.error('Error no controlado:', error);
  respuesta.status(500).json({ error: 'Hubo un problema en el servidor.' });
});

export default app;
