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
    const cal = CALIDAD[document.getElementById('rev-resolucion').value] || CALIDAD.media;
    const desp = U.num('rev-desplaz', 0);

    /* Cada zona cerrada del dibujo se revoluciona con su propio tipo. */
    let zonas = RP.boceto.zonas(cal.tol).map((z) => ({ puntos: z.puntos, modo: z.modo }));
    if (!zonas.length) {
      /* sin zonas cerradas: se usa el perfil abierto, cerrado con una línea */
      const p = RP.boceto.construirPerfil(cal.tol);
      if (p.puntos && p.puntos.length >= 3) zonas = [{ puntos: p.puntos, modo: modoActual() }];
    }
    if (!zonas.length) {
      return { error: 'Dibuja una silueta cerrada (al menos 3 puntos).', piezas: [] };
    }

    const piezas = [];
    for (const z of zonas) {
      let perfil = RP.prepararPerfil(z.puntos);
      if (perfil.length < 3) continue;
      if (desp) perfil = perfil.map((q) => [q[0] + desp, q[1]]);

      let minU = Infinity;
      for (const q of perfil) minU = Math.min(minU, q[0]);
      if (minU < -1e-4) {
        return {
          error: 'El perfil no puede cruzar el eje (radio < 0). Desplázalo a la derecha o ajusta el desplazamiento radial.',
          piezas: []
        };
      }
      if (z.modo === 'torno') {
        piezas.push({ malla: RP.torno(perfil, cal.segs, 0), nombre: 'torno' });
      } else {
        piezas.push({
          malla: RP.tornoPoligonal(perfil, LADOS[z.modo] || 4),
          nombre: 'revolución ' + (NOMBRE[z.modo] || z.modo)
        });
      }
    }
    if (!piezas.length) return { error: 'El perfil no es válido.', piezas: [] };

    let vol = 0, tris = 0;
    for (const q of piezas) {
      vol += Math.abs(q.malla.volumen());
      tris += q.malla.f.length;
    }
    return { piezas, vol, tris, error: null };
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

  const DESCR = {
    torno: 'Torno: el perfil gira alrededor del eje vertical; el radio (x) es el radio de la pieza.',
    cuadrado: 'Cuadrado: sección cuadrada; la apotema es el radio (x), un perfil de 10 mm da una base de 20 mm.',
    hexagono: 'Hexágono: sección hexagonal regular; la apotema es el radio (x).',
    octogono: 'Octógono: sección octogonal regular; la apotema es el radio (x).'
  };

  function ponerRadio(modo) {
    const r = document.querySelector('input[name="rev-modo"][value="' + modo + '"]');
    if (r) r.checked = true;
  }

  function actualizarVisibilidadTamano(zona) {
    const info = document.getElementById('rev-zona-info');
    const btn = document.getElementById('rev-btn-todas');
    const nota = document.getElementById('rev-nota');
    if (zona === undefined) zona = RP.boceto ? RP.boceto.zonaSeleccionada() : null;
    if (zona) {
      ponerRadio(zona.modo);
      info.textContent = 'Zona ' + zona.indice + ' de ' + zona.total + ' seleccionada: elige su tipo de revolución.';
      info.classList.add('activa');
      btn.style.display = '';
    } else {
      info.textContent = 'Sin zona elegida: el tipo se aplica a todas. Con la herramienta Flecha puedes pulsar una zona cerrada para darle su propio tipo.';
      info.classList.remove('activa');
      btn.style.display = 'none';
    }
    if (nota) nota.textContent = DESCR[modoActual()] || '';
  }

  function iniciar() {
    visor = new RP.Visor(document.getElementById('visor-rev'));

    RP.boceto = RP.crearBoceto({
      canvas: document.getElementById('lienzo'),
      estado: 'rev-estado',
      tab: 'tab-revolucion',
      modo: 'rev',
      zonas: true,
      herramientaInicial: 'flecha',
      alZona: (z) => actualizarVisibilidadTamano(z),
      alCambiar: U.debounce(() => actualizar(false), 160)
    });

    document.querySelectorAll('input[name="rev-modo"]').forEach((r) => {
      r.addEventListener('change', () => {
        const m = modoActual();
        if (RP.boceto.zonaSeleccionada()) RP.boceto.ponerModoZonaSel(m);
        else RP.boceto.ponerModoDefecto(m);
        actualizarVisibilidadTamano();
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
    document.getElementById('rev-btn-todas').addEventListener('click', () => {
      RP.boceto.ponerModoDefecto(modoActual());
      actualizarVisibilidadTamano();
      actualizar(false);
    });
    document.getElementById('rev-btn-ornamento').addEventListener('click', () => {
      RP.boceto.cargarEjemplo('ornamento');
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
