# Ing-Software · Sistema de gestión Diverty Park

Sistema web de gestión para el salón de fiestas infantiles **Diverty Park** (Dikamen SA), desarrollado como proyecto de Prácticas Profesionalizantes 2026 por Joaquín Barberán, Lucas Bossi y Lisandro Muñoz.

Implementa los cuatro módulos del informe de análisis (secciones 7.2 y 12) más el paquete transversal de seguridad.

> 📋 **Historial de cambios:** cada mejora agregada (qué hace, archivos, endpoints y cómo probarla) está detallada en [`CAMBIOS.md`](CAMBIOS.md).

| Módulo | Casos de uso | Pantalla |
| --- | --- | --- |
| M1 Agenda y Reservas | CU-01 Consultar disponibilidad · CU-02 Registrar reserva · CU-03 Modificar o cancelar reserva · CU-04 Visualizar agenda · Atender solicitud web | Agenda, Consultar disponibilidad, Nueva reserva, Solicitudes web, ficha de reserva |
| M2 Clientes | CU-05 Registrar cliente · CU-06 Consultar historial | Clientes |
| M3 Gestión de Evento | CU-07 Habilitar evento · CU-08 Asistentes reales · CU-09 Consumos adicionales · CU-10 Coordinadores · CU-11 Insumos | Evento del día, Coordinadores, Insumos |
| M4 Caja y Cobros | CU-12 Presupuesto · CU-13 Seña y pagos · CU-14 Liquidación final · CU-15 Reportes | Caja y cobros, Reportes |
| Seguridad y Usuarios | RF12 perfiles · RNF05 | Configuración › Usuarios |

## Requisitos

- Node.js 20 o superior
- PostgreSQL (probado con la versión 18)

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear la base de datos **en UTF-8** (en Windows, si no se indica, PostgreSQL puede crearla en WIN1252 y algunos caracteres no se pueden guardar):

   ```sql
   CREATE DATABASE diverty_park ENCODING 'UTF8' TEMPLATE template0;
   ```

3. Copiar `.env.example` a `.env` y completar la contraseña de PostgreSQL y una clave larga en `JWT_SECRETO`.

4. Crear las tablas y cargar los datos de ejemplo:

   ```bash
   npm run seed
   ```

5. Levantar el servidor:

   ```bash
   npm run dev
   ```

   Sitio público: http://localhost:3000 · Sistema de gestión: http://localhost:3000/login.html

Al arrancar, el servidor crea las tablas que falten, así que el sistema funciona aunque no se haya corrido el seed (pero sin datos de ejemplo).

## Usuarios de prueba

Los crea `npm run seed`. Son contraseñas de ejemplo: cambiarlas antes de usar el sistema en el salón.

| Usuario | Contraseña | Perfil | Ve |
| --- | --- | --- | --- |
| `admin` | `admin123` | Gerencia | Todo, incluidos reportes y usuarios |
| `ventas` | `ventas2026` | Encargado de Ventas | Agenda, reservas, clientes, caja |
| `administracion` | `admin2026` | Administración | Todo menos usuarios |
| `encargado` | `salon2026` | Encargado de Salón | Evento del día, agenda (lectura), cobro del saldo |

Los datos de ejemplo se generan a partir de la fecha en que se ejecuta el seed: hay eventos pasados ya liquidados (para los reportes), uno de hoy en curso, otro de hoy listo para habilitar y reservas para los próximos fines de semana.

## Reservas: cómo funciona el circuito

1. **Cliente (página pública `reservas.html`):** elige el paquete y los invitados (ve el precio y la seña), un día en el calendario (verde = hay lugar) y un horario libre tocando un botón. Deja sus datos y se genera una **solicitud web**, que **no ocupa la fecha**.
2. **Ventas (sistema › Solicitudes web):** ve la solicitud con un contador en el menú, comprueba si el horario sigue libre y con **Crear reserva** abre "Nueva reserva" con todo precargado.
3. **Al guardar** se crea la reserva *Preseñada* (RN01 se vuelve a verificar) y la solicitud queda marcada como atendida.

