// Esperamos a que la página HTML se cargue por completo
document.addEventListener('DOMContentLoaded', async () => {

  // --- 0. VERIFICACIÓN DE SESIÓN ---
  // Antes de mostrar el panel, comprobamos si el usuario tiene un token válido.
  // Si no está autenticado, lo redirigimos al login.
  try {
    const respuestaAuth = await fetch('/api/v1/usuarios/verificar', {
      credentials: 'include'
    });

    if (!respuestaAuth.ok) {
      // No hay sesión válida: redirigimos al login
      window.location.href = './login.html';
      return;
    }

    // Mostramos el nombre del usuario logueado en el encabezado
    const datosAuth = await respuestaAuth.json();
    const bienvenida = document.getElementById('bienvenida-usuario');
    if (bienvenida) {
      bienvenida.textContent = `Hola, ${datosAuth.usuario.nombre_usuario}`;
    }

  } catch (error) {
    window.location.href = './login.html';
    return;
  }

  // --- 1. SELECCIÓN DE ELEMENTOS DEL DOM (HTML) ---
  const tablaCuerpo = document.getElementById('cuerpo-tabla-salas');
  const modal = document.getElementById('modal-sala');
  const formulario = document.getElementById('formulario-sala');
  const modalTitulo = document.getElementById('modal-titulo');
  
  // Botones principales
  const botonNuevaSala = document.getElementById('btn-nueva-sala');
  const botonCerrarModal = document.getElementById('btn-cerrar-modal');
  const botonCancelar = document.getElementById('btn-cancelar');
  const botonCerrarSesion = document.getElementById('btn-cerrar-sesion');

  // Campos del formulario
  const campoId = document.getElementById('sala-id');
  const campoNombre = document.getElementById('nombre');
  const campoCapNinos = document.getElementById('capacidad_ninos');
  const campoCapAdultos = document.getElementById('capacidad_adultos');
  const campoPrecio = document.getElementById('precio');
  const campoDescripcion = document.getElementById('descripcion');
  const campoImagen = document.getElementById('imagen');
  const campoAltImagen = document.getElementById('alt_imagen');

  // Campos de estadísticas del dashboard
  const statSalas = document.getElementById('stat-total-salas');
  const statNinos = document.getElementById('stat-capacidad-ninos');
  const statAdultos = document.getElementById('stat-capacidad-adultos');

  // Ocultamos el modal al inicio por seguridad removiendo la clase activa
  modal.classList.remove('mostrar');

  // --- 2. FUNCIONES DEL PANEL ---

  // Obtiene todas las salas del servidor y actualiza la tabla y estadísticas
  async function cargarSalas() {
    try {
      // Hacemos una petición GET a nuestra API CRUD (versión 1)
      const respuesta = await fetch('/api/v1/salas', { credentials: 'include' });
      
      if (!respuesta.ok) {
        throw new Error('Error al obtener los datos del servidor.');
      }

      const listaSalas = await respuesta.json();
      
      // Limpiamos la tabla y recalculamos estadísticas
      tablaCuerpo.innerHTML = '';
      let totalSalas = listaSalas.length;
      let sumaNinos = 0;
      let sumaAdultos = 0;

      if (totalSalas === 0) {
        tablaCuerpo.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 20px; color: #888;">
              No hay salas registradas. ¡Haz clic en "+ Nueva Sala" para agregar una!
            </td>
          </tr>
        `;
      } else {
        // Recorremos la lista para renderizar la tabla e ir sumando capacidades
        listaSalas.forEach(sala => {
          sumaNinos += parseInt(sala.capacidad_ninos || 0);
          sumaAdultos += parseInt(sala.capacidad_adultos || 0);

          // Creamos una fila (tr) por cada sala
          const fila = document.createElement('tr');
          fila.innerHTML = `
            <td><strong>${sala.id}</strong></td>
            <td>
              <img src="${sala.imagen || './recursos/imagenes/payasio.png'}" 
                   alt="${sala.alt_imagen || 'Imagen de sala'}" 
                   class="tabla-imagen-miniatura"
                   onerror="this.src='./recursos/imagenes/payasio.png'">
            </td>
            <td><strong>${sala.nombre}</strong></td>
            <td>${sala.capacidad_ninos} niños</td>
            <td>${sala.capacidad_adultos} adultos</td>
            <td><strong>$${parseFloat(sala.precio).toLocaleString('es-AR')}</strong></td>
            <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${sala.descripcion}">
              ${sala.descripcion || 'Sin descripción'}
            </td>
            <td>
              <button class="btn-tabla-editar" data-id="${sala.id}">Editar</button>
              <button class="btn-tabla-eliminar" data-id="${sala.id}">Eliminar</button>
            </td>
          `;
          tablaCuerpo.appendChild(fila);
        });
      }

      // Actualizamos las tarjetas de estadísticas con los nuevos números
      statSalas.textContent = totalSalas;
      statNinos.textContent = sumaNinos;
      statAdultos.textContent = sumaAdultos;

      // Volvemos a escuchar los botones de editar y eliminar recién agregados
      agregarEventosTabla();

    } catch (error) {
      console.error('Error al cargar salas:', error);
      tablaCuerpo.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: red; padding: 20px;">
            ⚠️ Error de conexión con la API de base de datos.
          </td>
        </tr>
      `;
    }
  }

  // Registra escuchadores de eventos para los botones de editar y eliminar dentro de la tabla
  function agregarEventosTabla() {
    // Botones de editar
    const botonesEditar = document.querySelectorAll('.btn-tabla-editar');
    botonesEditar.forEach(boton => {
      boton.addEventListener('click', () => {
        const id = boton.getAttribute('data-id');
        abrirModalParaEditar(id);
      });
    });

    // Botones de eliminar
    const botonesEliminar = document.querySelectorAll('.btn-tabla-eliminar');
    botonesEliminar.forEach(boton => {
      boton.addEventListener('click', () => {
        const id = boton.getAttribute('data-id');
        eliminarSala(id);
      });
    });
  }

  // Muestra el modal para CREAR una nueva sala
  function abrirModalParaCrear() {
    formulario.reset(); // Limpiamos campos anteriores
    campoId.value = ''; // ID vacío para saber que es un ALTA (POST)
    
    // Reseteamos el campo de imagen existente y su vista previa
    document.getElementById('imagen_existente').value = '';
    document.getElementById('preview-imagen-contenedor').style.display = 'none';
    
    modalTitulo.textContent = 'Agregar Nueva Sala';
    
    // Abrimos el modal agregando la clase CSS que controla la opacidad
    modal.classList.add('mostrar');
  }

  // Muestra el modal y carga los datos actuales de una sala para EDITARLA
  async function abrirModalParaEditar(id) {
    try {
      // Hacemos una petición GET a la API CRUD (v1) para traer los detalles de esa sala específica
      const respuesta = await fetch(`/api/v1/salas/${id}`, { credentials: 'include' });
      
      if (!respuesta.ok) {
        throw new Error('No se pudo obtener la información de la sala.');
      }

      const sala = await respuesta.json();

      // Rellenamos los campos del formulario con los datos recibidos de la base de datos
      campoId.value = sala.id;
      campoNombre.value = sala.nombre;
      campoCapNinos.value = sala.capacidad_ninos;
      campoCapAdultos.value = sala.capacidad_adultos;
      campoPrecio.value = sala.precio;
      campoDescripcion.value = sala.descripcion;
      campoAltImagen.value = sala.alt_imagen;

      // Almacenamos la ruta de la imagen actual en el campo oculto
      document.getElementById('imagen_existente').value = sala.imagen;

      // Mostramos una vista previa del nombre de la imagen actual
      const previewContenedor = document.getElementById('preview-imagen-contenedor');
      const previewNombre = document.getElementById('preview-imagen-nombre');
      
      if (sala.imagen) {
        previewContenedor.style.display = 'block';
        const nombreArchivo = sala.imagen.substring(sala.imagen.lastIndexOf('/') + 1);
        previewNombre.textContent = nombreArchivo;
      } else {
        previewContenedor.style.display = 'none';
      }

      modalTitulo.textContent = 'Editar Sala';
      
      // Abrimos el modal agregando la clase CSS
      modal.classList.add('mostrar');
    } catch (error) {
      alert('Error al intentar recuperar los datos de la sala: ' + error.message);
    }
  }

  // Cierra el modal y limpia el formulario
  function cerrarModalFormulario() {
    modal.classList.remove('mostrar');
    formulario.reset();
    document.getElementById('preview-imagen-contenedor').style.display = 'none';
  }

  // Maneja el guardado del formulario (Creación o Actualización con Multer)
  async function guardarSala(evento) {
    evento.preventDefault(); // Evitamos que la página se recargue

    // En lugar de JSON, usamos FormData para permitir la subida del archivo binario
    const datosFormulario = new FormData(formulario);

    const id = campoId.value;
    let url = '/api/v1/salas';
    let metodo = 'POST'; // Por defecto es ALTA

    // Si el ID tiene valor, significa que estamos EDITANDO (PUT)
    if (id) {
      url = `/api/v1/salas/${id}`;
      metodo = 'PUT';
    }

    try {
      // Enviamos la petición con FormData. El navegador establece automáticamente
      // el Content-Type multipart/form-data con el boundary correcto.
      const respuesta = await fetch(url, {
        method: metodo,
        body: datosFormulario,
        credentials: 'include'
      });

      if (!respuesta.ok) {
        const errorDatos = await respuesta.json();
        throw new Error(errorDatos.error || 'Ocurrió un error en el servidor.');
      }

      alert(id ? '¡Sala modificada con éxito!' : '¡Sala creada con éxito!');
      cerrarModalFormulario();
      cargarSalas(); // Recargamos la tabla con los nuevos datos de la DB

    } catch (error) {
      alert('Error al guardar la sala: ' + error.message);
    }
  }

  // Maneja el borrado de una sala (BAJA)
  async function eliminarSala(id) {
    const confirmar = confirm(`¿Estás seguro de que quieres eliminar la sala con ID ${id}? Esta acción no se puede deshacer.`);
    
    if (!confirmar) return; // Si cancela, no hacemos nada

    try {
      // Enviamos petición DELETE al servidor Express (v1)
      const respuesta = await fetch(`/api/v1/salas/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!respuesta.ok) {
        const errorDatos = await respuesta.json();
        throw new Error(errorDatos.error || 'No se pudo eliminar la sala.');
      }

      alert('¡Sala eliminada con éxito!');
      cargarSalas(); // Recargamos la tabla

    } catch (error) {
      alert('Error al eliminar la sala: ' + error.message);
    }
  }

  // Cierra la sesión: borra la cookie del servidor y redirige al login
  async function cerrarSesion() {
    await fetch('/api/v1/usuarios/logout', {
      method: 'POST',
      credentials: 'include'
    });
    window.location.href = './login.html';
  }

  // --- 3. ASOCIACIÓN DE EVENTOS DE BOTONES (LISTENERS) ---
  botonNuevaSala.addEventListener('click', abrirModalParaCrear);
  botonCerrarModal.addEventListener('click', cerrarModalFormulario);
  botonCancelar.addEventListener('click', cerrarModalFormulario);
  formulario.addEventListener('submit', guardarSala);
  botonCerrarSesion.addEventListener('click', cerrarSesion);

  // Cerrar el modal haciendo clic fuera de la caja de contenido
  window.addEventListener('click', (evento) => {
    if (evento.target === modal) {
      cerrarModalFormulario();
    }
  });

  // --- 4. INICIALIZACIÓN ---
  // Cargamos los datos iniciales de las salas al entrar al panel
  cargarSalas();

});
