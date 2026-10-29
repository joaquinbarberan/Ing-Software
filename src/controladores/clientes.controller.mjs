import clienteModelo from '../modelos/clientes.model.mjs';
import reservaModelo from '../modelos/reservas.model.mjs';
import { ErrorNegocio, manejar, entero } from '../utilidades/errores.mjs';

// Controlador del módulo M2 — Clientes (CU-05 Registrar cliente, CU-06 Consultar historial)

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Deja el DNI sólo con números (acepta "32.145.876" o "32145876")
function normalizarDni(dni) {
  return String(dni || '').replace(/\D/g, '');
}

function validarCliente(cuerpo) {
  const datos = {
    nombre: (cuerpo.nombre || '').trim(),
    apellido: (cuerpo.apellido || '').trim(),
    dni: normalizarDni(cuerpo.dni),
    telefono: (cuerpo.telefono || '').trim(),
    email: (cuerpo.email || '').trim().toLowerCase()
  };
  if (!datos.nombre || !datos.apellido) throw new ErrorNegocio(400, 'El nombre y el apellido son obligatorios.');
  if (datos.dni.length < 7 || datos.dni.length > 9) throw new ErrorNegocio(400, 'Ingresá un DNI válido (7 u 8 números).');
  if (!datos.telefono) throw new ErrorNegocio(400, 'El teléfono es obligatorio para poder contactar al cliente.');
  if (datos.email && !REGEX_EMAIL.test(datos.email)) throw new ErrorNegocio(400, 'El correo electrónico no es válido.');
  return datos;
}

const clienteControlador = {

  // GET /api/v1/clientes?buscar=texto
  listar: manejar(async (peticion, respuesta) => {
    respuesta.json(await clienteModelo.buscar(peticion.query.buscar || ''));
  }),

  // R02.1: identificar al cliente por DNI y recuperar sus datos de contacto
  // GET /api/v1/clientes/dni/:dni
  buscarPorDni: manejar(async (peticion, respuesta) => {
    const cliente = await clienteModelo.obtenerPorDni(normalizarDni(peticion.params.dni));
    if (!cliente) throw new ErrorNegocio(404, 'No hay ningún cliente con ese DNI. Podés registrarlo ahora.');
    respuesta.json(cliente);
  }),

  // CU-06 · Consultar historial de cliente
  // GET /api/v1/clientes/:id
  obtener: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const cliente = await clienteModelo.obtenerPorId(id);
    if (!cliente) throw new ErrorNegocio(404, 'El cliente no existe.');
    const reservas = await reservaModelo.obtenerPorCliente(id);
    respuesta.json({ ...cliente, reservas });
  }),

  // CU-05 · Registrar cliente
  // POST /api/v1/clientes
  crear: manejar(async (peticion, respuesta) => {
    const datos = validarCliente(peticion.body);
    if (await clienteModelo.obtenerPorDni(datos.dni)) {
      throw new ErrorNegocio(409, 'Ya existe un cliente con ese DNI.');
    }
    const cliente = await clienteModelo.crear({ ...datos, creado_por: peticion.usuario.id });
    respuesta.status(201).json(cliente);
  }),

  // PUT /api/v1/clientes/:id
  actualizar: manejar(async (peticion, respuesta) => {
    const id = entero(peticion.params.id);
    const datos = validarCliente(peticion.body);
    const otro = await clienteModelo.obtenerPorDni(datos.dni);
    if (otro && otro.id !== id) throw new ErrorNegocio(409, 'Ese DNI ya pertenece a otro cliente.');
    const cliente = await clienteModelo.actualizar(id, datos);
    if (!cliente) throw new ErrorNegocio(404, 'El cliente no existe.');
    respuesta.json(cliente);
  })
};

export default clienteControlador;
