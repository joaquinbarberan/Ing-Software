import { enTransaccion } from '../conexion.bd.mjs';
import catalogoModelo from '../modelos/catalogos.model.mjs';
import { ErrorNegocio, manejar, entero, importe } from '../utilidades/errores.mjs';

// Controlador de los catálogos que configura Administración:
// paquetes, servicios adicionales, insumos y coordinadores.

function texto(valor, campo) {
  const limpio = (valor || '').trim();
  if (!limpio) throw new ErrorNegocio(400, `El campo ${campo} es obligatorio.`);
  return limpio;
}

function montoValido(valor, campo) {
  const monto = importe(valor);
  if (!(monto >= 0)) throw new ErrorNegocio(400, `Ingresá un valor válido para ${campo}.`);
  return monto;
}

function activo(valor) {
  return valor === undefined ? true : valor === true || valor === 'true';
}

const catalogoControlador = {

  // --- PAQUETES ---
  // GET /api/v1/catalogos/paquetes?activos=true
  listarPaquetes: manejar(async (peticion, respuesta) => {
    respuesta.json(await catalogoModelo.listarPaquetes({ soloActivos: peticion.query.activos === 'true' }));
  }),

  // POST /api/v1/catalogos/paquetes  |  PUT /api/v1/catalogos/paquetes/:id
  guardarPaquete: manejar(async (peticion, respuesta) => {
    const id = peticion.params.id ? entero(peticion.params.id) : null;
    const cuerpo = peticion.body;
    const datos = {
      nombre: texto(cuerpo.nombre, 'nombre'),
      descripcion: (cuerpo.descripcion || '').trim(),
      precio_base: montoValido(cuerpo.precio_base, 'el precio base'),
      personas_incluidas: entero(cuerpo.personas_incluidas),
      duracion_horas: entero(cuerpo.duracion_horas),
      tarifa_excedente: montoValido(cuerpo.tarifa_excedente, 'la tarifa por excedente'),
      es_personalizado: cuerpo.es_personalizado === true || cuerpo.es_personalizado === 'true',
      activo: activo(cuerpo.activo)
    };
    if (!(datos.personas_incluidas >= 0)) throw new ErrorNegocio(400, 'Ingresá las personas incluidas.');
    if (!(datos.duracion_horas > 0)) throw new ErrorNegocio(400, 'Ingresá la duración en horas.');

    const insumos = Array.isArray(cuerpo.insumos) ? cuerpo.insumos
      .map(item => ({ insumo_id: entero(item.insumo_id), cantidad_por_persona: Number(item.cantidad_por_persona) }))
      .filter(item => item.insumo_id > 0 && item.cantidad_por_persona > 0) : null;

    const paquete = await enTransaccion(async (bd) => {
      const guardado = await catalogoModelo.guardarPaquete(id, datos, bd);
      if (!guardado) throw new ErrorNegocio(404, 'El paquete no existe.');
      if (insumos) await catalogoModelo.guardarInsumosDePaquete(guardado.id, insumos, bd);
      return guardado;
    });
    respuesta.status(id ? 200 : 201).json(paquete);
  }),

  // --- SERVICIOS ADICIONALES ---
  listarAdicionales: manejar(async (peticion, respuesta) => {
    respuesta.json(await catalogoModelo.listarAdicionales({ soloActivos: peticion.query.activos === 'true' }));
  }),

  guardarAdicional: manejar(async (peticion, respuesta) => {
    const id = peticion.params.id ? entero(peticion.params.id) : null;
    const adicional = await catalogoModelo.guardarAdicional(id, {
      nombre: texto(peticion.body.nombre, 'nombre'),
      precio: montoValido(peticion.body.precio, 'el precio'),
      unidad: (peticion.body.unidad || 'unidad').trim(),
      activo: activo(peticion.body.activo)
    });
    if (!adicional) throw new ErrorNegocio(404, 'El adicional no existe.');
    respuesta.status(id ? 200 : 201).json(adicional);
  }),

  // --- INSUMOS ---
  listarInsumos: manejar(async (peticion, respuesta) => {
    respuesta.json(await catalogoModelo.listarInsumos({ soloActivos: peticion.query.activos === 'true' }));
  }),

  guardarInsumo: manejar(async (peticion, respuesta) => {
    const id = peticion.params.id ? entero(peticion.params.id) : null;
    const insumo = await catalogoModelo.guardarInsumo(id, {
      nombre: texto(peticion.body.nombre, 'nombre'),
      unidad: (peticion.body.unidad || 'unidad').trim(),
      costo_unitario: montoValido(peticion.body.costo_unitario, 'el costo unitario'),
      activo: activo(peticion.body.activo)
    });
    if (!insumo) throw new ErrorNegocio(404, 'El insumo no existe.');
    respuesta.status(id ? 200 : 201).json(insumo);
  }),

  // --- COORDINADORES ---
  listarCoordinadores: manejar(async (peticion, respuesta) => {
    respuesta.json(await catalogoModelo.listarCoordinadores({ soloActivos: peticion.query.activos === 'true' }));
  }),

  guardarCoordinador: manejar(async (peticion, respuesta) => {
    const id = peticion.params.id ? entero(peticion.params.id) : null;
    const coordinador = await catalogoModelo.guardarCoordinador(id, {
      nombre: texto(peticion.body.nombre, 'nombre'),
      telefono: (peticion.body.telefono || '').trim(),
      tarifa_hora: montoValido(peticion.body.tarifa_hora, 'la tarifa por hora'),
      activo: activo(peticion.body.activo)
    });
    if (!coordinador) throw new ErrorNegocio(404, 'El coordinador no existe.');
    respuesta.status(id ? 200 : 201).json(coordinador);
  })
};

export default catalogoControlador;
