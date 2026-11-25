/* ============================================================
   boceto.js - editor de silueta sobre rejilla milimétrica

   Fábrica: RP.crearBoceto(cfg) devuelve un editor independiente.
   Se usa dos veces: pestaña de revolución (con eje) y pestaña de
   extrusión (plano XY).

   Dibujo encadenado: cada línea/arco empieza donde terminó el
   anterior, de modo que una pieza entera se dibuja solo con ir
   pulsando puntos. Se termina con Esc, doble clic o cerrando el
   contorno sobre el primer punto.
   ============================================================ */
(function (global) {
  'use strict';

  const RP = global.RP;
  const TAU = Math.PI * 2;

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /* ---------- geometría de arcos (compartida) ---------- */
  function circuncentro(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-9) return null;
    const a2 = a[0] * a[0] + a[1] * a[1];
    const b2 = b[0] * b[0] + b[1] * b[1];
    const c2 = c[0] * c[0] + c[1] * c[1];
    const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
    const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
  }

  function norm2(a) {
    a = a % TAU;
    return a < 0 ? a + TAU : a;
  }

  function arcoPuntos(a, b, m, tol) {
    const cr = circuncentro(a, b, m);
    if (!cr || !isFinite(cr.r) || cr.r > 1e6) return [a, b];
    const ta = Math.atan2(a[1] - cr.c[1], a[0] - cr.c[0]);
    const tb = Math.atan2(b[1] - cr.c[1], b[0] - cr.c[0]);
    const tm = Math.atan2(m[1] - cr.c[1], m[0] - cr.c[0]);
    const ccwTotal = norm2(tb - ta);
    const mCcw = norm2(tm - ta);
    let barrido = mCcw < ccwTotal ? ccwTotal : -(TAU - ccwTotal);
    if (Math.abs(barrido) < 1e-6) barrido = TAU;
    const cosT = Math.max(-1, Math.min(1, 1 - (tol || 0.04) / Math.max(cr.r, 1e-6)));
    const dAng = 2 * Math.acos(cosT);
    let n = Math.ceil(Math.abs(barrido) / Math.max(dAng, 0.01));
    n = Math.max(2, Math.min(360, n));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = ta + barrido * (i / n);
      pts.push([cr.c[0] + cr.r * Math.cos(t), cr.c[1] + cr.r * Math.sin(t)]);
    }
    pts[0] = [a[0], a[1]];
    pts[n] = [b[0], b[1]];
    return pts;
  }

  function puntosSeg(seg, tol) {
    if (seg.tipo === 'l') return [seg.a, seg.b];
    return arcoPuntos(seg.a, seg.b, seg.m, tol);
  }

  function distPuntoSegmento(p, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? (wx * vx + wy * vy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t));
  }


  /* ============================================================
     Zonas cerradas del dibujo
     Calcula las caras del grafo plano formado por los segmentos:
     divide los trazos en cruces y uniones en T, poda cabos sueltos
     y recorre los ciclos. Cada ciclo cerrado es una zona.
     ============================================================ */
  function infoArco(seg) {
    const cr = circuncentro(seg.a, seg.b, seg.m);
    if (!cr || !isFinite(cr.r) || cr.r > 1e6) return null;
    const ta = Math.atan2(seg.a[1] - cr.c[1], seg.a[0] - cr.c[0]);
    const tb = Math.atan2(seg.b[1] - cr.c[1], seg.b[0] - cr.c[0]);
    const tm = Math.atan2(seg.m[1] - cr.c[1], seg.m[0] - cr.c[0]);
    const ccwTotal = norm2(tb - ta);
    const mCcw = norm2(tm - ta);
    let barrido = mCcw < ccwTotal ? ccwTotal : -(TAU - ccwTotal);
    if (Math.abs(barrido) < 1e-6) barrido = TAU;
    return { c: cr.c, r: cr.r, ta, barrido };
  }

  /* ¿q está sobre el trazo, lejos de sus extremos? Devuelve fracción de recorrido o -1 */
  function posicionEnSeg(seg, q) {
    if (dist(q, seg.a) < 0.04 || dist(q, seg.b) < 0.04) return -1;
    if (seg.tipo === 'l') {
      if (distPuntoSegmento(q, seg.a, seg.b) > 0.03) return -1;
      const L = dist(seg.a, seg.b);
      return L > 0 ? dist(seg.a, q) / L : -1;
    }
    const inf = infoArco(seg);
    if (!inf) return -1;
    if (Math.abs(dist(q, inf.c) - inf.r) > 0.03) return -1;
    const tq = Math.atan2(q[1] - inf.c[1], q[0] - inf.c[0]);
    const rel = inf.barrido > 0 ? norm2(tq - inf.ta) : norm2(inf.ta - tq);
    if (rel >= Math.abs(inf.barrido) - 1e-6) return -1;
    return rel / Math.abs(inf.barrido);
  }

  function partirSeg(seg, q) {
    if (seg.tipo === 'l') {
      return [{ tipo: 'l', a: seg.a, b: q.slice() }, { tipo: 'l', a: q.slice(), b: seg.b }];
    }
    const inf = infoArco(seg);
    const f = posicionEnSeg(seg, q);
    const s1 = inf.barrido * f, s2 = inf.barrido - s1;
    const pt = (t) => [inf.c[0] + inf.r * Math.cos(t), inf.c[1] + inf.r * Math.sin(t)];
    return [
      { tipo: 'a', a: seg.a, b: q.slice(), m: pt(inf.ta + s1 / 2) },
      { tipo: 'a', a: q.slice(), b: seg.b, m: pt(inf.ta + s1 + s2 / 2) }
    ];
  }

  function cruceLineas(s, t) {
    const x1 = s.a[0], y1 = s.a[1], x2 = s.b[0], y2 = s.b[1];
    const x3 = t.a[0], y3 = t.a[1], x4 = t.b[0], y4 = t.b[1];
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-9) return null;
    const u = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const v = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
    const e = 0.02;
    if (u <= e || u >= 1 - e || v <= e || v >= 1 - e) return null;
    return [x1 + u * (x2 - x1), y1 + u * (y2 - y1)];
  }

  function dividirSegmentos(entrada) {
    let lista = entrada.map((s) => JSON.parse(JSON.stringify(s)));
    for (let guarda = 0; guarda < 400; guarda++) {
      let cambio = false;
      for (let i = 0; i < lista.length && !cambio; i++) {
        const s = lista[i];
        let corte = null;
        for (let j = 0; j < lista.length && !corte; j++) {
          if (i === j) continue;
          const t = lista[j];
          for (const q of [t.a, t.b]) {
            if (posicionEnSeg(s, q) >= 0) { corte = q; break; }
          }
          if (!corte && s.tipo === 'l' && t.tipo === 'l') corte = cruceLineas(s, t);
        }
        if (corte) {
          const partes = partirSeg(s, corte);
          lista.splice(i, 1, partes[0], partes[1]);
          cambio = true;
        }
      }
      if (!cambio) break;
    }
    return lista;
  }

  function puntoEnPoligono(p, poly) {
    let dentro = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) &&
          p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) dentro = !dentro;
    }
    return dentro;
  }

  /* Punto bien dentro de la zona: mitad del tramo interior más largo de una línea horizontal. */
  function puntoInterior(poly) {
    let cy = 0;
    for (const p of poly) cy += p[1];
    cy /= poly.length;
    let mejor = null, largo = -1;
    for (const y of [cy, cy + 0.17, cy - 0.17]) {
      const xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        if (xs[k + 1] - xs[k] > largo) { largo = xs[k + 1] - xs[k]; mejor = [(xs[k] + xs[k + 1]) / 2, y]; }
      }
    }
    return mejor || poly[0];
  }

  function calcularZonas(segsIn, tol) {
    if (!segsIn.length) return [];
    const lista = dividirSegmentos(segsIn);
    const verts = [];
    const vert = (p) => {
      for (let i = 0; i < verts.length; i++) if (dist(verts[i], p) < 0.05) return i;
      verts.push([p[0], p[1]]);
      return verts.length - 1;
    };
    let aristas = [];
    const vistas = new Set();
    for (const s of lista) {
      const u = vert(s.a), v = vert(s.b);
      if (u === v) continue;
      if (s.tipo === 'l') {
        const k = u < v ? u + '_' + v : v + '_' + u;
        if (vistas.has(k)) continue;
        vistas.add(k);
      }
      let pts = puntosSeg(s, tol || 0.04).map((p) => [p[0], p[1]]);
      pts[0] = verts[u].slice();
      pts[pts.length - 1] = verts[v].slice();
      aristas.push({ u, v, pts });
    }
    /* poda de cabos sueltos */
    let cambio = true;
    while (cambio) {
      cambio = false;
      const grado = new Array(verts.length).fill(0);
      for (const e of aristas) { grado[e.u]++; grado[e.v]++; }
      const nuevas = aristas.filter((e) => grado[e.u] > 1 && grado[e.v] > 1);
      if (nuevas.length !== aristas.length) { aristas = nuevas; cambio = true; }
    }
    if (!aristas.length) return [];

    /* semiaristas */
    const he = [];
    aristas.forEach((e) => {
      const r = e.pts.slice().reverse();
      const a = { o: e.u, d: e.v, pts: e.pts, tw: he.length + 1, usado: false };
      const b = { o: e.v, d: e.u, pts: r, tw: he.length, usado: false };
      a.ang = Math.atan2(a.pts[1][1] - a.pts[0][1], a.pts[1][0] - a.pts[0][0]);
      b.ang = Math.atan2(b.pts[1][1] - b.pts[0][1], b.pts[1][0] - b.pts[0][0]);
      he.push(a, b);
    });
    const salen = verts.map(() => []);
    he.forEach((h, i) => salen[h.o].push(i));
    salen.forEach((l) => l.sort((a, b) => he[a].ang - he[b].ang));

    const zonas = [];
    for (let i = 0; i < he.length; i++) {
      if (he[i].usado) continue;
      const pts = [];
      let h = i, guarda = 0, ok = true;
      while (!he[h].usado && guarda++ < he.length + 2) {
        he[h].usado = true;
        const p = he[h].pts;
        for (let k = 0; k < p.length - 1; k++) pts.push(p[k]);
        const l = salen[he[h].d];
        const idx = l.indexOf(he[h].tw);
        if (idx < 0) { ok = false; break; }
        h = l[(idx - 1 + l.length) % l.length];
      }
      if (!ok || h !== i || pts.length < 3) continue;
      const area = RP.areaFirmada(pts);
      if (area > 1e-4) zonas.push({ puntos: pts, area });
    }
    zonas.forEach((z) => { z.interior = puntoInterior(z.puntos); });
    zonas.sort((a, b) => {
      const ia = a.interior, ib = b.interior;
      return Math.abs(ia[1] - ib[1]) > 1e-6 ? ib[1] - ia[1] : ia[0] - ib[0];
    });
    return zonas;
  }

  /* ============================================================ */
  function crearBoceto(cfg) {
    const cv = cfg.canvas;
    const ctx = cv.getContext('2d');
    const modo = cfg.modo || 'rev';           // 'rev' | 'ext'
    const alCambiar = cfg.alCambiar || function () {};
    const raiz = document.getElementById(cfg.tab);
    const elEstado = document.getElementById(cfg.estado);

    let ancho = 800, alto = 600;
    let vista = { esc: 9, ox: 220, oy: 480 };
    let herramienta = cfg.herramientaInicial || 'flecha';
    let pendiente = [];        // puntos del trazo en curso (el primero es el punto activo)
    let cadenaInicio = null;   // primer punto de la cadena (para cerrar el contorno)
    let cursor = [0, 0];
    let cursorImantado = false;
    let seleccion = -1;
    let segs = [];
    let historial = [];
    let arrastre = null;
    let pasoRejilla = 0.5;
    let autoEncuadre = true;

    /* zonas (solo revolución): tipo de revolución por zona */
    const usaZonas = !!cfg.zonas;
    let modoDefecto = 'torno';
    let semillas = [];          // [{p:[x,y], modo}] la última que caiga dentro de una zona manda
    let zonaSel = null;         // punto dentro de la zona seleccionada
    let cacheZ = { clave: '', zonas: [] };
    const COLOR_MODO = {
      torno: [47, 128, 237], cuadrado: [232, 145, 45], hexagono: [46, 158, 107], octogono: [182, 75, 208]
    };
    const NOMBRE_MODO = { torno: 'torno', cuadrado: 'cuadrado', hexagono: 'hexágono', octogono: 'octógono' };

    function zonas(tol) {
      const clave = JSON.stringify(segs) + '|' + (tol || 0.04);
      if (cacheZ.clave !== clave) cacheZ = { clave, zonas: calcularZonas(segs, tol || 0.04) };
      const z = cacheZ.zonas;
      z.forEach((q) => {
        q.modo = modoDefecto;
        for (const sm of semillas) if (puntoEnPoligono(sm.p, q.puntos)) q.modo = sm.modo;
      });
      return z;
    }
    function zonaDe(p, lista) {
      let mejor = null;
      for (const z of lista) {
        if (puntoEnPoligono(p, z.puntos) && (!mejor || z.area < mejor.area)) mejor = z;
      }
      return mejor;
    }
    function zonaSeleccionada() {
      if (!zonaSel) return null;
      const lista = zonas(0.04);
      const z = zonaDe(zonaSel, lista);
      return z ? Object.assign({ indice: lista.indexOf(z) + 1, total: lista.length }, z) : null;
    }

    /* ---------- historial ---------- */
    function instantanea() {
      historial.push(JSON.stringify({ s: segs, p: pendiente, i: cadenaInicio }));
      if (historial.length > 120) historial.shift();
    }

    /* ---------- coordenadas ---------- */
    function aPantalla(p) {
      return [p[0] * vista.esc + vista.ox, vista.oy - p[1] * vista.esc];
    }
    function aMundo(sx, sy) {
      return [(sx - vista.ox) / vista.esc, (vista.oy - sy) / vista.esc];
    }

    /* Ajusta a la rejilla; si hay un vértice existente cerca, se imanta a él. */
    function ajustar(p) {
      const umbral = 9 / vista.esc;
      let mejor = null, dmin = umbral;
      const candidatos = [];
      for (const s of segs) { candidatos.push(s.a, s.b); }
      if (cadenaInicio) candidatos.push(cadenaInicio);
      for (const q of candidatos) {
        const d = dist(p, q);
        if (d < dmin) { dmin = d; mejor = q; }
      }
      if (mejor) { cursorImantado = true; return [mejor[0], mejor[1]]; }
      cursorImantado = false;
      if (!pasoRejilla) return [p[0], p[1]];
      return [Math.round(p[0] / pasoRejilla) * pasoRejilla, Math.round(p[1] / pasoRejilla) * pasoRejilla];
    }

    /* ---------- construcción del perfil cerrado ---------- */
    function construirPerfil(tol) {
      if (!segs.length) return { puntos: [], cerrado: false, aviso: 'Dibuja una silueta cerrada.' };
      let mejor = null;

      for (let s0 = 0; s0 < segs.length; s0++) {
        const marcas = new Set([s0]);
        const cadena = [{ i: s0, inv: false }];
        const primero = segs[s0];
        const inicio = primero.a;
        let fin = primero.b;
        let cerrado = false;
        let guarda = 0;

        while (guarda++ < segs.length + 2) {
          if (dist(fin, inicio) < 0.03) { cerrado = true; break; }
          let hallado = -1, inv = false;
          for (let j = 0; j < segs.length; j++) {
            if (marcas.has(j)) continue;
            if (dist(segs[j].a, fin) < 0.06) { hallado = j; inv = false; break; }
            if (dist(segs[j].b, fin) < 0.06) { hallado = j; inv = true; break; }
          }
          if (hallado < 0) break;
          marcas.add(hallado);
          cadena.push({ i: hallado, inv });
          fin = inv ? segs[hallado].a : segs[hallado].b;
        }

        const pts = [];
        for (const paso of cadena) {
          const s = segs[paso.i];
          let p = puntosSeg(s, tol || 0.04);
          if (paso.inv) p = p.slice().reverse();
          for (let k = 0; k < p.length; k++) {
            if (!pts.length || dist(pts[pts.length - 1], p[k]) > 1e-5) pts.push(p[k]);
          }
        }
        if (cerrado && pts.length > 2) {
          if (dist(pts[0], pts[pts.length - 1]) < 1e-5) pts.pop();
          const area = Math.abs(RP.areaFirmada(pts));
          if (!mejor || area > mejor.area) mejor = { puntos: pts, cerrado: true, area, aviso: '' };
        } else if (!mejor && pts.length > 2) {
          const area = Math.abs(RP.areaFirmada(pts));
          mejor = { puntos: pts, cerrado: false, area, aviso: 'El perfil no está cerrado: se cerrará con una línea.' };
        }
      }

      if (!mejor) return { puntos: [], cerrado: false, aviso: 'No se pudo formar un perfil.' };
      return mejor;
    }

    /* ---------- dibujo ---------- */
    function lineaRejilla(desde, hasta, desdeY, hastaY, paso, color, grosor) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = grosor;
      const i0 = Math.ceil(desde / paso), i1 = Math.floor(hasta / paso);
      for (let i = i0; i <= i1; i++) {
        const x = aPantalla([i * paso, 0])[0];
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, alto);
      }
      const j0 = Math.ceil(desdeY / paso), j1 = Math.floor(hastaY / paso);
      for (let j = j0; j <= j1; j++) {
        const y = aPantalla([0, j * paso])[1];
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(ancho, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    function trazarPts(pts) {
      for (let k = 0; k < pts.length; k++) {
        const s = aPantalla(pts[k]);
        if (k === 0) ctx.moveTo(s[0], s[1]);
        else ctx.lineTo(s[0], s[1]);
      }
    }

    function vertice(p, opciones) {
      const s = aPantalla(p);
      const r = opciones.r || 4;
      ctx.beginPath();
      ctx.arc(s[0], s[1], r, 0, TAU);
      ctx.fillStyle = opciones.relleno || '#fff';
      ctx.fill();
      ctx.lineWidth = opciones.grosor || 1.8;
      ctx.strokeStyle = opciones.borde || '#2f80ed';
      ctx.stroke();
    }

    function dibujar() {
      if (!ctx) return;
      const w0 = aMundo(0, alto), w1 = aMundo(ancho, 0);
      ctx.clearRect(0, 0, ancho, alto);

      const g = ctx.createLinearGradient(0, 0, 0, alto);
      g.addColorStop(0, '#fcfcfa');
      g.addColorStop(1, '#f2f2ef');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ancho, alto);

      const e = vista.esc;
      if (e >= 7) lineaRejilla(w0[0], w1[0], w0[1], w1[1], 1, 'rgba(28,28,28,0.055)', 1);
      if (e >= 3) lineaRejilla(w0[0], w1[0], w0[1], w1[1], 5, 'rgba(28,28,28,0.10)', 1);
      lineaRejilla(w0[0], w1[0], w0[1], w1[1], 10, 'rgba(28,28,28,0.16)', 1);

      const origen = aPantalla([0, 0]);
      const ox = origen[0], oy = origen[1];

      // eje horizontal (Y = 0)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(28,28,28,0.28)';
      ctx.lineWidth = 1.2;
      ctx.moveTo(0, Math.round(oy) + 0.5);
      ctx.lineTo(ancho, Math.round(oy) + 0.5);
      ctx.stroke();

      // eje vertical (X = 0)
      ctx.beginPath();
      if (modo === 'rev') {
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = 'rgba(134,86,251,0.9)';
        ctx.lineWidth = 1.4;
      } else {
        ctx.strokeStyle = 'rgba(28,28,28,0.28)';
        ctx.lineWidth = 1.2;
      }
      ctx.moveTo(Math.round(ox) + 0.5, 0);
      ctx.lineTo(Math.round(ox) + 0.5, alto);
      ctx.stroke();
      ctx.setLineDash([]);

      // relleno suave del contorno si está cerrado
      if (usaZonas) {
        const lz = zonas(0.04);
        const sel = zonaSel ? zonaDe(zonaSel, lz) : null;
        for (const z of lz) {
          const c = COLOR_MODO[z.modo] || COLOR_MODO.torno;
          ctx.beginPath();
          trazarPts(z.puntos);
          ctx.closePath();
          ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (z === sel ? 0.34 : 0.14) + ')';
          ctx.fill();
          if (z === sel) {
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = '#8656fb';
            ctx.lineWidth = 2.2;
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.font = '600 10px ui-monospace, Consolas, monospace';
        for (const z of lz) {
          const c = COLOR_MODO[z.modo] || COLOR_MODO.torno;
          const q = aPantalla(z.interior);
          const txt = NOMBRE_MODO[z.modo];
          const tw = ctx.measureText(txt).width;
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(q[0] - tw / 2 - 4, q[1] - 9, tw + 8, 15);
          ctx.fillStyle = 'rgb(' + Math.round(c[0] * 0.7) + ',' + Math.round(c[1] * 0.7) + ',' + Math.round(c[2] * 0.7) + ')';
          ctx.fillText(txt, q[0] - tw / 2, q[1] + 2);
        }
      } else {
        const per = construirPerfil(0.04);
        if (per.cerrado && per.puntos.length > 2) {
          ctx.beginPath();
          trazarPts(per.puntos);
          ctx.closePath();
          ctx.fillStyle = 'rgba(47,128,237,0.08)';
          ctx.fill();
        }
      }

      // segmentos
      for (let i = 0; i < segs.length; i++) {
        const pts = puntosSeg(segs[i], 0.04);
        ctx.beginPath();
        trazarPts(pts);
        if (i === seleccion) {
          ctx.strokeStyle = '#8656fb';
          ctx.lineWidth = 3.6;
        } else {
          ctx.strokeStyle = '#2f80ed';
          ctx.lineWidth = 2.4;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // vértices (siempre visibles, por encima de las líneas)
      for (let i = 0; i < segs.length; i++) {
        const sel = i === seleccion;
        for (const p of [segs[i].a, segs[i].b]) {
          vertice(p, { r: sel ? 5 : 4, borde: sel ? '#8656fb' : '#1d5fbf', grosor: 2 });
        }
      }

      // previsualización del trazo en curso
      if (pendiente.length) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(134,86,251,0.95)';
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        let longitud = null;
        if (herramienta === 'linea') {
          trazarPts([pendiente[0], cursor]);
          longitud = dist(pendiente[0], cursor);
        } else if (herramienta === 'arco') {
          const pts = pendiente.length === 1
            ? [pendiente[0], cursor]
            : arcoPuntos(pendiente[0], pendiente[1], cursor, 0.04);
          trazarPts(pts);
        }
        ctx.stroke();
        ctx.restore();

        if (longitud !== null && longitud > 0.05) {
          const a = aPantalla(pendiente[0]), b = aPantalla(cursor);
          ctx.font = '600 10.5px ui-monospace, Consolas, monospace';
          const txt = longitud.toFixed(1) + ' mm';
          const tx = (a[0] + b[0]) / 2 + 8, ty = (a[1] + b[1]) / 2 - 8;
          const tw = ctx.measureText(txt).width;
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillRect(tx - 4, ty - 11, tw + 8, 16);
          ctx.fillStyle = '#6a3fdc';
          ctx.fillText(txt, tx, ty + 1);
        }

        // puntos ya fijados del trazo
        for (let k = 0; k < pendiente.length; k++) {
          vertice(pendiente[k], { r: k === 0 ? 6 : 4.5, borde: '#8656fb', relleno: k === 0 ? '#8656fb' : '#fff', grosor: 2 });
        }
        if (cadenaInicio && dist(cadenaInicio, pendiente[0]) > 0.05) {
          vertice(cadenaInicio, { r: 6.5, borde: '#2e9e6b', relleno: 'rgba(46,158,107,0.18)', grosor: 2 });
        }
      }

      // cursor
      const cs = aPantalla(cursor);
      if (cursorImantado) {
        ctx.beginPath();
        ctx.arc(cs[0], cs[1], 8, 0, TAU);
        ctx.strokeStyle = 'rgba(46,158,107,0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(28,28,28,0.42)';
      ctx.lineWidth = 1;
      ctx.moveTo(cs[0] - 7, cs[1]); ctx.lineTo(cs[0] + 7, cs[1]);
      ctx.moveTo(cs[0], cs[1] - 7); ctx.lineTo(cs[0], cs[1] + 7);
      ctx.stroke();

      // etiquetas de los ejes
      if (modo === 'rev') {
        ctx.fillStyle = 'rgba(134,86,251,0.95)';
        ctx.font = '11px ui-monospace, Consolas, monospace';
        ctx.fillText('eje de revolución', ox + 6, 16);
        ctx.fillStyle = 'rgba(28,28,28,0.38)';
        ctx.font = '10px ui-monospace, Consolas, monospace';
        ctx.fillText('radio →', ancho - 52, oy + 14);
      } else {
        ctx.fillStyle = 'rgba(28,28,28,0.42)';
        ctx.font = '10px ui-monospace, Consolas, monospace';
        ctx.fillText('X →', ancho - 30, oy - 6);
        ctx.fillText('Y ↑', ox + 6, 14);
        ctx.fillText('plano de extrusión', 10, alto - 10);
      }
    }

    function textoAyuda() {
      if (herramienta === 'flecha') {
        return usaZonas
          ? 'Pulsa una zona para elegir su revolución o una línea para seleccionarla · Supr para borrar'
          : 'Pulsa una línea para seleccionarla · Supr para borrar';
      }
      if (herramienta === 'sel') return 'Pulsa una línea para seleccionarla · Supr para borrarla';
      if (herramienta === 'borrar') return 'Pulsa una línea para borrarla';
      if (!pendiente.length) return herramienta === 'arco'
        ? 'Arco: pulsa el punto inicial'
        : 'Línea: pulsa el punto inicial';
      if (herramienta === 'arco') {
        return pendiente.length === 1
          ? 'Arco: pulsa el punto final'
          : 'Arco: pulsa un punto intermedio de la curva';
      }
      return 'Pulsa el siguiente punto · Esc o doble clic para terminar';
    }

    function actualizarEstado() {
      if (!elEstado) return;
      const p = construirPerfil(0.04);
      let txt = 'x ' + cursor[0].toFixed(1) + ' · y ' + cursor[1].toFixed(1) + ' mm';
      if (p.puntos.length > 2) {
        txt += '  ·  ' + (p.cerrado ? '✓ perfil cerrado' : '⚠ perfil abierto');
        if (usaZonas) { const nz = zonas(0.04).length; if (nz) txt += ' · ' + nz + (nz === 1 ? ' zona' : ' zonas'); }
      }
      txt += '  ·  ' + textoAyuda();
      elEstado.textContent = txt;
      elEstado.className = 'estado-boceto' + (p.puntos.length > 2 && !p.cerrado ? ' alerta' : '');
    }

    function notificar() {
      if (usaZonas && zonaSel && !zonaDe(zonaSel, zonas(0.04))) {
        zonaSel = null;
        if (cfg.alZona) cfg.alZona(null);
      }
      dibujar();
      actualizarEstado();
      alCambiar();
    }

    function ajustarTamano() {
      const r = cv.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      ancho = Math.max(200, Math.round(r.width));
      alto = Math.max(200, Math.round(r.height));
      cv.width = Math.round(ancho * dpr);
      cv.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dibujar();
      if (autoEncuadre && ancho > 300 && alto > 200) {
        autoEncuadre = false;
        encuadrar();
      }
    }

    function eventoMundo(ev) {
      const r = cv.getBoundingClientRect();
      return aMundo(ev.clientX - r.left, ev.clientY - r.top);
    }

    function terminarTrazo() {
      pendiente = [];
      cadenaInicio = null;
    }

    /* Añade un segmento y deja el punto final como nuevo punto activo.
       Si el final coincide con el inicio de la cadena, el contorno se cierra. */
    function confirmarSegmento(seg, fin) {
      segs.push(seg);
      if (cadenaInicio && dist(fin, cadenaInicio) < 0.05) {
        terminarTrazo();
      } else {
        pendiente = [fin.slice()];
      }
    }

    function buscarSegmentoCercano(bruto) {
      let mejor = -1, dmin = Infinity;
      for (let i = 0; i < segs.length; i++) {
        const pts = puntosSeg(segs[i], 0.04);
        for (let k = 0; k < pts.length - 1; k++) {
          const d = distPuntoSegmento(bruto, pts[k], pts[k + 1]);
          if (d < dmin) { dmin = d; mejor = i; }
        }
      }
      return dmin < 8 / vista.esc ? mejor : -1;
    }

    function pulsar(ev) {
      const bruto = eventoMundo(ev);
      const m = ajustar(bruto);
      cursor = m;

      if (herramienta === 'flecha') {
        const segCercano = buscarSegmentoCercano(bruto);
        if (segCercano >= 0) {
          seleccion = segCercano;
          if (usaZonas && zonaSel) {
            zonaSel = null;
            if (cfg.alZona) cfg.alZona(null);
          }
          notificar();
          return;
        }
        if (usaZonas) {
          const z = zonaDe(bruto, zonas(0.04));
          zonaSel = z ? bruto : null;
          seleccion = -1;
          notificar();
          if (cfg.alZona) cfg.alZona(zonaSeleccionada());
          return;
        }
        seleccion = -1;
        notificar();
        return;
      }

      if (herramienta === 'sel' || herramienta === 'borrar') {
        const mejor = buscarSegmentoCercano(bruto);
        if (mejor >= 0) {
          if (herramienta === 'borrar') {
            instantanea();
            segs.splice(mejor, 1);
            seleccion = -1;
          } else {
            seleccion = mejor;
          }
        } else if (herramienta === 'sel') {
          seleccion = -1;
        }
        notificar();
        return;
      }

      if (herramienta === 'linea') {
        if (!pendiente.length) {
          instantanea();
          pendiente = [m];
          cadenaInicio = m.slice();
        } else if (dist(pendiente[0], m) <= 0.05) {
          // pulsar de nuevo el mismo punto (doble clic): termina el trazo
          instantanea();
          terminarTrazo();
        } else {
          instantanea();
          confirmarSegmento({ tipo: 'l', a: pendiente[0].slice(), b: m.slice() }, m);
        }
      } else if (herramienta === 'arco') {
        if (!pendiente.length) {
          instantanea();
          pendiente = [m];
          cadenaInicio = m.slice();
        } else if (pendiente.length === 1) {
          if (dist(pendiente[0], m) <= 0.05) {
            instantanea();
            terminarTrazo();
          } else {
            instantanea();
            pendiente.push(m);
          }
        } else if (dist(pendiente[0], m) > 0.05 && dist(pendiente[1], m) > 0.05) {
          instantanea();
          confirmarSegmento({
            tipo: 'a', a: pendiente[0].slice(), b: pendiente[1].slice(), m: m.slice()
          }, pendiente[1]);
        }
      }
      notificar();
    }

    function deshacer() {
      if (!historial.length) return;
      const h = JSON.parse(historial.pop());
      segs = h.s;
      pendiente = h.p || [];
      cadenaInicio = h.i || null;
      seleccion = -1;
      notificar();
    }

    function limpiar() {
      instantanea();
      segs = [];
      semillas = [];
      zonaSel = null;
      terminarTrazo();
      seleccion = -1;
      notificar();
      if (cfg.alZona) cfg.alZona(null);
    }

    function ponerHerramienta(h) {
      herramienta = h;
      /* Al cambiar entre línea y arco se conserva el punto activo. */
      if ((h === 'linea' || h === 'arco') && pendiente.length) {
        pendiente = [pendiente[0]];
      } else {
        terminarTrazo();
      }
      seleccion = -1;
      if (raiz) {
        raiz.querySelectorAll('[data-herr]').forEach((b) => {
          b.classList.toggle('activa', b.getAttribute('data-herr') === h);
        });
      }
      dibujar();
      actualizarEstado();
    }

    function cargar(lista, nuevasSemillas) {
      instantanea();
      segs = lista;
      semillas = nuevasSemillas || [];
      zonaSel = null;
      if (cfg.alZona) cfg.alZona(null);
      seleccion = -1;
      terminarTrazo();
      autoEncuadre = true;
      notificar();
      if (ancho > 300) { autoEncuadre = false; encuadrar(); }
    }

    const L = (a, b) => ({ tipo: 'l', a, b });
    const EJEMPLOS = {
      rev: [
        L([0, 0], [10, 0]), L([10, 0], [10, 3]), L([10, 3], [6, 5]), L([6, 5], [6, 12]),
        L([6, 12], [9, 15]), L([9, 15], [9, 20]), L([9, 20], [0, 20]), L([0, 20], [0, 0])
      ],
      cubo: [
        L([0, 0], [10, 0]), L([10, 0], [10, 20]), L([10, 20], [0, 20]), L([0, 20], [0, 0])
      ],
      ext: [
        L([0, 0], [40, 0]), L([40, 0], [40, 12]), L([40, 12], [14, 12]), L([14, 12], [14, 30]),
        L([14, 30], [0, 30]), L([0, 30], [0, 0])
      ],
      rect: [
        L([0, 0], [40, 0]), L([40, 0], [40, 20]), L([40, 20], [0, 20]), L([0, 20], [0, 0])
      ],
      ornamento: [
        L([0, 0], [10, 0]), L([10, 0], [10, 6]), L([10, 6], [4, 6]), L([4, 6], [4, 30]),
        L([4, 30], [5, 30]),
        { tipo: 'a', a: [5, 30], b: [0, 40], m: [3.6, 37.2] },
        L([0, 40], [0, 0]),
        L([0, 6], [4, 6]), L([0, 30], [5, 30])
      ],
      placa: [
        L([0, 0], [30, 0]),
        { tipo: 'a', a: [30, 0], b: [30, 20], m: [40, 10] },
        L([30, 20], [0, 20]), L([0, 20], [0, 0])
      ]
    };
    function cargarEjemplo(nombre) {
      const lista = EJEMPLOS[nombre || (modo === 'rev' ? 'rev' : 'ext')] || [];
      const sem = nombre === 'ornamento'
        ? [{ p: [5, 3], modo: 'octogono' }, { p: [2, 18], modo: 'cuadrado' }, { p: [2, 35], modo: 'torno' }]
        : [];
      cargar(JSON.parse(JSON.stringify(lista)), sem);
    }

    function encuadrar() {
      const p = construirPerfil(0.04);
      if (!p.puntos.length) {
        vista = modo === 'rev'
          ? { esc: 9, ox: ancho * 0.3, oy: alto * 0.75 }
          : { esc: 9, ox: ancho * 0.35, oy: alto * 0.7 };
        dibujar();
        return;
      }
      let minx = modo === 'rev' ? 0 : Infinity, maxx = modo === 'rev' ? 0 : -Infinity;
      let miny = modo === 'rev' ? 0 : Infinity, maxy = modo === 'rev' ? 0 : -Infinity;
      for (const q of p.puntos) {
        minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]);
        miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]);
      }
      const anchoM = Math.max(maxx - minx, 4), altoM = Math.max(maxy - miny, 4);
      vista.esc = Math.min(60, Math.min(ancho / (anchoM * 1.35), alto / (altoM * 1.35)));
      vista.ox = ancho / 2 - ((minx + maxx) / 2) * vista.esc;
      vista.oy = alto / 2 + ((miny + maxy) / 2) * vista.esc;
      dibujar();
    }

    /* ---------- eventos ---------- */
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('pointerdown', (ev) => {
      cv.setPointerCapture(ev.pointerId);
      if (ev.button === 1 || ev.button === 2 || ev.shiftKey) {
        arrastre = { x: ev.clientX, y: ev.clientY, ox: vista.ox, oy: vista.oy, movido: false, boton: ev.button };
        return;
      }
      if (ev.button === 0) pulsar(ev);
    });

    cv.addEventListener('pointermove', (ev) => {
      if (arrastre) {
        const dx = ev.clientX - arrastre.x, dy = ev.clientY - arrastre.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movido = true;
        vista.ox = arrastre.ox + dx;
        vista.oy = arrastre.oy + dy;
        dibujar();
        return;
      }
      cursor = ajustar(eventoMundo(ev));
      dibujar();
      actualizarEstado();
    });

    const soltar = () => {
      /* clic derecho sin arrastrar: termina el trazo en curso */
      if (arrastre && arrastre.boton === 2 && !arrastre.movido && pendiente.length) {
        instantanea();
        terminarTrazo();
        notificar();
      }
      arrastre = null;
    };
    cv.addEventListener('pointerup', soltar);
    cv.addEventListener('pointercancel', () => { arrastre = null; });
    cv.addEventListener('pointerleave', () => { arrastre = null; });

    cv.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = cv.getBoundingClientRect();
      const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
      const antes = aMundo(sx, sy);
      const k = Math.exp(-ev.deltaY * 0.0014);
      vista.esc = Math.max(0.6, Math.min(140, vista.esc * k));
      const desp = aMundo(sx, sy);
      vista.ox += (desp[0] - antes[0]) * vista.esc;
      vista.oy -= (desp[1] - antes[1]) * vista.esc;
      dibujar();
    }, { passive: false });

    global.addEventListener('keydown', (ev) => {
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (!raiz || !raiz.classList.contains('activa')) return;
      if (ev.key === 'Escape') {
        if (pendiente.length) { instantanea(); terminarTrazo(); }
        if (herramienta !== 'flecha' && raiz.querySelector('[data-herr="flecha"]')) {
          ponerHerramienta('flecha');
        } else {
          notificar();
        }
      }
      if (ev.key === 'Enter') {
        if (pendiente.length) { instantanea(); terminarTrazo(); }
        notificar();
      }
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && seleccion >= 0) {
        instantanea();
        segs.splice(seleccion, 1);
        seleccion = -1;
        notificar();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        deshacer();
      }
    });

    if (raiz) {
      raiz.querySelectorAll('[data-herr]').forEach((b) => {
        b.addEventListener('click', () => ponerHerramienta(b.getAttribute('data-herr')));
      });
    }

    new ResizeObserver(() => ajustarTamano()).observe(cv);
    ajustarTamano();
    cargarEjemplo();

    return {
      construirPerfil,
      zonas,
      zonaSeleccionada,
      ponerModoZonaSel: (m) => {
        if (!zonaSel) return;
        semillas.push({ p: zonaSel.slice(), modo: m });
        if (semillas.length > 200) semillas.shift();
        notificar();
        if (cfg.alZona) cfg.alZona(zonaSeleccionada());
      },
      ponerModoDefecto: (m) => { modoDefecto = m; semillas = []; notificar(); if (cfg.alZona) cfg.alZona(zonaSeleccionada()); },
      deshacer,
      limpiar,
      cargarEjemplo,
      cargarCubo: () => cargarEjemplo('cubo'),
      ponerHerramienta,
      encuadrar,
      ajustarPaso: (v) => { pasoRejilla = v; },
      segmentos: () => segs,
      redibujar: dibujar,
      arcoPuntos
    };
  }

  global.RP.crearBoceto = crearBoceto;
})(window);
