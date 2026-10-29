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
import salaControlador from './controladores/salas.controller.mjs';
import agendaControlador, { expirarPresenadas } from './controladores/agenda.controller.mjs';
import verificarToken from './middleware/autenticacion.mjs';
import { crearEsquema } from './bd/esquema.mjs';

const app = express();
const PUERTO = process.env.PORT || 3000;

if (!process.env.JWT_SECRETO) {
  console.error('Falta JWT_SECRETO en el archivo .env (copiá .env.example y completalo).');
  process.exit(1);
}

// --- 1. CORS ---
// En este proyecto el frontend y el backend corren en el mismo servidor Express,
// por lo tanto CORS no es estrictamente necesario (mismo origen).
// Lo habilitamos de forma restrictiva para estar preparados si en el futuro el
// frontend se despliega en un dominio separado (ej: Vercel) y el backend en otro (ej: Render).
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true // Necesario para que las cookies httpOnly viajen entre dominios
}));

// --- 2. MIDDLEWARES GLOBALES ---
app.use(express.json());
app.use(cookieParser()); // Permite leer las cookies en req.cookies

// Rutas absolutas para archivos estáticos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rutaPublic = path.join(__dirname, '../public');

app.use(express.static(rutaPublic));
app.use('/recursos', express.static(rutaPublic));


// --- 3. RUTAS DE AUTENTICACIÓN (públicas) ---
app.use('/api/v1/usuarios', rutasUsuarios);


// --- 4. RUTAS DEL SISTEMA DE GESTIÓN (protegidas con JWT) ---
// verificarToken actúa como "portero": si no hay token válido, rechaza la petición.
// Los permisos por perfil se controlan dentro de cada router.
app.use('/api/v1/salas', verificarToken, rutasSalas);
app.use('/api/v1/clientes', verificarToken, rutasClientes);
app.use('/api/v1/catalogos', verificarToken, rutasCatalogos);
app.use('/api/v1', verificarToken, rutasAgenda);   // M1 Agenda y Reservas
app.use('/api/v1', verificarToken, rutasEventos);  // M3 Gestión de Evento
app.use('/api/v1', verificarToken, rutasCaja);     // M4 Caja y Cobros

// Cualquier otra ruta de la API que no exista
app.use('/api', (peticion, respuesta) => {
  respuesta.status(404).json({ error: 'Ruta de la API inexistente.' });
});


// --- 5. API PÚBLICA DE SOLO LECTURA (sin protección, para la web del cliente) ---
app.get('/salas', salaControlador.listarSalas);
app.get('/salas/:id', salaControlador.obtenerSala);
app.get('/disponibilidad', agendaControlador.disponibilidadPublica);


// --- 6. MANEJO DE ERRORES GENERALES ---
// Por ejemplo, un cuerpo JSON mal formado
app.use((error, peticion, respuesta, siguiente) => {
  if (error.type === 'entity.parse.failed') {
    return respuesta.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  console.error('Error no controlado:', error);
  respuesta.status(500).json({ error: 'Hubo un problema en el servidor.' });
});


// --- 7. INICIO DEL SERVIDOR ---
async function iniciar() {
  try {
    // Crea o completa las tablas que falten, así el sistema arranca aunque no se haya corrido el seed
    await crearEsquema();
  } catch (error) {
    console.error('No se pudo conectar con PostgreSQL. Revisá los datos DB_* del archivo .env.');
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
