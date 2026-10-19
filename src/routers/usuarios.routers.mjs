import { Router } from 'express';
import usuarioControlador from '../controladores/usuarios.controller.mjs';
import verificarToken from '../middleware/autenticacion.mjs';

const enrutadorUsuarios = Router();

// Ruta pública: iniciar sesión
enrutadorUsuarios.post('/login', usuarioControlador.login);

// Ruta pública: cerrar sesión
enrutadorUsuarios.post('/logout', usuarioControlador.logout);

// Ruta protegida: verificar si la sesión es válida (usada por el frontend al cargar admin.html)
enrutadorUsuarios.get('/verificar', verificarToken, usuarioControlador.verificarSesion);

export default enrutadorUsuarios;
