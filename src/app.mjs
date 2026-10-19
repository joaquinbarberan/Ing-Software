import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import rutasSalas from './routers/salas.routers.mjs';
import rutasUsuarios from './routers/usuarios.routers.mjs';
import salaControlador from './controladores/salas.controller.mjs';
import verificarToken from './middleware/autenticacion.mjs';

const app = express();
const PUERTO = process.env.PORT || 3000;

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


// --- 4. RUTAS CRUD DE SALAS (protegidas con JWT) ---
// verificarToken actúa como "portero": si no hay token válido, rechaza la petición
app.use('/api/v1/salas', verificarToken, rutasSalas);


// --- 5. API PÚBLICA DE SOLO LECTURA (sin protección, para la web del cliente) ---
app.get('/salas', salaControlador.listarSalas);
app.get('/salas/:id', salaControlador.obtenerSala);


// --- 6. INICIO DEL SERVIDOR ---
app.listen(PUERTO, () => {
  console.log(`Servidor corriendo en: http://localhost:${PUERTO}`);
  console.log(`Panel de administración: http://localhost:${PUERTO}/login.html`);
});
