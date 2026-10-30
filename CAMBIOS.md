# Registro de cambios · Sistema Diverty Park

Cada entrada describe qué se agregó o modificó, por qué, qué archivos toca y cómo probarlo.
Las entradas más nuevas van arriba.

---

## 29/10/2026 · Mejora del circuito de reservas (página pública + sistema interno)

**Autor:** Lucas Bossi (con asistencia de IA: Claude)
**Módulo del informe:** M1 Agenda y Reservas (CU-01, CU-02, CU-03) y M2 Clientes (CU-05)
**Requerimientos relacionados:** RF01, RF02, RF03, RF05 · RNF01 (carga de una reserva en menos de 2 minutos), RNF02 (uso desde celulares), RNF08 (protección de datos personales)

### Problema que resuelve

- **Página pública:** para ver si había lugar, el cliente tenía que elegir la hora con el selector del navegador (hora, después minutos, sin pasarse del horario), elegir la sala y la fecha "a ciegas" y recién al final enterarse si estaba libre. Si estaba ocupado, tenía que probar de nuevo.
- **Sistema interno:** en "Nueva reserva", "Consultar disponibilidad" y "Modificar reserva" pasaba lo mismo. Había que tipear *Desde* y *Hasta* y probar franja por franja.
- **Pedidos de la web:** los pedidos llegaban sólo por WhatsApp y Ventas tenía que volver a tipear todos los datos del cliente y del evento.

### Qué se agregó

#### 1. Página pública de reservas en 4 pasos (`public/reservas.html`)

| Paso | Qué ve el cliente |
| --- | --- |
| 1 · Paquete | Tarjetas con cada paquete (duración, qué incluye y precio). Un contador `−5  −  [30]  +  +5` para los invitados. Muestra al instante el **precio estimado** y la **seña del 30 %**, con la misma fórmula que el sistema (`Paquete.precioPara`). |
| 2 · Día | Un **calendario del mes** donde cada día aparece en verde (hay horarios), naranja (últimos horarios) o tachado (sin lugar). Los días pasados no se pueden tocar. |
| 3 · Horario | Las salas donde entran los invitados, **una abierta por vez**, con sus horarios libres como **botones** agrupados en Mañana, Tarde y Noche. Si una sala es chica para esa cantidad de invitados, se avisa y no se muestra. |
| 4 · Tus datos | Resumen de lo elegido (con enlaces "Cambiar"), nombre, apellido, DNI, teléfono y, opcionalmente, correo y comentarios. Al enviar se genera una **solicitud** y se ofrece un botón de WhatsApp con el mensaje ya escrito. |

Detalles:
- **Ya no hay que tipear horas.** Sólo aparecen horarios en los que el evento entra completo (según la duración del paquete), sin superponerse con otro (RN01) y dentro del horario de atención (09:00 a 23:00).
- En la web los horarios se ofrecen **cada una hora**, para no llenar la pantalla. También se ofrece el horario exacto en que termina otro evento (por ejemplo, 15:30), así no se pierde ningún hueco.
- Para el **mismo día**, sólo se ofrecen horarios con al menos 2 horas de anticipación.
- Si otra persona toma el horario mientras el cliente completa los datos, se le avisa y se le muestran los horarios que siguen libres.
- Funciona en celulares desde 360 px (RNF02). Se corrigió de paso el menú superior del sitio, que en celulares se salía de la pantalla.
- Leyenda de privacidad (Ley 25.326) en el formulario (RNF08).
- Protección básica contra abusos:
  - un campo "trampa" invisible contra robots,
  - un máximo de 5 envíos cada 10 minutos por conexión,
  - un máximo de 3 solicitudes pendientes por DNI,
  - si se aprieta "Enviar" dos veces, no se duplica la solicitud.

#### 2. Solicitudes web (nueva tabla `solicitudes_reserva`)

Lo que envía el cliente **es una solicitud, no una reserva**. **No ocupa la fecha.**
Esto respeta la frontera del sistema definida en el informe (sección 10.3): quien registra la reserva sigue siendo el área de Ventas.

