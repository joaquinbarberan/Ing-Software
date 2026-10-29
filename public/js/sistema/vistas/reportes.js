// CU-15 · Emitir reportes de ingresos (RF11). Sólo Gerencia y Administración (RNF05).
import { api, query } from '../api.js';
import { ponerMigas, reemplazarRuta } from '../navegacion.js';
import { esc, pesos, hoy, aFecha, aTexto, fechaCorta, nombreMes, ESTADOS, panelError } from '../util.js';

function nombreDeMes(clave) {
  const [anio, mes] = clave.split('-').map(Number);
  return `${nombreMes(mes - 1).slice(0, 3)} ${anio}`;
}

// Barras horizontales simples: cada fila con su valor escrito, así se lee aunque no se vea el color
function barras(filas, { valor, etiqueta, formato = pesos }) {
  const maximo = Math.max(...filas.map(valor), 1);
  return `<div class="barras">${filas.map(fila => `
    <div class="barra-fila">
      <span class="barra-etiqueta">${etiqueta(fila)}</span>
      <span class="barra-pista"><span class="barra-relleno" style="width:${(valor(fila) / maximo) * 100}%"></span></span>
      <span class="barra-valor">${formato(valor(fila))}</span>
    </div>`).join('')}</div>`;
}

export default async function vistaReportes(contenedor, { parametros }) {
  ponerMigas('Caja y cobros', 'Reportes');
  const ahora = aFecha(hoy());
  const desdeInicial = parametros.desde || aTexto(new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1));
  const hastaInicial = parametros.hasta || hoy();

  contenedor.innerHTML = `
    <div class="barra-herramientas">
      <h1>Reportes de gestión</h1>
      <div class="grupo-botones">
        <form class="formulario-linea" id="form-periodo">
          <label class="campo"><span>Desde</span><input type="date" name="desde" value="${desdeInicial}"></label>
          <label class="campo"><span>Hasta</span><input type="date" name="hasta" value="${hastaInicial}"></label>
          <button class="boton boton-primario" type="submit">Generar</button>
        </form>
        <button class="boton boton-secundario" data-imprimir>Imprimir</button>
      </div>
    </div>
    <div id="reporte"></div>`;

  const reporte = contenedor.querySelector('#reporte');
  const formulario = contenedor.querySelector('#form-periodo');

  async function cargar() {
    const periodo = Object.fromEntries(new FormData(formulario));
    reemplazarRuta(`reportes${query(periodo)}`);
    reporte.innerHTML = '<p class="cargando">Generando...</p>';
    let datos;
    try { datos = await api.get(`/reportes${query(periodo)}`); } catch (error) { return panelError(reporte, error, cargar); }
    const r = datos.resumen;
    const estados = Object.entries(r.reservas_por_estado);

    reporte.innerHTML = `
      <p class="subtitulo">Período del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}</p>
      <div class="tarjetas-resumen">
        <div class="tarjeta-dato destacado"><span>Ingresos cobrados</span><strong>${pesos(datos.total_cobrado)}</strong></div>
        <div class="tarjeta-dato"><span>Eventos liquidados</span><strong>${r.eventos_liquidados}</strong></div>
        <div class="tarjeta-dato"><span>Facturado en liquidaciones</span><strong>${pesos(r.facturado)}</strong></div>
        <div class="tarjeta-dato"><span>Excedentes cobrados</span><strong>${pesos(r.excedentes)}</strong><small>${r.personas_excedentes} personas por encima de lo contratado</small></div>
        <div class="tarjeta-dato"><span>Adicionales cobrados</span><strong>${pesos(r.adicionales)}</strong></div>
        <div class="tarjeta-dato"><span>Costo de insumos recibidos</span><strong>${pesos(r.costo_insumos)}</strong></div>
      </div>
      <p class="nota">Excedentes y adicionales son los ingresos que antes se perdían con el registro manual (sección 5.2 del informe).</p>

      <div class="columnas-2">
        <section class="tarjeta">
          <h2>Ingresos por mes</h2>
          ${datos.ingresos_por_mes.length === 0 ? '<p class="nota">Sin cobros en el período.</p>' : `
            ${barras(datos.ingresos_por_mes, { valor: f => Number(f.total), etiqueta: f => nombreDeMes(f.mes) })}
            <div class="tabla-desplazable"><table class="tabla tabla-compacta">
              <thead><tr><th>Mes</th><th class="numero">Efectivo</th><th class="numero">Transf.</th><th class="numero">Mercado Pago</th><th class="numero">Tarjeta</th><th class="numero">Total</th></tr></thead>
              <tbody>${datos.ingresos_por_mes.map(f => `
                <tr><td>${nombreDeMes(f.mes)}</td><td class="numero">${pesos(f.efectivo)}</td><td class="numero">${pesos(f.transferencia)}</td>
                <td class="numero">${pesos(f.mercado_pago)}</td><td class="numero">${pesos(f.tarjeta)}</td><td class="numero"><strong>${pesos(f.total)}</strong></td></tr>`).join('')}
              </tbody>
            </table></div>`}
        </section>

        <section class="tarjeta">
          <h2>Servicios adicionales más vendidos</h2>
          ${datos.ranking_adicionales.length === 0 ? '<p class="nota">Sin consumos adicionales en el período.</p>' : `
            ${barras(datos.ranking_adicionales, { valor: f => Number(f.total), etiqueta: f => esc(f.nombre) })}
            <div class="tabla-desplazable"><table class="tabla tabla-compacta">
              <thead><tr><th>#</th><th>Adicional</th><th class="numero">Cantidad</th><th class="numero">Eventos</th><th class="numero">Total</th></tr></thead>
              <tbody>${datos.ranking_adicionales.map((f, i) => `
                <tr><td>${i + 1}</td><td>${esc(f.nombre)}</td><td class="numero">${Number(f.cantidad)}</td><td class="numero">${f.eventos}</td><td class="numero">${pesos(f.total)}</td></tr>`).join('')}
              </tbody>
            </table></div>`}
        </section>
      </div>

      <section class="tarjeta">
        <h2>Reservas del período por estado</h2>
        ${estados.length === 0 ? '<p class="nota">Sin reservas en el período.</p>' : `
          <div class="leyenda">${estados.map(([estado, cantidad]) => `<span><i class="muestra ${ESTADOS[estado]?.clase || ''}"></i>${ESTADOS[estado]?.nombre || estado}: <strong>${cantidad}</strong></span>`).join('')}</div>`}
      </section>`;
  }

  formulario.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
  contenedor.querySelector('[data-imprimir]').addEventListener('click', () => window.print());
  await cargar();
}