En "Nueva reserva", "Modificar reserva" y "Consultar disponibilidad" los horarios libres aparecen como botones: no hace falta tipear horas. Para un caso especial queda "Otro horario (cargar a mano)".

## Reglas de negocio implementadas

- **RN01**: una sala no admite dos reservas vigentes que se superpongan. La verificación se repite al guardar y se bloquea la combinación sala + fecha durante la transacción, para que dos operadores no puedan tomar la misma franja al mismo tiempo (CU-02, E1).
- **RN02 / RN03**: la reserva nace *Preseñada*; pasa a *Confirmada* cuando los pagos cubren la seña (30 %) y *expira* sola a las 72 horas sin seña, liberando la fecha.
- **RN08**: *Realizada*, *Cancelada* y *Expirada* son estados terminales: la reserva queda en sólo lectura y cualquier corrección se registra como un ajuste.
- **RN09 / RNF06**: los pagos y consumos no se borran, se anulan con usuario, fecha y motivo. Todo cambio de una reserva queda en su historial.
- **Horarios libres**: sólo se ofrecen inicios en los que el evento entra completo (según la duración del paquete) sin pisarse con otro, entre las 09:00 y las 23:00. En la web, cada una hora y con 2 h de anticipación para el mismo día. En el sistema, cada 30 minutos.
- **Solicitudes web**: no bloquean la fecha. Se convierten en reserva una sola vez (dentro de la misma transacción) o se descartan con motivo.
- **RF09**: liquidación final = presupuesto + excedente de personas + consumos adicionales − pagos. No se puede liquidar sin cargar antes el conteo real de asistentes.

## API

Todas las rutas del sistema están bajo `/api/v1` y requieren sesión (cookie httpOnly con JWT). Los permisos por perfil se controlan en `src/middleware/permisos.mjs`.

| Módulo | Rutas principales |
| --- | --- |
| M1 | `GET /agenda`, `GET /agenda/disponibilidad`, `GET /agenda/horarios`, `GET /reservas/presupuesto`, `POST /reservas` (acepta `solicitud_id`), `GET/PUT /reservas/:id`, `POST /reservas/:id/cancelar`, `GET /solicitudes`, `GET /solicitudes/cantidad`, `GET /solicitudes/:id`, `POST /solicitudes/:id/descartar` |
| M2 | `GET/POST /clientes`, `GET /clientes/dni/:dni`, `GET/PUT /clientes/:id` |
| M3 | `GET /eventos/dia`, `POST /reservas/:id/habilitar`, `PUT /reservas/:id/asistentes`, `POST /reservas/:id/consumos`, `POST /consumos/:id/anular`, `GET /coordinadores/grilla`, `POST /reservas/:id/coordinadores`, `DELETE /asignaciones/:id`, `GET /insumos/pedidos`, `POST /reservas/:id/insumos/generar`, `POST /pedidos-insumos/:id/recibir` |
| M4 | `POST /reservas/:id/pagos`, `POST /pagos/:id/anular`, `POST /reservas/:id/liquidacion`, `GET /caja/movimientos`, `GET /caja/pendientes`, `GET /reportes` |
| Catálogos | `/catalogos/paquetes`, `/catalogos/adicionales`, `/catalogos/insumos`, `/catalogos/coordinadores` |
| Usuarios | `POST /usuarios/login`, `POST /usuarios/logout`, `GET /usuarios/verificar`, `POST /usuarios/mi-contrasena`, `GET/POST/PUT /usuarios` |

Rutas públicas sin sesión (para el sitio), ninguna devuelve datos de clientes:

| Ruta | Para qué |
| --- | --- |
| `GET /salas`, `GET /salas/:id` | Salas del sitio |
| `GET /paquetes` | Paquetes vigentes (sin el personalizado) |
| `GET /disponibilidad?fecha=&sala_id=` | Horarios ocupados de una sala |
| `GET /disponibilidad/mes?mes=AAAA-MM&paquete_id=&personas=` | Calendario: estado de cada día del mes |
| `GET /disponibilidad/dia?fecha=&paquete_id=&personas=` | Horarios libres de cada sala ese día |
| `POST /solicitudes` | El cliente deja una solicitud de reserva |

## Estructura

```text
src/
  app.mjs                 app de Express y montaje de rutas (la usa Vercel)
  servidor.mjs            arranque local con app.listen (npm run dev)
  conexion.bd.mjs         pool de PostgreSQL y helper de transacciones
  bd/esquema.mjs          creación de todas las tablas (idempotente)
  routers/                rutas por módulo
  controladores/          lógica de negocio (agenda.controller.mjs = GestorAgenda del diagrama de clases;
                          solicitudes.controller.mjs = solicitudes de la web)
  modelos/                consultas SQL
  middleware/             autenticación JWT y permisos por perfil
  utilidades/             cálculos (presupuesto, seña, liquidación) y manejo de errores
  seed*.mjs               datos iniciales
  backup.mjs              copia de seguridad con pg_dump (RNF07)
api/index.mjs            entrada de la función de Vercel
public/
  index.html, salas.html, reservas.html   sitio público (reservas.html = reserva en 4 pasos)
  login.html, sistema.html                sistema de gestión
  admin.html                              panel de salas (fotos y datos del sitio público)
  js/sistema/                             frontend del sistema (una vista por pantalla;
                                          vistas/componentes-horarios.js = botones de horarios libres)
CAMBIOS.md               registro detallado de cada mejora
```

## Copias de seguridad (RNF07)

```bash
npm run backup
```

Genera un archivo en `backups/` (se conservan las últimas 30). Si `pg_dump` no está en el PATH, indicar su ruta en `PG_DUMP` dentro de `.env`. Para que sea diaria, programar ese comando en el Programador de tareas de Windows.

## Despliegue en Vercel + Neon

La app de Express corre en Vercel como una función (`api/index.mjs`) y el sitio estático se sirve desde `public/` (ver `vercel.json`). Localmente se sigue usando `npm run dev` (`src/servidor.mjs`).

1. **Base de datos:** crear un proyecto en [Neon](https://neon.tech) y copiar la cadena de conexión *pooled* (la que tiene `-pooler` en el host).
2. **Cargar los datos iniciales** desde la compu, apuntando a Neon (una sola vez):
   ```bash
   DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require" npm run seed
   ```
3. **Vercel:** *Add New → Project*, importar el repo de GitHub y cargar las variables de entorno:
   - `DATABASE_URL`: la cadena de Neon
   - `JWT_SECRETO`: una clave larga y aleatoria (distinta de la local)
   - `FRONTEND_URL`: la URL del proyecto, por ejemplo `https://diverty-park.vercel.app`
   - `CRON_SECRET`: cualquier texto largo (protege la ruta del cron)
4. **Fotos de las salas:** en el proyecto de Vercel, *Storage → Create → Blob* y conectarlo al proyecto. Vercel agrega solo `BLOB_READ_WRITE_TOKEN`. Después, *Redeploy*.
5. Cada push a `main` despliega solo; cada rama tiene su propia URL de vista previa.

El cron diario (`/api/cron/expirar`) libera las reservas preseñadas vencidas. Además, la expiración se revisa en cada consulta a la agenda.

## Pendiente para próximas etapas

- Integración con la API de Mercado Pago (CU-A4). Hoy los pagos por Mercado Pago se registran a mano con su número de operación.
- Facturación electrónica, stock de depósito y portal de autogestión del cliente quedan fuera del alcance (sección 8.4 del informe).
