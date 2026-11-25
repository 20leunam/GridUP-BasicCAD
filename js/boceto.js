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
    let herramienta = 'linea';
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
      const per = construirPerfil(0.04);
      if (per.cerrado && per.puntos.length > 2) {
        ctx.beginPath();
        trazarPts(per.puntos);
        ctx.closePath();
        ctx.fillStyle = 'rgba(47,128,237,0.08)';
        ctx.fill();
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
      }
      txt += '  ·  ' + textoAyuda();
      elEstado.textContent = txt;
      elEstado.className = 'estado-boceto' + (p.puntos.length > 2 && !p.cerrado ? ' alerta' : '');
    }

    function notificar() {
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

    function pulsar(ev) {
      const bruto = eventoMundo(ev);
      const m = ajustar(bruto);
      cursor = m;

      if (herramienta === 'sel' || herramienta === 'borrar') {
        let mejor = -1, dmin = Infinity;
        for (let i = 0; i < segs.length; i++) {
          const pts = puntosSeg(segs[i], 0.04);
          for (let k = 0; k < pts.length - 1; k++) {
            const d = distPuntoSegmento(bruto, pts[k], pts[k + 1]);
            if (d < dmin) { dmin = d; mejor = i; }
          }
        }
        const umbral = 8 / vista.esc;
        if (dmin < umbral) {
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
      terminarTrazo();
      seleccion = -1;
      notificar();
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

    function cargar(lista) {
      instantanea();
      segs = lista;
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
      placa: [
        L([0, 0], [30, 0]),
        { tipo: 'a', a: [30, 0], b: [30, 20], m: [40, 10] },
        L([30, 20], [0, 20]), L([0, 20], [0, 0])
      ]
    };
    function cargarEjemplo(nombre) {
      const lista = EJEMPLOS[nombre || (modo === 'rev' ? 'rev' : 'ext')] || [];
      cargar(JSON.parse(JSON.stringify(lista)));
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
      if (ev.key === 'Escape' || ev.key === 'Enter') {
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
