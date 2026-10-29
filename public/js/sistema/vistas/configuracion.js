// Configuración de catálogos (Administración) y usuarios con perfiles (Gerencia, RF12)
import { api } from '../api.js';
import { ponerMigas, reemplazarRuta } from '../navegacion.js';
import { esc, puede, pesos, PERFILES, fechaHora, abrirModal, avisar, conBoton, panelError } from '../util.js';

// Definición de cada catálogo: columnas de la tabla y campos del formulario
const CATALOGOS = {
  paquetes: {
    titulo: 'Paquetes', ruta: '/catalogos/paquetes', singular: 'paquete',
    columnas: [
      ['Nombre', p => `<strong>${esc(p.nombre)}</strong>${p.es_personalizado ? ' <span class="etiqueta etiqueta-aviso">a medida</span>' : ''}<br><span class="nota">${esc(p.descripcion || '')}</span>`],
      ['Precio base', p => p.es_personalizado ? '—' : pesos(p.precio_base), 'numero'],
      ['Incluye', p => p.es_personalizado ? '—' : `${p.personas_incluidas} pers.`, 'numero'],
      ['Duración', p => `${p.duracion_horas} h`, 'numero'],
      ['Excedente/pers.', p => pesos(p.tarifa_excedente), 'numero'],
      ['Insumos', p => `${p.insumos.length}`, 'numero']
    ],
    campos: [
      ['nombre', 'Nombre', 'text'], ['descripcion', 'Descripción', 'text'],
      ['precio_base', 'Precio base', 'number'], ['personas_incluidas', 'Personas incluidas', 'number'],
      ['duracion_horas', 'Duración (horas)', 'number'], ['tarifa_excedente', 'Tarifa por persona excedente', 'number'],
      ['es_personalizado', 'Paquete a medida (importe manual, sólo Administración)', 'checkbox']
    ]
  },
  adicionales: {
    titulo: 'Servicios adicionales', ruta: '/catalogos/adicionales', singular: 'adicional',
    columnas: [['Nombre', a => esc(a.nombre)], ['Precio', a => pesos(a.precio), 'numero'], ['Unidad', a => esc(a.unidad)]],
    campos: [['nombre', 'Nombre', 'text'], ['precio', 'Precio', 'number'], ['unidad', 'Unidad (hora, porción, unidad...)', 'text']]
  },
  insumos: {
    titulo: 'Insumos', ruta: '/catalogos/insumos', singular: 'insumo',
    columnas: [['Nombre', i => esc(i.nombre)], ['Unidad', i => esc(i.unidad)], ['Costo unitario', i => pesos(i.costo_unitario), 'numero']],
    campos: [['nombre', 'Nombre', 'text'], ['unidad', 'Unidad', 'text'], ['costo_unitario', 'Costo unitario de referencia', 'number']]
  },
  coordinadores: {
    titulo: 'Coordinadores', ruta: '/catalogos/coordinadores', singular: 'coordinador',
    columnas: [['Nombre', c => esc(c.nombre)], ['Teléfono', c => esc(c.telefono || '')], ['Tarifa por hora', c => pesos(c.tarifa_hora), 'numero']],
    campos: [['nombre', 'Nombre y apellido', 'text'], ['telefono', 'Teléfono (WhatsApp)', 'tel'], ['tarifa_hora', 'Tarifa por hora', 'number']]
  }
};

function campoHtml([nombre, etiqueta, tipo], valor) {
  if (tipo === 'checkbox') {
    return `<label class="campo-check"><input type="checkbox" name="${nombre}" ${valor ? 'checked' : ''}> ${etiqueta}</label>`;
  }
  return `<label class="campo"><span>${etiqueta}</span><input type="${tipo}" name="${nombre}" value="${esc(valor ?? '')}" ${tipo === 'number' ? 'min="0" step="any"' : ''} ${nombre === 'nombre' ? 'required' : ''}></label>`;
}