Estados de una solicitud: `pendiente` → `convertida` (se creó la reserva) o `descartada` (con motivo obligatorio).

#### 3. Bandeja "Solicitudes web" en el sistema (`#/solicitudes`)

- Nuevo ítem del menú en *Agenda y reservas*, para Ventas, Administración y Gerencia. Tiene un **contador rojo** con las pendientes, que se actualiza cada 2 minutos y al cambiar de pantalla.
- Cada solicitud muestra:
  - fecha, horario, sala, paquete e invitados,
  - DNI, teléfono, correo y comentarios,
  - si el DNI **ya es cliente** (con enlace al historial),
  - si el **horario sigue libre** o ya se ocupó (se verifica en el momento).
- Botones:
  - **WhatsApp:** mensaje al cliente ya redactado.
  - **Descartar:** pide un motivo.
  - **Crear reserva:** abre "Nueva reserva" con **todo precargado** (cliente, fecha, sala, horario, paquete, invitados y comentarios).
- Al guardar esa reserva, la solicitud queda `convertida` **en la misma transacción** y en el historial de la reserva queda: *"Reserva generada a partir de la solicitud web N.º X"*. Si otro usuario ya la había atendido, no se crea una reserva duplicada.
- Filtros: Pendientes, Convertidas en reserva y Descartadas, con quién la atendió y cuándo.

#### 4. Horarios libres como botones en el sistema interno

Nuevo componente reutilizable `public/js/sistema/vistas/componentes-horarios.js`:

- **Nueva reserva (CU-02):**
  - Se elige fecha, sala y paquete y aparecen los horarios libres con la duración del paquete.
  - Un clic completa *Desde* y *Hasta* y se verifica la franja.
  - Las horas a mano siguen disponibles en "Otro horario (cargar a mano)", para casos especiales.
- **Modificar reserva (CU-03):** los botones mantienen la duración actual del evento. La propia reserva no cuenta como ocupada, así se puede correr de horario sin conflicto consigo misma.
- **Consultar disponibilidad (CU-01):** además del resultado, se listan todos los horarios libres de la sala ese día. Un clic los consulta y lleva a registrar la reserva.
- **Cliente nuevo en un paso:** si el DNI no existe y los datos del cliente están completos, "Guardar reserva" lo registra automáticamente (CU-05 extiende a CU-02). Ya no hace falta tocar "Registrar cliente" antes.

### Archivos

| Archivo | Cambio |
| --- | --- |
| `src/utilidades/calculos.mjs` | Nueva función `horariosLibres()`, que calcula los inicios posibles sin superposición. |
| `src/modelos/reservas.model.mjs` | Nueva consulta `obtenerFranjasOcupadas()`: una sola consulta por período, sin datos de clientes. |
| `src/modelos/solicitudes.model.mjs` | **Nuevo.** Acceso a datos de las solicitudes. |
| `src/controladores/agenda.controller.mjs` | Endpoints de horarios, calendario y paquetes públicos. `registrarReserva` acepta `solicitud_id`. |
| `src/controladores/solicitudes.controller.mjs` | **Nuevo.** Alta pública de solicitudes, y listar o descartar desde el sistema. |
| `src/routers/solicitudes.routers.mjs` | **Nuevo.** Rutas internas de la bandeja. |
| `src/routers/agenda.routers.mjs` | Ruta `GET /agenda/horarios`. |
| `src/app.mjs` | Montaje de las rutas nuevas. |
| `src/bd/esquema.mjs` | Tabla `solicitudes_reserva` (se crea sola al arrancar el servidor). |
| `vercel.json` | Redirecciones de las rutas públicas nuevas hacia la función. |
| `public/reservas.html`, `public/js/reservas.js` | Página pública rehecha en pasos. |
| `public/css/estilos.css` | Estilos de la reserva en pasos y arreglo del menú en celulares. |
| `public/js/sistema/vistas/componentes-horarios.js` | **Nuevo.** Selector de horarios libres. |
| `public/js/sistema/vistas/solicitudes.js` | **Nuevo.** Bandeja de solicitudes web. |
| `public/js/sistema/vistas/nueva-reserva.js` | Botones de horario, precarga desde solicitud y alta automática del cliente. |
| `public/js/sistema/vistas/reserva.js` | Botones de horario al modificar. |
| `public/js/sistema/vistas/disponibilidad.js` | Lista de horarios libres del día. |
| `public/js/sistema/app.js` | Ítem de menú "Solicitudes web" y contador. |
| `public/css/sistema.css` | Estilos de botones de horario y de la bandeja. |
| `public/js/validacion.js` | **Eliminado.** Sólo lo usaba el formulario viejo de reservas. |

