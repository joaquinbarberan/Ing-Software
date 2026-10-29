// Punto de entrada para Vercel: la app de Express completa corre como una función serverless.
// vercel.json redirige acá todas las rutas dinámicas (/api/*, /salas, /disponibilidad).
import app from '../src/app.mjs';

export default app;