async function pestanaCatalogo(contenedor, clave) {
  const definicion = CATALOGOS[clave];
  let filas;
  let insumos = [];
  try {
    filas = await api.get(definicion.ruta);
    if (clave === 'paquetes') insumos = await api.get('/catalogos/insumos?activos=true');
  } catch (error) {
    return panelError(contenedor, error, () => pestanaCatalogo(contenedor, clave));
  }

  contenedor.innerHTML = `
    <div class="barra-herramientas">
      <h2>${definicion.titulo}</h2>
      <button class="boton boton-primario" data-nuevo>+ Nuevo ${definicion.singular}</button>
    </div>
    <div class="tabla-desplazable"><table class="tabla tabla-clic">
      <thead><tr>${definicion.columnas.map(([titulo, , clase]) => `<th class="${clase || ''}">${titulo}</th>`).join('')}<th>Estado</th></tr></thead>
      <tbody>${filas.map(fila => `
        <tr data-id="${fila.id}" tabindex="0" class="${fila.activo ? '' : 'fila-tenue'}">
          ${definicion.columnas.map(([, celda, clase]) => `<td class="${clase || ''}">${celda(fila)}</td>`).join('')}
          <td>${fila.activo ? 'Activo' : 'Dado de baja'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="nota">Los registros no se eliminan porque hay reservas que los usan: se dan de baja y dejan de ofrecerse.</p>`;

  const abrir = (fila) => {
    const { cuerpo, cerrar } = abrirModal({
      titulo: fila ? `Editar ${definicion.singular}` : `Nuevo ${definicion.singular}`,
      ancho: clave === 'paquetes' ? 'modal-ancho' : '',
      contenido: `
        <form class="formulario" novalidate>
          <div class="columnas-2 compacta">${definicion.campos.map(campo => campoHtml(campo, fila?.[campo[0]])).join('')}</div>
          ${clave === 'paquetes' ? `
            <h3>Insumos por invitado</h3>
            <p class="nota">Cantidad de cada insumo por persona. Con esto se calcula el pedido de cada evento (RF13).</p>
            <div class="grilla-insumos">${insumos.map(i => {
              const actual = fila?.insumos.find(x => x.insumo_id === i.id);
              return `<label class="campo"><span>${esc(i.nombre)} (${esc(i.unidad)})</span><input type="number" min="0" step="0.01" data-insumo="${i.id}" value="${actual ? actual.cantidad_por_persona : ''}" placeholder="0"></label>`;
            }).join('')}</div>` : ''}
          <label class="campo-check"><input type="checkbox" name="activo" ${fila?.activo === false ? '' : 'checked'}> Activo</label>
          <div class="caja-mensaje caja-error" hidden></div>
          <div class="acciones">
            <button type="button" class="boton boton-secundario" data-cerrar>Cancelar</button>
            <button type="submit" class="boton boton-primario">Guardar</button>
          </div>
        </form>`
    });
    const formulario = cuerpo.querySelector('form');
    cuerpo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const datos = Object.fromEntries(new FormData(formulario));
      formulario.querySelectorAll('input[type=checkbox]').forEach(c => { datos[c.name] = c.checked; });
      if (clave === 'paquetes') {
        datos.insumos = [...formulario.querySelectorAll('[data-insumo]')]
          .filter(input => Number(input.value) > 0)
          .map(input => ({ insumo_id: Number(input.dataset.insumo), cantidad_por_persona: Number(input.value) }));
      }
      const error = cuerpo.querySelector('.caja-error');
      error.hidden = true;
      try {
        await conBoton(formulario.querySelector('[type=submit]'), () =>
          fila ? api.put(`${definicion.ruta}/${fila.id}`, datos) : api.post(definicion.ruta, datos));
        cerrar();
        avisar('Cambios guardados.');
        pestanaCatalogo(contenedor, clave);
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
      }
    });
  };

  contenedor.querySelector('[data-nuevo]').addEventListener('click', () => abrir(null));
  contenedor.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => abrir(filas.find(f => f.id === Number(tr.dataset.id)))));
}

async function pestanaUsuarios(contenedor) {
  let usuarios;
  try { usuarios = await api.get('/usuarios'); } catch (error) { return panelError(contenedor, error, () => pestanaUsuarios(contenedor)); }

  contenedor.innerHTML = `
    <div class="barra-herramientas">
      <h2>Usuarios del sistema</h2>
      <button class="boton boton-primario" data-nuevo>+ Nuevo usuario</button>
    </div>
    <div class="tabla-desplazable"><table class="tabla tabla-clic">
      <thead><tr><th>Usuario</th><th>Nombre</th><th>Perfil</th><th>Estado</th><th>Alta</th></tr></thead>
      <tbody>${usuarios.map(u => `
        <tr data-id="${u.id}" tabindex="0" class="${u.activo ? '' : 'fila-tenue'}">
          <td><strong>${esc(u.nombre_usuario)}</strong></td><td>${esc(u.nombre || '')}</td>
          <td>${PERFILES[u.perfil] || esc(u.perfil)}</td><td>${u.activo ? 'Activo' : 'Inactivo'}</td><td>${fechaHora(u.creado_en)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="nota">Las contraseñas se guardan cifradas (bcrypt). Sólo Gerencia administra usuarios.</p>`;

  const abrir = (usuario) => {
    const { cuerpo, cerrar } = abrirModal({
      titulo: usuario ? `Editar ${usuario.nombre_usuario}` : 'Nuevo usuario',
      contenido: `
        <form class="formulario" novalidate>
          ${usuario ? '' : '<label class="campo"><span>Nombre de usuario</span><input name="nombre_usuario" autocomplete="off" required></label>'}
          <label class="campo"><span>Nombre de la persona</span><input name="nombre" value="${esc(usuario?.nombre || '')}" required></label>
          <label class="campo"><span>Perfil</span>
            <select name="perfil">${Object.entries(PERFILES).map(([valor, texto]) => `<option value="${valor}" ${usuario?.perfil === valor ? 'selected' : ''}>${texto}</option>`).join('')}</select>
          </label>
          <label class="campo"><span>${usuario ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña (mínimo 8 caracteres)'}</span><input type="password" name="contrasena" autocomplete="new-password" minlength="8"></label>
          ${usuario ? `<label class="campo-check"><input type="checkbox" name="activo" ${usuario.activo ? 'checked' : ''}> Activo</label>` : ''}
          <div class="caja-mensaje caja-error" hidden></div>
          <div class="acciones">
            <button type="button" class="boton boton-secundario" data-cerrar>Cancelar</button>
            <button type="submit" class="boton boton-primario">Guardar</button>
          </div>
        </form>`
    });
    const formulario = cuerpo.querySelector('form');
    cuerpo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const datos = Object.fromEntries(new FormData(formulario));
      if (usuario) datos.activo = formulario.activo.checked;
      const error = cuerpo.querySelector('.caja-error');
      error.hidden = true;
      try {
        await conBoton(formulario.querySelector('[type=submit]'), () => usuario ? api.put(`/usuarios/${usuario.id}`, datos) : api.post('/usuarios', datos));
        cerrar();
        avisar('Usuario guardado.');
        pestanaUsuarios(contenedor);
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
      }
    });
  };

  contenedor.querySelector('[data-nuevo]').addEventListener('click', () => abrir(null));
  contenedor.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => abrir(usuarios.find(u => u.id === Number(tr.dataset.id)))));
}

