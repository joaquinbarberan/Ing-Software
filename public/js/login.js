// Maneja el formulario de inicio de sesión
const formulario = document.getElementById('formulario-login');
const mensajeError = document.getElementById('mensaje-error');
const btnIngresar = document.getElementById('btn-ingresar');

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const nombreUsuario = document.getElementById('nombre_usuario').value.trim();
  const contrasena = document.getElementById('contrasena').value;

  // Ocultamos el error anterior y deshabilitamos el botón mientras se procesa
  mensajeError.style.display = 'none';
  btnIngresar.disabled = true;
  btnIngresar.textContent = 'Ingresando...';

  try {
    const respuesta = await fetch('/api/v1/usuarios/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario: nombreUsuario, contrasena }),
      credentials: 'include' // Necesario para que el servidor pueda setear la cookie
    });

    const datos = await respuesta.json();

    if (respuesta.ok) {
      // Login exitoso: redirigimos al panel de administración
      window.location.href = './admin.html';
    } else {
      // Mostramos el mensaje de error del servidor
      mensajeError.textContent = datos.error || 'Error al iniciar sesión.';
      mensajeError.style.display = 'block';
    }
  } catch (error) {
    mensajeError.textContent = 'No se pudo conectar con el servidor.';
    mensajeError.style.display = 'block';
  } finally {
    btnIngresar.disabled = false;
    btnIngresar.textContent = 'Ingresar';
  }
});
