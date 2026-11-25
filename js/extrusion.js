/* ============================================================
   extrusion.js - pestaña de extrusión: dibujas un plano (perfil
   cerrado) y se extruye los mm que indiques.
   ============================================================ */
(function (global) {
  'use strict';

  const RP = global.RP;
  const U = RP.util;

  let visor = null;
  let boceto = null;

  const TOL = 0.04;

  function construir() {
    const p = boceto.construirPerfil(TOL);
    if (!p.puntos || p.puntos.length < 3) {
      return { error: 'Dibuja un contorno con al menos 3 puntos.', piezas: [] };
    }
    const perfil = RP.prepararPerfil(p.puntos);
    if (perfil.length < 3) return { error: 'El contorno no es válido.', piezas: [] };

    const grosor = Math.max(0.1, U.num('ext-grosor', 10));
    const malla = RP.extruir(perfil, grosor);
    return {
      piezas: [{ malla, nombre: 'extrusión' }],
      vol: Math.abs(malla.volumen()),
      tris: malla.f.length,
      error: null,
      cerrado: p.cerrado
    };
  }

  function actualizar(auto) {
    const r = construir();
    const info = document.getElementById('ext-info');
    if (r.error) {
      visor.mostrar([], { autoEncuadrar: false });
      info.innerHTML = '<span class="error">' + r.error + '</span>';
      return r;
    }
    const color = (RP.estado && RP.estado.colores && RP.estado.colores.extrusion) || 0x2f80ed;
    visor.mostrar(
      r.piezas.map((q) => ({ malla: q.malla, color, metal: 0, rough: 0.62 })),
      { autoEncuadre: !!auto }
    );
    const c = r.piezas[0].malla.caja();
    info.innerHTML = U.infoHTML(c.tam, 1, r.tris, r.vol / 1000, (r.vol / 1000) * 1.24);
    return r;
  }

  function iniciar() {
    visor = new RP.Visor(document.getElementById('visor-ext'));

    boceto = RP.crearBoceto({
      canvas: document.getElementById('lienzo-ext'),
      estado: 'ext-estado',
      tab: 'tab-extrusion',
      modo: 'ext',
      herramientaInicial: 'linea',
      alCambiar: U.debounce(() => actualizar(false), 160)
    });
    RP.boceto2 = boceto;

    const diferido = U.debounce(() => actualizar(false), 120);
    const g = document.getElementById('ext-grosor');
    g.addEventListener('input', diferido);
    g.addEventListener('change', diferido);

    document.getElementById('ext-paso').addEventListener('change', (e) => {
      boceto.ajustarPaso(parseFloat(e.target.value));
    });
    document.getElementById('ext-btn-deshacer').addEventListener('click', () => boceto.deshacer());
    document.getElementById('ext-btn-limpiar').addEventListener('click', () => boceto.limpiar());
    document.getElementById('ext-btn-ejemplo').addEventListener('click', () => {
      boceto.cargarEjemplo('ext');
      setTimeout(() => actualizar(true), 30);
    });
    document.getElementById('ext-btn-rect').addEventListener('click', () => {
      boceto.cargarEjemplo('rect');
      setTimeout(() => actualizar(true), 30);
    });
    document.getElementById('ext-btn-placa').addEventListener('click', () => {
      boceto.cargarEjemplo('placa');
      setTimeout(() => actualizar(true), 30);
    });
    document.getElementById('ext-btn-encuadrar-boceto').addEventListener('click', () => boceto.encuadrar());

    const exportar = (tipo) => {
      const r = actualizar(false);
      if (!r || r.error) { alert(r ? r.error : 'No hay pieza que exportar.'); return; }
      if (tipo === 'step') {
        RP.exportar.descargar('gridup-extrusion.step',
          RP.exportar.generarSTEP(r.piezas, 'gridup-extrusion'), 'application/step');
      } else {
        RP.exportar.descargar('gridup-extrusion.stl', RP.exportar.generarSTL(r.piezas), 'model/stl');
      }
    };
    document.getElementById('ext-btn-step').addEventListener('click', () => exportar('step'));
    document.getElementById('ext-btn-stl').addEventListener('click', () => exportar('stl'));

    document.getElementById('ext-btn-encuadrar').addEventListener('click', () => visor.encuadrar());
    document.getElementById('ext-btn-iso').addEventListener('click', () => visor.vistaIso());
    document.getElementById('ext-btn-sup').addEventListener('click', () => visor.vistaSuperior());
    document.getElementById('ext-btn-front').addEventListener('click', () => visor.vistaFrontal());

    actualizar(true);
  }

  global.RP.extrusion = {
    iniciar,
    construir,
    get visor() { return visor; },
    get boceto() { return boceto; }
  };
})(window);