export default async function vistaConfiguracion(contenedor, { partes }) {
  ponerMigas('Configuración');
  const pestanas = [
    ...Object.entries(CATALOGOS).map(([clave, d]) => [clave, d.titulo]),
    ['salas', 'Salas'],
    ...(puede() ? [['usuarios', 'Usuarios']] : [])
  ];
  let actual = pestanas.some(([clave]) => clave === partes[0]) ? partes[0] : 'paquetes';

  contenedor.innerHTML = `
    <h1>Configuración</h1>
    <div class="pestanas" role="tablist">${pestanas.map(([clave, titulo]) => `<button role="tab" data-pestana="${clave}">${titulo}</button>`).join('')}</div>
    <div id="pestana-contenido" class="tarjeta"></div>`;
  const cuerpo = contenedor.querySelector('#pestana-contenido');

  function mostrar(clave) {
    actual = clave;
    reemplazarRuta(`configuracion/${clave}`);
    contenedor.querySelectorAll('[data-pestana]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.pestana === clave)));
    cuerpo.innerHTML = '<p class="cargando">Cargando...</p>';
    if (clave === 'usuarios') return pestanaUsuarios(cuerpo);
    if (clave === 'salas') {
      cuerpo.innerHTML = `
        <h2>Salas</h2>
        <p>Las salas (nombre, capacidad, precio de referencia, foto y descripción del sitio público) se administran en el panel de salas.</p>
        <a class="boton boton-primario" href="./admin.html">Abrir panel de salas</a>`;
      return;
    }
    return pestanaCatalogo(cuerpo, clave);
  }

  contenedor.querySelectorAll('[data-pestana]').forEach(b => b.addEventListener('click', () => mostrar(b.dataset.pestana)));
  mostrar(actual);
}
