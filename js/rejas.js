/* ============================================================
   rejas.js - pestaña de rejas / celosías
   ============================================================ */
(function (global) {
  'use strict';

  const RP = global.RP;
  const U = RP.util;
  const P = RP.primitivas;

  let visor = null;
  let deco = [];
  let primera = true;
  let colocando = null;   // tipo de elemento a colocar con el siguiente clic

  const TIPOS = {
    esfera: 'Esfera',
    cubo: 'Cubo',
    rombo: 'Rombo',
    cono: 'Cono',
    cilindro: 'Cilindro',
    toro: 'Anillo'
  };

  function leerCfg() {
    return {
      ancho: Math.max(2, U.num('r-ancho', 80)),
      alto: Math.max(2, U.num('r-alto', 100)),
      fondo: Math.max(0.6, U.num('r-fondo', 3)),
      marco: U.chk('r-marco'),
      grosorMarco: Math.max(0.4, U.num('r-marco-grosor', 5)),
      nv: Math.max(0, Math.round(U.num('r-nv', 4))),
      gv: Math.max(0.4, U.num('r-gv', 2.4)),
      nh: Math.max(0, Math.round(U.num('r-nh', 3))),
      gh: Math.max(0.4, U.num('r-gh', 2.4)),
      offV: U.num('r-off-v', 0),
      offH: U.num('r-off-h', 0),
      deco: deco
    };
  }


  /* Contorno limpio de la unión de rectángulos (barras + marco) vista de
     frente: las barras se solapan, así que sus aristas internas no se
     dibujan; solo el perímetro real de la reja, en ambas caras, más las
     aristas de profundidad en las esquinas. */
  function contornoUnion(rects, D) {
    if (!rects.length) return { lineas: null, puntos: null };
    const q = (v) => Math.round(v * 1e6) / 1e6;
    const xsS = new Set(), zsS = new Set();
    for (const r of rects) { xsS.add(q(r[0])); xsS.add(q(r[1])); zsS.add(q(r[2])); zsS.add(q(r[3])); }
    const xs = Array.from(xsS).sort((a, b) => a - b);
    const zs = Array.from(zsS).sort((a, b) => a - b);
    const nx = xs.length - 1, nz = zs.length - 1;
    if (nx < 1 || nz < 1) return { lineas: null, puntos: null };

    const cub = [];
    for (let i = 0; i < nx; i++) {
      cub.push([]);
      const cx = (xs[i] + xs[i + 1]) / 2;
      for (let j = 0; j < nz; j++) {
        const cz = (zs[j] + zs[j + 1]) / 2;
        let c = false;
        for (const r of rects) {
          if (cx > r[0] && cx < r[1] && cz > r[2] && cz < r[3]) { c = true; break; }
        }
        cub[i].push(c);
      }
    }
    const cell = (i, j) => (i >= 0 && j >= 0 && i < nx && j < nz) ? cub[i][j] : false;

    const lin = [];
    const h = D / 2;
    const seg2 = (x0, z0, x1, z1) => {
      lin.push(x0, -h, z0, x1, -h, z1, x0, h, z0, x1, h, z1);
    };
    /* bordes horizontales (z constante), fundiendo tramos contiguos */
    for (let j = 0; j <= nz; j++) {
      let ini = -1;
      for (let i = 0; i <= nx; i++) {
        const hay = i < nx && (cell(i, j - 1) !== cell(i, j));
        if (hay && ini < 0) ini = i;
        if (!hay && ini >= 0) { seg2(xs[ini], zs[j], xs[i], zs[j]); ini = -1; }
      }
    }
    /* bordes verticales (x constante) */
    for (let i = 0; i <= nx; i++) {
      let ini = -1;
      for (let j = 0; j <= nz; j++) {
        const hay = j < nz && (cell(i - 1, j) !== cell(i, j));
        if (hay && ini < 0) ini = j;
        if (!hay && ini >= 0) { seg2(xs[i], zs[ini], xs[i], zs[j]); ini = -1; }
      }
    }
    /* esquinas: arista de profundidad y punto */
    const pts = [];
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        const n = (cell(i - 1, j - 1) ? 1 : 0) + (cell(i, j - 1) ? 1 : 0) +
          (cell(i - 1, j) ? 1 : 0) + (cell(i, j) ? 1 : 0);
        const diag = n === 2 && cell(i - 1, j - 1) === cell(i, j);
        if (n === 1 || n === 3 || diag) {
          lin.push(xs[i], -h, zs[j], xs[i], h, zs[j]);
          pts.push(xs[i], -h, zs[j], xs[i], h, zs[j]);
        }
      }
    }
    return { lineas: new Float32Array(lin), puntos: pts.length ? new Float32Array(pts) : null };
  }

  function construir(cfg) {
    const piezas = [];
    const rects = [];
    const rc = (nombre, malla, x0, x1, z0, z1) => {
      piezas.push({ malla, nombre, sinAristas: true });
      rects.push([x0, x1, z0, z1]);
    };
    const W = cfg.ancho, H = cfg.alto, D = cfg.fondo;

    let gm = 0;
    if (cfg.marco) gm = Math.min(cfg.grosorMarco, Math.min(W, H) / 2 - 0.3);
    if (gm < 0.3) gm = 0;

    const x0 = gm, x1 = W - gm, z0 = gm, z1 = H - gm;
    const sol = gm > 0 ? Math.min(0.5, gm * 0.4) : 0;

    if (gm > 0) {
      const hi = Math.max(0.2, H - 2 * gm);
      rc('marco inferior', P.caja(W / 2, 0, gm / 2, W, D, gm), 0, W, 0, gm);
      rc('marco superior', P.caja(W / 2, 0, H - gm / 2, W, D, gm), 0, W, H - gm, H);
      rc('marco izquierdo', P.caja(gm / 2, 0, H / 2, gm, D, hi), 0, gm, H / 2 - hi / 2, H / 2 + hi / 2);
      rc('marco derecho', P.caja(W - gm / 2, 0, H / 2, gm, D, hi), W - gm, W, H / 2 - hi / 2, H / 2 + hi / 2);
    }

    const zA = gm > 0 ? z0 - sol : 0;
    const zB = gm > 0 ? z1 + sol : H;
    for (let i = 0; i < cfg.nv; i++) {
      const x = x0 + (x1 - x0) * (i + 1) / (cfg.nv + 1) + cfg.offV;
      rc('barra vertical ' + (i + 1), P.caja(x, 0, (zA + zB) / 2, cfg.gv, D, zB - zA),
        x - cfg.gv / 2, x + cfg.gv / 2, zA, zB);
    }

    const xA = gm > 0 ? x0 - sol : 0;
    const xB = gm > 0 ? x1 + sol : W;
    for (let i = 0; i < cfg.nh; i++) {
      const z = z0 + (z1 - z0) * (i + 1) / (cfg.nh + 1) + cfg.offH;
      rc('barra horizontal ' + (i + 1), P.caja((xA + xB) / 2, 0, z, xB - xA, D, cfg.gh),
        xA, xB, z - cfg.gh / 2, z + cfg.gh / 2);
    }

    for (let i = 0; i < cfg.deco.length; i++) {
      const d = cfg.deco[i];
      const t = Math.max(0.3, d.tam);
      let m = null;
      if (d.tipo === 'esfera') m = P.esfera(d.x, d.y, d.z, t / 2, 28, 14);
      else if (d.tipo === 'cubo') m = P.caja(d.x, d.y, d.z, t, t, t);
      else if (d.tipo === 'rombo') m = P.octaedro(d.x, d.y, d.z, t / 2);
      else if (d.tipo === 'cono') m = P.cono(d.x, d.y, d.z - t / 2, t / 2, t, 28);
      else if (d.tipo === 'cilindro') m = P.cilindro(d.x, d.y, d.z - t / 2, t / 2, t, 28);
      else if (d.tipo === 'toro') m = P.toro(d.x, d.y, d.z, t / 2, Math.max(0.3, t / 6), 36, 16);
      if (m) piezas.push({ malla: m, nombre: TIPOS[d.tipo] + ' ' + (i + 1) });
    }

    let vol = 0;
    for (const p of piezas) vol += Math.abs(p.malla.volumen());
    if (cfg.nv > 0 && cfg.nh > 0) vol -= cfg.nv * cfg.nh * cfg.gv * cfg.gh * D;

    /* La reja se modela de pie (x ancho, y fondo, z alto) y se entrega
       tumbada sobre el plano XY: (x, y, z) -> (x, z, y + fondo/2).
       Así apoya en la rejilla del visor y sale lista para imprimir. */
    const borde = contornoUnion(rects, D);
    const rot = (p) => [p[0], p[2], p[1] + D / 2];
    const rotArr = (a) => {
      if (!a) return null;
      const o = new Float32Array(a.length);
      for (let i = 0; i < a.length; i += 3) { o[i] = a[i]; o[i + 1] = a[i + 2]; o[i + 2] = a[i + 1] + D / 2; }
      return o;
    };
    for (const p of piezas) { p.malla.transformar(rot); p.malla.orientar(); }
    return { piezas, vol, lineas: rotArr(borde.lineas), puntos: rotArr(borde.puntos) };
  }

  function actualizar(auto) {
    const cfg = leerCfg();
    const r = construir(cfg);
    const color = (RP.estado && RP.estado.colores && RP.estado.colores.rejas) || 0x2f80ed;
    visor.mostrar(
      r.piezas.map((p) => ({ malla: p.malla, color, metal: 0, rough: 0.62, sinAristas: p.sinAristas })),
      { autoEncuadrar: !!auto, lineas: r.lineas, puntos: r.puntos }
    );

    let tris = 0;
    const caja = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const p of r.piezas) {
      tris += p.malla.f.length;
      const c = p.malla.caja();
      for (let i = 0; i < 3; i++) {
        caja.min[i] = Math.min(caja.min[i], c.min[i]);
        caja.max[i] = Math.max(caja.max[i], c.max[i]);
      }
    }
    const tam = [caja.max[0] - caja.min[0], caja.max[1] - caja.min[1], caja.max[2] - caja.min[2]];
    const gramos = (r.vol / 1000) * 1.24;

    document.getElementById('r-info').innerHTML =
      U.infoHTML([tam[0], tam[2], tam[1]], r.piezas.length, tris, r.vol / 1000, gramos);

    return r;
  }

  function pintarDeco() {
    const cont = document.getElementById('r-deco-lista');
    cont.innerHTML = '';
    if (!deco.length) {
      cont.appendChild(U.el('p', 'vacio', 'Sin elementos decorativos.'));
      return;
    }
    deco.forEach((d, i) => {
      const fila = U.el('div', 'deco-item');
      const cab = U.el('div', 'deco-cab');
      cab.appendChild(U.el('span', null, TIPOS[d.tipo] || d.tipo));
      const bx = U.el('button', 'btn-x', '✕');
      bx.title = 'Quitar';
      bx.addEventListener('click', () => { deco.splice(i, 1); pintarDeco(); actualizar(false); });
      cab.appendChild(bx);
      fila.appendChild(cab);

      const campos = U.el('div', 'deco-campos');
      const defs = [['tam', 'Tamaño'], ['x', 'X'], ['y', 'Y'], ['z', 'Z']];
      defs.forEach(([campo, etq]) => {
        const lab = U.el('label');
        lab.appendChild(U.el('span', null, etq));
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = '0.5';
        inp.value = d[campo];
        inp.addEventListener('input', () => {
          d[campo] = parseFloat(inp.value) || 0;
          actualizar(false);
        });
        lab.appendChild(inp);
        campos.appendChild(lab);
      });
      fila.appendChild(campos);
      cont.appendChild(fila);
    });
  }

  function iniciar() {
    visor = new RP.Visor(document.getElementById('visor-rejas'), { sombra: false });

    const ids = ['r-ancho', 'r-alto', 'r-fondo', 'r-marco', 'r-marco-grosor', 'r-nv', 'r-gv',
      'r-nh', 'r-gh', 'r-off-v', 'r-off-h'];
    const diferido = U.debounce(() => actualizar(false), 130);
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', diferido);
      el.addEventListener('change', diferido);
    });

    const TAM_DECO = 8;
    const btnAdd = document.getElementById('r-deco-add');
    const nota = document.getElementById('r-deco-ayuda');

    function salirColocar() {
      colocando = null;
      btnAdd.textContent = '+ Añadir';
      btnAdd.classList.remove('activo');
      if (nota) nota.textContent = '';
      visor.cursor('');
      visor.marcador(null);
      visor.alClic = null;
      visor.alMover = null;
    }

    /* Plano de la reja a media profundidad (mundo: z = fondo/2).
       Mundo (X, Y) = (x, z) de la reja. */
    function puntoReja(cx, cy) {
      const cfg = leerCfg();
      const p = visor.pickPlano(cx, cy, cfg.fondo / 2);
      if (!p) return null;
      const W = cfg.ancho, H = cfg.alto;
      let gm = cfg.marco ? Math.min(cfg.grosorMarco, Math.min(W, H) / 2 - 0.3) : 0;
      if (gm < 0.3) gm = 0;
      /* líneas de anclaje: centros de barras y bordes del marco */
      const ax = [0, W, gm, W - gm], az = [0, H, gm, H - gm];
      for (let i = 0; i < cfg.nv; i++) ax.push(gm + (W - 2 * gm) * (i + 1) / (cfg.nv + 1) + cfg.offV);
      for (let i = 0; i < cfg.nh; i++) az.push(gm + (H - 2 * gm) * (i + 1) / (cfg.nh + 1) + cfg.offH);
      /* radio de imán: unos 10 px en pantalla */
      const umbral = Math.max(0.8, visor.c.dist * 0.014);
      const imanta = (v, lista) => {
        let mejor = null, d = umbral;
        for (const a of lista) { const dd = Math.abs(v - a); if (dd < d) { d = dd; mejor = a; } }
        return mejor;
      };
      const mx = imanta(p[0], ax), mz = imanta(p[1], az);
      const redondea = (v) => Math.round(v * 2) / 2;
      return {
        x: mx !== null ? Math.round(mx * 100) / 100 : redondea(p[0]),
        z: mz !== null ? Math.round(mz * 100) / 100 : redondea(p[1]),
        iman: mx !== null || mz !== null,
        cfg
      };
    }

    function entrarColocar(tipo) {
      colocando = tipo;
      btnAdd.textContent = 'Cancelar';
      btnAdd.classList.add('activo');
      if (nota) nota.textContent = 'Pulsa sobre la reja para colocar el elemento (se imanta a barras y marco, en verde). Esc para cancelar.';
      visor.cursor('crosshair');
      visor.alMover = (cx, cy) => {
        const q = puntoReja(cx, cy);
        if (q) visor.marcador(q.x, q.z, q.cfg.fondo / 2 + 0.05, TAM_DECO / 2, q.iman ? 0x2e9e6b : 0x8656fb);
        else visor.marcador(null);
      };
      visor.alClic = (cx, cy) => {
        const q = puntoReja(cx, cy);
        if (!q) return false;
        deco.push({ tipo: colocando, tam: TAM_DECO, x: q.x, y: 0, z: q.z });
        salirColocar();
        pintarDeco();
        actualizar(false);
        return true;
      };
    }

    btnAdd.addEventListener('click', () => {
      if (colocando) { salirColocar(); return; }
      entrarColocar(document.getElementById('r-deco-tipo').value);
    });
    document.getElementById('r-deco-tipo').addEventListener('change', () => {
      if (colocando) entrarColocar(document.getElementById('r-deco-tipo').value);
    });
    global.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && colocando) salirColocar();
    });

    document.getElementById('r-btn-step').addEventListener('click', () => {
      const r = actualizar(false);
      const txt = RP.exportar.generarSTEP(r.piezas, 'reja');
      RP.exportar.descargar('gridup-reja.step', txt, 'application/step');
    });
    document.getElementById('r-btn-stl').addEventListener('click', () => {
      const r = actualizar(false);
      const buf = RP.exportar.generarSTL(r.piezas);
      RP.exportar.descargar('gridup-reja.stl', buf, 'model/stl');
    });
    document.getElementById('r-btn-encuadrar').addEventListener('click', () => visor.encuadrar());
    document.getElementById('r-btn-frontal').addEventListener('click', () => visor.vistaSuperior());
    document.getElementById('r-btn-superior').addEventListener('click', () => visor.vistaFrontal());
    document.getElementById('r-btn-iso').addEventListener('click', () => visor.vistaIso());

    pintarDeco();
    actualizar(true);
    primera = false;
  }

  global.RP.rejas = {
    iniciar,
    construir,
    leerCfg,
    get visor() { return visor; }
  };
})(window);