### Endpoints nuevos

| Método | Ruta | Acceso | Para qué |
| --- | --- | --- | --- |
| GET | `/paquetes` | Público | Paquetes vigentes, sin el personalizado. |
| GET | `/disponibilidad/mes?mes=AAAA-MM&paquete_id=&personas=` | Público | Estado de cada día del mes: `libre`, `pocos`, `completo` o `pasado`. |
| GET | `/disponibilidad/dia?fecha=&paquete_id=&personas=` | Público | Horarios libres de cada sala ese día, sin datos de clientes. |
| POST | `/solicitudes` | Público | El cliente deja una solicitud (no ocupa la fecha). |
| GET | `/api/v1/agenda/horarios?fecha=&sala_id=&duracion=&excluir_id=` | Con sesión | Horarios libres de una sala (cada 30 minutos). |
| GET | `/api/v1/solicitudes?estado=` | Ventas, Administración | Bandeja de solicitudes (`pendiente` por defecto). |
| GET | `/api/v1/solicitudes/cantidad` | Ventas, Administración | Contador del menú. |
| GET | `/api/v1/solicitudes/:id` | Ventas, Administración | Detalle, para precargar "Nueva reserva". |
| POST | `/api/v1/solicitudes/:id/descartar` | Ventas, Administración | Descarta con motivo obligatorio. |

`POST /api/v1/reservas` ahora acepta además `solicitud_id` (opcional).

### Base de datos

No hace falta hacer nada a mano. Al arrancar el servidor (`npm run dev`) se crea la tabla `solicitudes_reserva` si no existe, **sin tocar los datos que ya hay**. Lo mismo pasa en Vercel con la base de Neon en el primer pedido después del deploy.

### Cómo probarlo

1. `npm run dev` y abrir `http://localhost:3000/reservas.html` (o el puerto que tengas en `PORT`).
2. Elegir un paquete, un día verde y un horario; completar los datos y enviar.
3. Entrar al sistema con `ventas` / `ventas2026`: el menú muestra **Solicitudes web** con el contador.
4. Tocar **Crear reserva** → revisar los datos precargados → **Guardar reserva**.
5. Volver a la bandeja: la solicitud está en "Convertidas en reserva" con el enlace a la reserva.

Pruebas realizadas (base local con los datos del seed):
- 5 reservas guardadas al mismo tiempo para la misma franja: sólo se acepta 1. RN01 sigue funcionando.
- Convertir dos veces la misma solicitud: la segunda se rechaza y no queda una reserva duplicada.
- Solicitud a un horario ocupado: se rechaza y se ofrecen los horarios libres. Doble envío: no se duplica.
- Perfil Encargado de Salón: no ve la bandeja (403).
- Página pública y pantallas internas recorridas en computadora (1366 px) y celular (360 px) sin errores en la consola ni desplazamiento horizontal.

### Qué conviene actualizar en el informe

- **Sección 10.3 / 8.4:** aclarar que la web permite dejar una *solicitud* que no reserva la fecha. El cliente sigue fuera de la frontera del sistema: la reserva la registra Ventas. El "portal de autogestión" completo sigue fuera de alcance.
- **Sección 13 y 14:** agregar el caso de uso **"Atender solicitud web"** (actor: Encargado de Ventas). Extiende a CU-02 cuando la solicitud se convierte en reserva.
- **Diagrama de clases (13.3):** nueva entidad `SolicitudReserva` (0..1 → Reserva).
- **Prototipos (14.x c):** reemplazar los campos Desde/Hasta por la selección de horarios libres.
