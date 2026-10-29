import pg from 'pg';
import 'dotenv/config'; // Carga las variables de entorno desde el archivo .env

const { Pool, types } = pg;

// Por defecto "pg" convierte las columnas DATE en objetos Date de JavaScript usando la
// zona horaria local, lo que puede correr la fecha un día al serializarla a JSON.
// Las dejamos como texto 'AAAA-MM-DD', que es justamente lo que usa el frontend.
types.setTypeParser(1082, (valor) => valor);

// Las columnas NUMERIC (importes) llegan como texto para no perder precisión.
// Los montos del salón entran sin problema en un número de JavaScript, así que los convertimos.
types.setTypeParser(1700, (valor) => parseFloat(valor));

// Inicializamos el Pool de conexiones para PostgreSQL
// Este pool mantiene un conjunto de conexiones abiertas que se reutilizan.
// En producción (Vercel + Neon) se usa DATABASE_URL, la cadena de conexión que da Neon,
// que ya incluye usuario, contraseña, host y ?sslmode=require. En la compu se usan los datos DB_*.
const conexion = new Pool(process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      // En serverless cada instancia atiende pocas peticiones a la vez: alcanzan pocas conexiones
      max: 3,
      idleTimeoutMillis: 10000
    }
  : {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_DATABASE
    });

// Todas las conexiones trabajan en hora de Córdoba (Neon usa UTC por defecto).
// Así NOW() y CURRENT_DATE coinciden con la hora local del salón.
conexion.on('connect', (cliente) => {
  cliente.query("SET TIME ZONE 'America/Argentina/Cordoba'").catch(() => {});
});

// Ejecuta una función dentro de una transacción.
// Si la función lanza un error se hace ROLLBACK y no queda nada a medio guardar.
export async function enTransaccion(funcion) {
  const cliente = await conexion.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await funcion(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// Exportamos la conexión por defecto para poder utilizarla en los modelos
export default conexion;
