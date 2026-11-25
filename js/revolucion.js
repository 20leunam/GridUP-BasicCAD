/* ============================================================
   revolucion.js - pestaña de piezas de revolución
   ============================================================ */
(function (global) {
  'use strict';

  const RP = global.RP;
  const U = RP.util;

  let visor = null;
  let ultimo = null;

  const CALIDAD = {
    baja: { segs: 48, tol: 0.12 },
    media: { segs: 80, tol: 0.05 },
    alta: { segs: 128, tol: 0.022 }
  };

  const LADOS = { cuadrado: 4, hexagono: 6, octogono: 8 };
  const NOMBRE = {
    torno: 'torno',
    cuadrado: 'cuadrado',
    hexagono: 'hexágono',
    octogono: 'octógono'
  };

  function modoActual() {
    const el = document.querySelector('input[name="rev-modo"]:checked');
    return el ? el.value : 'torno';
  }

  function construir() {
    const modo = modoActual();
    const cal = CALIDAD[document.getElementById('rev-resolucion').value] || CALIDAD.media;
    const p = RP.boceto.construirPerfil(cal.tol);

    if (!p.puntos || p.puntos.length < 3) {
      return { error: 'Dibuja una silueta con al menos 3 puntos.', piezas: [], perfil: p };
    }

    let perfil = RP.prepararPerfil(p.puntos);
    if (perfil.length < 3) {
      return { error: 'El perfil no es válido.', piezas: [], perfil: p };
    }

    /* El desplazamiento es radial: suma o resta a la coordenada x del perfil. */
    const desp = U.num('rev-desplaz', 0);
    if (desp) perfil = perfil.map((q) => [q[0] + desp, q[1]]);

    let minU = Infinity;
    for (const q of perfil) minU = Math.min(minU, q[0]);
    if (minU < -1e-4) {
      return {
        error: 'El perfil no puede cruzar el eje (radio < 0). Desplázalo a la derecha o ajusta el desplazamiento radial.',
        piezas: [], perfil: p
      };
    }

    let malla;
    let nombre;
    if (modo === 'torno') {
      malla = RP.torno(perfil, cal.segs, 0);
      nombre = 'torno';
    } else {
      malla = RP.tornoPoligonal(perfil, LADOS[modo] || 4);
      nombre = 'revolución ' + NOMBRE[modo];
    }

    const piezas = [{ malla, nombre }];
    let vol = 0, tris = 0;
    for (const q of piezas) {
      vol += Math.abs(q.malla.volumen());
      tris += q.malla.f.length;
    }
    return { piezas, vol, tris, perfil: p, error: null, modo };
  }

  function actualizar(auto) {
    const r = construir();
    ultimo = r;
    const info = document.getElementById('rev-info');

    if (r.error) {
      visor.mostrar([], { autoEncuadrar: false });
      info.innerHTML = '<span class="error">' + r.error + '</span>';
      return r;
    }

    const color = (RP.estado && RP.estado.colores && RP.estado.colores.revolucion) || 0x2f80ed;
    visor.mostrar(
      r.piezas.map((q) => ({ malla: q.malla, color, metal: 0, rough: 0.62 })),
      { autoEncuadrar: !!auto }
    );

    const caja = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const q of r.piezas) {
      const c = q.malla.caja();
      for (let i = 0; i < 3; i++) {
        caja.min[i] = Math.min(caja.min[i], c.min[i]);
        caja.max[i] = Math.max(caja.max[i], c.max[i]);
      }
    }
    const tam = [caja.max[0] - caja.min[0], caja.max[1] - caja.min[1], caja.max[2] - caja.min[2]];
    const gramos = (r.vol / 1000) * 1.24;

    info.innerHTML = U.infoHTML(tam, r.piezas.length, r.tris, r.vol / 1000, gramos);

    return r;
  }

  function actualizarVisibilidadTamano() {
    const modo = modoActual();
    const filaCal = document.getElementById('fila-calidad');
    if (filaCal) filaCal.style.display = modo === 'torno' ? '' : 'none';

    const nota = document.getElementById('rev-nota');
    if (!nota) return;
    if (modo === 'torno') {
      nota.textContent = 'Torno: el perfil gira alrededor del eje vertical. El radio del dibujo (x) es el radio de la pieza.';
    } else {
      nota.textContent = 'Revolución ' + NOMBRE[modo] + ': la sección transversal es un ' + NOMBRE[modo] +
        ' regular. La apotema es el radio del dibujo (x); un perfil de 10 mm genera una base de 20 mm.';
    }
  }

  function iniciar() {
    visor = new RP.Visor(document.getElementById('visor-rev'));

    RP.boceto = RP.crearBoceto({
      canvas: document.getElementById('lienzo'),
      estado: 'rev-estado',
      tab: 'tab-revolucion',
      modo: 'rev',
      alCambiar: U.debounce(() => actualizar(false), 160)
    });

    document.querySelectorAll('input[name="rev-modo"]').forEach((r) => {
      r.addEventListener('change', () => {
        actualizarVisibilidadTamano();
        RP.boceto.redibujar();
        actualizar(false);
      });
    });

    const diferido = U.debounce(() => actualizar(false), 140);
    ['rev-desplaz', 'rev-resolucion'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', diferido);
      if (el) el.addEventListener('change', diferido);
    });

    document.getElementById('rev-paso').addEventListener('change', (e) => {
      RP.boceto.ajustarPaso(parseFloat(e.target.value));
    });

    document.getElementById('rev-btn-deshacer').addEventListener('click', () => RP.boceto.deshacer());
    document.getElementById('rev-btn-limpiar').addEventListener('click', () => RP.boceto.limpiar());
    document.getElementById('rev-btn-ejemplo').addEventListener('click', () => {
      RP.boceto.cargarEjemplo('rev');
      setTimeout(() => actualizar(true), 30);
    });
    const btnCubo = document.getElementById('rev-btn-cubo');
    if (btnCubo) {
      btnCubo.addEventListener('click', () => {
        RP.boceto.cargarCubo();
        setTimeout(() => actualizar(true), 30);
      });
    }
    document.getElementById('rev-btn-encuadrar-boceto').addEventListener('click', () => RP.boceto.encuadrar());

    document.getElementById('rev-btn-step').addEventListener('click', () => {
      const r = actualizar(false);
      if (!r || r.error) { alert(r ? r.error : 'No hay pieza que exportar.'); return; }
      const txt = RP.exportar.generarSTEP(r.piezas, 'gridup-revolucion');
      RP.exportar.descargar('gridup-revolucion.step', txt, 'application/step');
    });
    document.getElementById('rev-btn-stl').addEventListener('click', () => {
      const r = actualizar(false);
      if (!r || r.error) { alert(r ? r.error : 'No hay pieza que exportar.'); return; }
      RP.exportar.descargar('gridup-revolucion.stl', RP.exportar.generarSTL(r.piezas), 'model/stl');
    });

    document.getElementById('rev-btn-encuadrar').addEventListener('click', () => visor.encuadrar());
    document.getElementById('rev-btn-iso').addEventListener('click', () => visor.vistaIso());
    document.getElementById('rev-btn-sup').addEventListener('click', () => visor.vistaSuperior());
    document.getElementById('rev-btn-front').addEventListener('click', () => visor.vistaFrontal());

    actualizarVisibilidadTamano();
    actualizar(true);
  }

  global.RP.revolucion = {
    iniciar,
    construir,
    get visor() { return visor; }
  };
})(window);
