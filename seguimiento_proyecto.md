# Seguimiento del Proyecto: Diverty Park (TP 3 / Parcial 2)

Este documento detalla el planeamiento de tareas, la asignación de responsabilidades y la organización del proyecto para la materia de Programación Web. La metodología aplicada fue de **programación en parejas (Pair Programming) asistida por Inteligencia Artificial**.

---

## 1. Organización del Proyecto e Historial de Tareas

A continuación se presenta la tabla de seguimiento del proyecto, indicando las tareas planificadas, fechas de inicio y finalización, responsables y el estado actual:

| ID | Tarea / Característica | Responsable | Fecha Inicio | Fecha Fin | Estado | Commit / Entrega |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T01** | Inicialización del entorno, instalación de dependencias base (`pg`, `dotenv`) y variables de entorno. | Joaquín, Lisandro y Lucas + IA | 29/05/2026 | 29/05/2026 | **Completo** | `6cb8349` |
| **T02** | Creación del script de base de datos (`seed.mjs`) para crear la tabla de salas e insertar registros de prueba. | Joaquín, Lisandro y Lucas + IA | 29/05/2026 | 29/05/2026 | **Completo** | `6cb8349` |
| **T03** | Arquitectura MVC inicial: Implementación del modelo, controlador y rutas del CRUD de salas. | Joaquín, Lisandro y Lucas + IA | 29/05/2026 | 29/05/2026 | **Completo** | `6cb8349` |
| **T04** | Creación del Panel de Administración Frontend (`admin.html`, `admin.js`) con modal interactivo para las operaciones del CRUD. | Joaquín, Lisandro y Lucas + IA | 29/05/2026 | 29/05/2026 | **Completo** | `6cb8349` |
| **T05** | Adaptación de vistas del cliente y enrutado de archivos estáticos en Express (uso del alias `/recursos`). | Joaquín, Lisandro y Lucas + IA | 29/05/2026 | 29/05/2026 | **Completo** | `6cb8349` |
| **T06** | **[Parcial 2]** Instalación y configuración de dependencias para subida de archivos (`multer`, `nanoid`, `mime-type`). | Joaquín, Lisandro y Lucas + IA | 15/06/2026 | 15/06/2026 | **Completo** | *Pendiente push* |
| **T07** | **[Parcial 2]** Reestructuración a la estructura de carpetas propuesta en clase (`src/controladores`, `src/modelos`, `src/routers`). | Joaquín, Lisandro y Lucas + IA | 15/06/2026 | 15/06/2026 | **Completo** | *Pendiente push* |
| **T08** | **[Parcial 2]** Versionado de la API REST del CRUD a `/api/v1/salas` en servidor (Express) y cliente (AJAX fetch). | Joaquín, Lisandro y Lucas + IA | 15/06/2026 | 15/06/2026 | **Completo** | *Pendiente push* |
| **T09** | **[Parcial 2]** Implementación del almacenamiento de imágenes con Multer en las rutas de Alta y Modificación de salas. | Joaquín, Lisandro y Lucas + IA | 15/06/2026 | 15/06/2026 | **Completo** | *Pendiente push* |
| **T10** | **[Parcial 2]** Creación de informes técnicos detallados, bitácora de prompts de IA y documentación final. | Joaquín, Lisandro y Lucas + IA | 15/06/2026 | 15/06/2026 | **Completo** | *Pendiente push* |
| **T11** | **[TP4]** Creación de tabla `usuarios` en PostgreSQL y script de seed con usuario admin inicial. | Joaquín, Lisandro y Lucas + IA | 25/06/2026 | 25/06/2026 | **Completo** | *Pendiente push* |
| **T12** | **[TP4]** Implementación de hashing de contraseñas con bcryptjs (saltRounds: 10). | Joaquín, Lisandro y Lucas + IA | 25/06/2026 | 25/06/2026 | **Completo** | *Pendiente push* |
| **T13** | **[TP4]** Autenticación con JWT: login, logout, middleware de verificación, cookies httpOnly. | Joaquín, Lisandro y Lucas + IA | 25/06/2026 | 25/06/2026 | **Completo** | *Pendiente push* |
| **T14** | **[TP4]** Configuración de CORS (justificado) y cookie-parser. Protección de rutas CRUD. | Joaquín, Lisandro y Lucas + IA | 25/06/2026 | 25/06/2026 | **Completo** | *Pendiente push* |
| **T15** | **[TP4]** Creación de página `login.html` con formulario y redirección al panel de admin. | Joaquín, Lisandro y Lucas + IA | 25/06/2026 | 25/06/2026 | **Completo** | *Pendiente push* |
| **T16** | **[TP4]** Actualización de `.env`, `.env.example` con `JWT_SECRETO` y `FRONTEND_URL`. Informe TP4. | Joaquín, Lisandro y Lucas + IA | 25/06/2026 | 25/06/2026 | **Completo** | *Pendiente push* |

---

## 2. Metodología de Desarrollo y Control de Cambios

Para asegurar el orden y la trazabilidad del código se siguieron las siguientes pautas:
*   **Git Branches**: Todo el desarrollo se concentró inicialmente en la rama `master`, sincronizándose de forma segura mediante commits atómicos y descriptivos.
*   **Seguridad de Credenciales**: Se configuró el archivo `.gitignore` para bloquear la subida del archivo `.env`, protegiendo así las contraseñas locales de PostgreSQL.
*   **Pair Programming con IA**:
    *   **Joaquín, Lisandro y Lucas** se encargaron de definir las especificaciones dadas por los docentes, probar localmente los flujos del servidor y la interfaz, y realizar el testeo manual.
    *   **La IA (Gemini)** actuó como copiloto, sugiriendo las implementaciones de bases de datos, refactorizando las carpetas al esquema sugerido por la facultad, configurando el middleware de Multer, y documentando técnicamente el proyecto.
