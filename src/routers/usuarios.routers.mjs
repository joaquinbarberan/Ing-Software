import { Router } from 'express';
import usuarioControlador from '../controladores/usuarios.controller.mjs';
import verificarToken from '../middleware/autenticacion.mjs';
import { permitir } from '../middleware/permisos.mjs';

const enrutadorUsuarios = Router();

// Ruta pública: iniciar sesión
enrutadorUsuarios.post('/login', usuarioControlador.login);

// Ruta pública: cerrar sesión
enrutadorUsuarios.post('/logout', usuarioControlador.logout);

// Ruta protegida: verificar si la sesión es válida (usada por el frontend al cargar el panel)
enrutadorUsuarios.get('/verificar', verificarToken, usuarioControlador.verificarSesion);

// Ruta protegida: cada usuario cambia su propia contraseña
enrutadorUsuarios.post('/mi-contrasena', verificarToken, usuarioControlador.cambiarMiContrasena);

// Administración de usuarios con perfiles (RF12): sólo Gerencia
enrutadorUsuarios.get('/', verificarToken, permitir(), usuarioControlador.listar);
enrutadorUsuarios.post('/', verificarToken, permitir(), usuarioControlador.crear);
enrutadorUsuarios.put('/:id', verificarToken, permitir(), usuarioControlador.actualizar);

export default enrutadorUsuarios;
