/* ============================================================
   nucleo.js - utilidades matemáticas, malla y primitivas 3D
   Unidades: milímetros. Eje Z = altura.
   ============================================================ */
(function (global) {
  'use strict';

  const EPS = 1e-9;

  const V = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    }
  };

  /* ---------------------------- Malla ---------------------------- */
  class Malla {
    constructor(nombre) {
      this.nombre = nombre || 'pieza';
      this.v = []; // vértices [x,y,z]
      this.f = []; // caras [a,b,c]
    }

    vert(p) {
      this.v.push([p[0], p[1], p[2]]);
      return this.v.length - 1;
    }

    tri(a, b, c) {
      if (a !== b && b !== c && a !== c) this.f.push([a, b, c]);
    }

    quad(a, b, c, d) {
      this.tri(a, b, c);
      this.tri(a, c, d);
    }

    addMalla(o) {
      const off = this.v.length;
      for (let i = 0; i < o.v.length; i++) this.v.push(o.v[i].slice());
      for (let i = 0; i < o.f.length; i++) {
        const t = o.f[i];
        this.f.push([t[0] + off, t[1] + off, t[2] + off]);
      }
      return this;
    }

    clonar(nombre) {
      const m = new Malla(nombre || this.nombre);
      m.v = this.v.map((p) => p.slice());
      m.f = this.f.map((t) => t.slice());
      return m;
    }

    transformar(fn) {
      this.v = this.v.map(fn);
      return this;
    }

    /* Une vértices repetidos y elimina caras degeneradas */
    soldar(eps) {
      eps = eps || 1e-5;
      const inv = 1 / eps;
      const map = new Map();
      const nv = [];
      const remap = new Array(this.v.length);
      for (let i = 0; i < this.v.length; i++) {
        const p = this.v[i];
        const k = Math.round(p[0] * inv) + '|' + Math.round(p[1] * inv) + '|' + Math.round(p[2] * inv);
        let id = map.get(k);
        if (id === undefined) {
          id = nv.length;
          nv.push(p);
          map.set(k, id);
        }
        remap[i] = id;
      }
      const nf = [];
      for (let i = 0; i < this.f.length; i++) {
        const t = this.f[i];
        const a = remap[t[0]], b = remap[t[1]], c = remap[t[2]];
        if (a !== b && b !== c && a !== c) {
          // descartar área nula
          const A = nv[a], B = nv[b], C = nv[c];
          const cr = V.cross(V.sub(B, A), V.sub(C, A));
          if (V.len(cr) > 1e-12) nf.push([a, b, c]);
        }
      }
      this.v = nv;
      this.f = nf;
      return this;
    }

    volumen() {
      let vol = 0;
      for (let i = 0; i < this.f.length; i++) {
        const t = this.f[i];
        const a = this.v[t[0]], b = this.v[t[1]], c = this.v[t[2]];
        vol += V.dot(a, V.cross(b, c)) / 6;
      }
      return vol;
    }

    /* Garantiza normales hacia fuera invirtiendo si el volumen es negativo */
    orientar() {
      if (this.volumen() < 0) {
        for (let i = 0; i < this.f.length; i++) {
          const t = this.f[i];
          const aux = t[1]; t[1] = t[2]; t[2] = aux;
        }
      }
      return this;
    }

    caja() {
      if (!this.v.length) return { min: [0, 0, 0], max: [0, 0, 0], tam: [0, 0, 0] };
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const p of this.v) {
        for (let i = 0; i < 3; i++) {
          if (p[i] < min[i]) min[i] = p[i];
          if (p[i] > max[i]) max[i] = p[i];
        }
      }
      return { min, max, tam: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
    }

    centro() {
      const c = this.caja();
      return [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2];
    }

    /* Comprueba que la malla es cerrada y coherente */
    revisar() {
      const aristas = new Map();
      for (const t of this.f) {
        const pares = [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
        for (const [a, b] of pares) {
          const k = a < b ? a + '_' + b : b + '_' + a;
          let r = aristas.get(k);
          if (!r) { r = { n: 0, dir: 0 }; aristas.set(k, r); }
          r.n++;
          r.dir += (a < b ? 1 : -1);
        }
      }
      let abiertas = 0, incoherentes = 0;
      aristas.forEach((r) => {
        if (r.n !== 2) abiertas++;
        if (r.dir !== 0) incoherentes++;
      });
      return {
        cerrada: abiertas === 0 && incoherentes === 0,
        aristas: aristas.size,
        abiertas,
        incoherentes,
        caras: this.f.length,
        vertices: this.v.length
      };
    }
  }

  /* -------------------- Triangulación (ear clipping) -------------------- */
  function puntoEnTri(p, a, b, c) {
    const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
    const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
    const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
    const neg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
    const pos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
    return !(neg && pos);
  }

  /* Devuelve triángulos [i,j,k] en orden antihorario para un polígono simple CCW */
  function triangularPoligono(pts) {
    const n = pts.length;
    if (n < 3) return [];
    const area2 = (a, b, c) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    const tris = [];
    let guarda = 0;
    while (idx.length > 3 && guarda++ < n * n + 10) {
      let cortado = false;
      for (let i = 0; i < idx.length; i++) {
        const i0 = idx[(i - 1 + idx.length) % idx.length];
        const i1 = idx[i];
        const i2 = idx[(i + 1) % idx.length];
        const a = pts[i0], b = pts[i1], c = pts[i2];
        if (area2(a, b, c) <= 1e-12) continue;
        let dentro = false;
        for (let j = 0; j < idx.length; j++) {
          const k = idx[j];
          if (k === i0 || k === i1 || k === i2) continue;
          if (puntoEnTri(pts[k], a, b, c)) { dentro = true; break; }
        }
        if (dentro) continue;
        tris.push([i0, i1, i2]);
        idx.splice(i, 1);
        cortado = true;
        break;
      }
      if (!cortado) break;
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    if (!tris.length) {
      for (let i = 1; i < n - 1; i++) tris.push([0, i, i + 1]);
    }
    return tris;
  }

  function areaFirmada(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  /* ---------------------------- Primitivas ---------------------------- */
  function caja(cx, cy, cz, sx, sy, sz) {
    const m = new Malla('caja');
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const p = [
      [cx - x, cy - y, cz - z], [cx + x, cy - y, cz - z],
      [cx + x, cy + y, cz - z], [cx - x, cy + y, cz - z],
      [cx - x, cy - y, cz + z], [cx + x, cy - y, cz + z],
      [cx + x, cy + y, cz + z], [cx - x, cy + y, cz + z]
    ];
    for (const q of p) m.vert(q);
    m.quad(0, 3, 2, 1);
    m.quad(4, 5, 6, 7);
    m.quad(0, 1, 5, 4);
    m.quad(2, 3, 7, 6);
    m.quad(0, 4, 7, 3);
    m.quad(1, 2, 6, 5);
    return m.orientar();
  }

  function esfera(cx, cy, cz, r, seg, anillos) {
    seg = Math.max(8, seg || 32);
    anillos = Math.max(4, anillos || Math.round(seg / 2));
    const m = new Malla('esfera');
    const rejilla = [];
    for (let j = 0; j <= anillos; j++) {
      const th = (j / anillos) * Math.PI;
      const fila = [];
      if (j === 0 || j === anillos) {
        const id = m.vert([cx, cy, cz + r * Math.cos(th)]);
        for (let i = 0; i < seg; i++) fila.push(id);
      } else {
        for (let i = 0; i < seg; i++) {
          const ph = (i / seg) * Math.PI * 2;
          fila.push(m.vert([
            cx + r * Math.sin(th) * Math.cos(ph),
            cy + r * Math.sin(th) * Math.sin(ph),
            cz + r * Math.cos(th)
          ]));
        }
      }
      rejilla.push(fila);
    }
    for (let j = 0; j < anillos; j++) {
      for (let i = 0; i < seg; i++) {
        const i2 = (i + 1) % seg;
        const a = rejilla[j][i], b = rejilla[j][i2];
        const c = rejilla[j + 1][i2], d = rejilla[j + 1][i];
        if (j === 0) m.tri(a, d, c);
        else if (j === anillos - 1) m.tri(a, c, b);
        else m.quad(a, d, c, b);
      }
    }
    return m.orientar();
  }

  function octaedro(cx, cy, cz, s) {
    const m = new Malla('rombo');
    const p = [
      [cx + s, cy, cz], [cx - s, cy, cz],
      [cx, cy + s, cz], [cx, cy - s, cz],
      [cx, cy, cz + s], [cx, cy, cz - s]
    ];
    for (const q of p) m.vert(q);
    m.tri(0, 2, 4); m.tri(2, 1, 4); m.tri(1, 3, 4); m.tri(3, 0, 4);
    m.tri(2, 0, 5); m.tri(1, 2, 5); m.tri(3, 1, 5); m.tri(0, 3, 5);
    return m.orientar();
  }

  function cono(cx, cy, cz, r, h, seg) {
    seg = Math.max(8, seg || 32);
    const m = new Malla('cono');
    const base = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      base.push(m.vert([cx + r * Math.cos(a), cy + r * Math.sin(a), cz]));
    }
    const apex = m.vert([cx, cy, cz + h]);
    const cb = m.vert([cx, cy, cz]);
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      m.tri(base[i], base[i2], apex);
      m.tri(cb, base[i2], base[i]);
    }
    return m.orientar();
  }

  function cilindro(cx, cy, cz, r, h, seg) {
    seg = Math.max(8, seg || 32);
    const m = new Malla('cilindro');
    const ab = [], ar = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      ab.push(m.vert([x, y, cz]));
      ar.push(m.vert([x, y, cz + h]));
    }
    const cbb = m.vert([cx, cy, cz]);
    const cta = m.vert([cx, cy, cz + h]);
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      m.quad(ab[i], ab[i2], ar[i2], ar[i]);
      m.tri(cbb, ab[i2], ab[i]);
      m.tri(cta, ar[i], ar[i2]);
    }
    return m.orientar();
  }

  function toro(cx, cy, cz, R, r, segU, segV) {
    segU = Math.max(12, segU || 48);
    segV = Math.max(8, segV || 20);
    const m = new Malla('toro');
    const g = [];
    for (let i = 0; i < segU; i++) {
      const u = (i / segU) * Math.PI * 2;
      const fila = [];
      for (let j = 0; j < segV; j++) {
        const v = (j / segV) * Math.PI * 2;
        const rr = R + r * Math.cos(v);
        fila.push(m.vert([cx + rr * Math.cos(u), cy + rr * Math.sin(u), cz + r * Math.sin(v)]));
      }
      g.push(fila);
    }
    for (let i = 0; i < segU; i++) {
      const i2 = (i + 1) % segU;
      for (let j = 0; j < segV; j++) {
        const j2 = (j + 1) % segV;
        m.quad(g[i][j], g[i2][j], g[i2][j2], g[i][j2]);
      }
    }
    return m.orientar();
  }

  /* ------------------- Sólido de revolución (torno) -------------------
     perfil: [[u,v],...] cerrado CCW.  radio = desplazamiento + u
     v = altura (eje Z).                                             */
  function torno(perfil, segs, desplazamiento) {
    segs = Math.max(8, segs || 64);
    desplazamiento = desplazamiento || 0;
    const m = new Malla('revolucion');
    const N = perfil.length;
    const anillos = [];
    for (let i = 0; i < N; i++) {
      const u = perfil[i][0], v = perfil[i][1];
      const r = desplazamiento + u;
      if (Math.abs(r) < 1e-7) {
        anillos.push({ polo: true, ids: [m.vert([0, 0, v])] });
      } else {
        const ids = [];
        for (let j = 0; j < segs; j++) {
          const a = (j / segs) * Math.PI * 2;
          ids.push(m.vert([r * Math.cos(a), r * Math.sin(a), v]));
        }
        anillos.push({ polo: false, ids });
      }
    }
    for (let i = 0; i < N; i++) {
      const A = anillos[i], B = anillos[(i + 1) % N];
      if (A.polo && B.polo) continue;
      for (let j = 0; j < segs; j++) {
        const j2 = (j + 1) % segs;
        if (A.polo) m.tri(A.ids[0], B.ids[j2], B.ids[j]);
        else if (B.polo) m.tri(A.ids[j], A.ids[j2], B.ids[0]);
        else m.quad(A.ids[j], A.ids[j2], B.ids[j2], B.ids[j]);
      }
    }
    return m.orientar();
  }

  /* ------------- Sólido de revolución con sección poligonal -------------
     Igual que torno(), pero cada anillo es un polígono regular de n lados.
     La apotema del polígono es el radio u del perfil, de modo que:
       - perfil de radio 10  ->  torno: Ø20
       - perfil de radio 10  ->  cuadrado (n=4): prisma de 20 x 20
     Los vértices se colocan a media cara para que una cara mire a +X.    */
  function tornoPoligonal(perfil, n) {
    n = Math.max(3, Math.round(n || 4));
    const m = new Malla('revolucion');
    const N = perfil.length;
    const k = 1 / Math.cos(Math.PI / n);
    const anillos = [];
    for (let i = 0; i < N; i++) {
      const u = perfil[i][0], v = perfil[i][1];
      if (Math.abs(u) < 1e-7) {
        anillos.push({ polo: true, ids: [m.vert([0, 0, v])] });
      } else {
        const ids = [];
        const r = u * k;
        for (let j = 0; j < n; j++) {
          const a = Math.PI / n + (j / n) * Math.PI * 2;
          ids.push(m.vert([r * Math.cos(a), r * Math.sin(a), v]));
        }
        anillos.push({ polo: false, ids });
      }
    }
    for (let i = 0; i < N; i++) {
      const A = anillos[i], B = anillos[(i + 1) % N];
      if (A.polo && B.polo) continue;
      for (let j = 0; j < n; j++) {
        const j2 = (j + 1) % n;
        if (A.polo) m.tri(A.ids[0], B.ids[j2], B.ids[j]);
        else if (B.polo) m.tri(A.ids[j], A.ids[j2], B.ids[0]);
        else m.quad(A.ids[j], A.ids[j2], B.ids[j2], B.ids[j]);
      }
    }
    return m.orientar();
  }

  /* --------- Prisma con extremos oblicuos (barrido por tramos) ---------
     A: punto de arranque del tramo (3D, z=0)
     d: dirección unitaria del tramo (3D, z=0)
     m: normal lateral (3D, z=0)
     sIni(u), sFin(u): posición sobre el eje d en los extremos        */
  function prismaOblicuo(perfil, A, d, m, sIni, sFin) {
    const mesh = new Malla('tramo');
    const N = perfil.length;
    const ini = [], fin = [];
    for (let i = 0; i < N; i++) {
      const u = perfil[i][0], v = perfil[i][1];
      const s0 = sIni(u), s1 = sFin(u);
      ini.push(mesh.vert([A[0] + d[0] * s0 + m[0] * u, A[1] + d[1] * s0 + m[1] * u, v]));
      fin.push(mesh.vert([A[0] + d[0] * s1 + m[0] * u, A[1] + d[1] * s1 + m[1] * u, v]));
    }
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      mesh.quad(ini[i], ini[i2], fin[i2], fin[i]);
    }
    const tris = triangularPoligono(perfil);
    for (const t of tris) {
      mesh.tri(ini[t[0]], ini[t[2]], ini[t[1]]);
      mesh.tri(fin[t[0]], fin[t[1]], fin[t[2]]);
    }
    return mesh.orientar();
  }

  /* ---------------------------- Extrusión ----------------------------
     perfil: [[x,y],...] cerrado CCW en el plano XY. Se extruye en +Z
     una altura h (mm).                                               */
  function extruir(perfil, h) {
    const m = new Malla('extrusion');
    const N = perfil.length;
    const aba = [], arr = [];
    for (let i = 0; i < N; i++) {
      aba.push(m.vert([perfil[i][0], perfil[i][1], 0]));
      arr.push(m.vert([perfil[i][0], perfil[i][1], h]));
    }
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      m.quad(aba[i], aba[i2], arr[i2], arr[i]);
    }
    const tris = triangularPoligono(perfil);
    for (const t of tris) {
      m.tri(aba[t[0]], aba[t[2]], aba[t[1]]);
      m.tri(arr[t[0]], arr[t[1]], arr[t[2]]);
    }
    return m.orientar();
  }

  /* ---------------------- Utilidades de perfil ---------------------- */
  /* Normaliza un perfil: cierra, elimina duplicados y lo deja CCW */
  function prepararPerfil(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!out.length) { out.push([p[0], p[1]]); continue; }
      const q = out[out.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push([p[0], p[1]]);
    }
    if (out.length > 2) {
      const a = out[0], b = out[out.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
    }
    if (areaFirmada(out) < 0) out.reverse();
    return out;
  }

  global.RP = global.RP || {};
  global.RP.V = V;
  global.RP.Malla = Malla;
  global.RP.triangularPoligono = triangularPoligono;
  global.RP.areaFirmada = areaFirmada;
  global.RP.prepararPerfil = prepararPerfil;
  global.RP.primitivas = { caja, esfera, octaedro, cono, cilindro, toro };
  global.RP.torno = torno;
  global.RP.extruir = extruir;
  global.RP.tornoPoligonal = tornoPoligonal;
  global.RP.prismaOblicuo = prismaOblicuo;
})(window);
