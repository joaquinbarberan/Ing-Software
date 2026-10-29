import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Copia de seguridad de la base de datos (RNF07) con pg_dump.
// Uso manual:  npm run backup
// Para que sea diaria, programarlo con el Programador de tareas de Windows (o cron en Linux)
// ejecutando "npm run backup" en la carpeta del proyecto una vez por día.
// Se conservan las últimas 30 copias en la carpeta backups/.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const carpeta = path.join(__dirname, '../backups');
const COPIAS_A_CONSERVAR = 30;

// pg_dump puede no estar en el PATH en Windows: se puede indicar la ruta en PG_DUMP
const pgDump = process.env.PG_DUMP || 'pg_dump';

fs.mkdirSync(carpeta, { recursive: true });
const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const archivo = path.join(carpeta, `${process.env.DB_DATABASE}-${marca}.dump`);

execFile(pgDump, [
  '-h', process.env.DB_HOST, '-p', String(process.env.DB_PORT), '-U', process.env.DB_USER,
  '-F', 'c', '-f', archivo, process.env.DB_DATABASE
], { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } }, (error, salida, errores) => {
  if (error) {
    console.error('No se pudo generar la copia de seguridad.');
    console.error(errores || error.message);
    if (error.code === 'ENOENT') {
      console.error('No se encontró pg_dump. Agregá en .env: PG_DUMP="C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe"');
    }
    process.exit(1);
  }

  // Borramos las copias más viejas
  const copias = fs.readdirSync(carpeta).filter(nombre => nombre.endsWith('.dump')).sort();
  copias.slice(0, Math.max(0, copias.length - COPIAS_A_CONSERVAR)).forEach(nombre => fs.unlinkSync(path.join(carpeta, nombre)));

  console.log(`Copia de seguridad generada: ${archivo}`);
  console.log('Para restaurarla: pg_restore -d diverty_park --clean <archivo>');
});
