/* ============================================================
   exportar.js - escritor STEP (AP214, B-rep facetado) y STL
   ============================================================ */
(function (global) {
  'use strict';

  const V = global.RP.V;

  function fnum(n) {
    if (!isFinite(n)) n = 0;
    if (Math.abs(n) < 5e-7) n = 0;
    let s = n.toFixed(6);
    if (s.indexOf('.') >= 0) {
      s = s.replace(/0+$/, '');
      if (s.endsWith('.')) s += '0';
    } else {
      s += '.0';
    }
    if (s === '-0.0') s = '0.0';
    return s;
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/'/g, "''").replace(/[\r\n]+/g, ' ');
  }

  function sello() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return (
      d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
    );
  }

  /* =========================== STEP =========================== */
  /* piezas: [{ malla: Malla, nombre: string }] */
  function generarSTEP(piezas, titulo) {
    const L = [];
    let id = 0;
    const add = (s) => { L.push('#' + (++id) + '=' + s + ';'); return id; };
    const ref = (i) => '#' + i;

    const pt = (p) => add("CARTESIAN_POINT('',(" + fnum(p[0]) + ',' + fnum(p[1]) + ',' + fnum(p[2]) + '))');
    const dir = (d) => add("DIRECTION('',(" + fnum(d[0]) + ',' + fnum(d[1]) + ',' + fnum(d[2]) + '))');

    /* ---- contexto ---- */
    const eApp = add("APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies')");
    add("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000," + ref(eApp) + ')');
    const ePctx = add("PRODUCT_CONTEXT(''," + ref(eApp) + ",'mechanical')");
    const eProd = add("PRODUCT('" + esc(titulo) + "','" + esc(titulo) + "','',(" + ref(ePctx) + '))');
    const ePdf = add("PRODUCT_DEFINITION_FORMATION('',''," + ref(eProd) + ')');
    const ePdctx = add("PRODUCT_DEFINITION_CONTEXT('part definition'," + ref(eApp) + ",'design')");
    const ePd = add("PRODUCT_DEFINITION('design',''," + ref(ePdf) + ',' + ref(ePdctx) + ')');
    add("PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(" + ref(eProd) + '))');

    const eLen = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
    const eAng = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
    const eSol = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
    const eUnc = add("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.001)," + ref(eLen) + ",'distance_accuracy_value','confusion accuracy')");
    const eCtx = add('(GEOMETRIC_REPRESENTATION_CONTEXT(3)' +
      'GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((' + ref(eUnc) + '))' +
      'GLOBAL_UNIT_ASSIGNED_CONTEXT((' + ref(eLen) + ',' + ref(eAng) + ',' + ref(eSol) + '))' +
      "REPRESENTATION_CONTEXT('Context','3D'))");

    const oP = pt([0, 0, 0]);
    const oZ = dir([0, 0, 1]);
    const oX = dir([1, 0, 0]);
    const eOrigen = add("AXIS2_PLACEMENT_3D(''," + ref(oP) + ',' + ref(oZ) + ',' + ref(oX) + ')');

    const solidos = [];

    for (const pieza of piezas) {
      const m = pieza.malla.clonar(pieza.nombre);
      m.soldar(1e-5);
      if (!m.f.length) continue;

      const vp = [];
      for (const p of m.v) {
        const pnt = pt(p);
        vp.push(add("VERTEX_POINT(''," + ref(pnt) + ')'));
      }

      const emap = new Map();
      function arista(a, b) {
        const A = a < b ? a : b;
        const B = a < b ? b : a;
        const k = A + '_' + B;
        let rec = emap.get(k);
        if (!rec) {
          const p0 = m.v[A], p1 = m.v[B];
          const dv = V.norm(V.sub(p1, p0));
          const pnt = pt(p0);
          const dr = dir(dv);
          const vec = add("VECTOR(''," + ref(dr) + ',1.0)');
          const ln = add("LINE(''," + ref(pnt) + ',' + ref(vec) + ')');
          const ec = add("EDGE_CURVE(''," + ref(vp[A]) + ',' + ref(vp[B]) + ',' + ref(ln) + ',.T.)');
          rec = { id: ec, A: A, B: B };
          emap.set(k, rec);
        }
        return rec;
      }

      const caras = [];
      for (const t of m.f) {
        const a = t[0], b = t[1], c = t[2];
        const pa = m.v[a], pb = m.v[b], pc = m.v[c];
        let n = V.cross(V.sub(pb, pa), V.sub(pc, pa));
        if (V.len(n) < 1e-12) continue;
        n = V.norm(n);

        const refv = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const xa = V.norm(V.cross(refv, n));
        const po = pt(pa);
        const pz = dir(n);
        const px = dir(xa);
        const ax = add("AXIS2_PLACEMENT_3D(''," + ref(po) + ',' + ref(pz) + ',' + ref(px) + ')');
        const pl = add("PLANE(''," + ref(ax) + ')');

        const or = [];
        const lados = [[a, b], [b, c], [c, a]];
        for (const [p, q] of lados) {
          const rec = arista(p, q);
          const mismo = rec.A === p && rec.B === q;
          or.push(add("ORIENTED_EDGE('',*,*," + ref(rec.id) + ',' + (mismo ? '.T.' : '.F.') + ')'));
        }
        const el = add("EDGE_LOOP('',(" + or.map(ref).join(',') + '))');
        const fb = add("FACE_OUTER_BOUND(''," + ref(el) + ',.T.)');
        caras.push(add("ADVANCED_FACE('',(" + ref(fb) + ")," + ref(pl) + ',.T.)'));
      }

      if (!caras.length) continue;
      const sh = add("CLOSED_SHELL('',(" + caras.map(ref).join(',') + '))');
      solidos.push(add("MANIFOLD_SOLID_BREP('" + esc(pieza.nombre) + "'," + ref(sh) + ')'));
    }

    if (!solidos.length) {
      solidos.push(add("MANIFOLD_SOLID_BREP('vacio'," + ref(add("CLOSED_SHELL('',())")) + ')'));
    }

    const eRep = add("ADVANCED_BREP_SHAPE_REPRESENTATION('',(" +
      [eOrigen].concat(solidos).map(ref).join(',') + '),' + ref(eCtx) + ')');
    add("SHAPE_DEFINITION_REPRESENTATION(" + ref(ePd) + ',' + ref(eRep) + ')');

    const cabecera =
      'ISO-10303-21;\n' +
      'HEADER;\n' +
      "FILE_DESCRIPTION(('Generador de rejas y piezas de revolucion'),'2;1');\n" +
      "FILE_NAME('" + esc(titulo) + ".step','" + sello() + "',(''),('')," +
      "'Generador de rejas y piezas de revolucion','','');\n" +
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\n" +
      'ENDSEC;\n\nDATA;\n';

    return cabecera + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
  }

  /* =========================== STL =========================== */
  function generarSTL(piezas) {
    let total = 0;
    for (const p of piezas) total += p.malla.f.length;
    const buf = new ArrayBuffer(84 + total * 50);
    const dv = new DataView(buf);
    const txt = 'Generador de rejas y piezas - mm';
    for (let i = 0; i < 80; i++) {
      dv.setUint8(i, i < txt.length ? txt.charCodeAt(i) : 32);
    }
    dv.setUint32(80, total, true);
    let off = 84;
    for (const pieza of piezas) {
      const m = pieza.malla;
      for (const t of m.f) {
        const a = m.v[t[0]], b = m.v[t[1]], c = m.v[t[2]];
        let n = V.cross(V.sub(b, a), V.sub(c, a));
        const l = V.len(n);
        n = l > 1e-12 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 0, 0];
        dv.setFloat32(off, n[0], true); dv.setFloat32(off + 4, n[1], true); dv.setFloat32(off + 8, n[2], true);
        dv.setFloat32(off + 12, a[0], true); dv.setFloat32(off + 16, a[1], true); dv.setFloat32(off + 20, a[2], true);
        dv.setFloat32(off + 24, b[0], true); dv.setFloat32(off + 28, b[1], true); dv.setFloat32(off + 32, b[2], true);
        dv.setFloat32(off + 36, c[0], true); dv.setFloat32(off + 40, c[1], true); dv.setFloat32(off + 44, c[2], true);
        dv.setUint16(off + 48, 0, true);
        off += 50;
      }
    }
    return buf;
  }

  /* =========================== Descarga =========================== */
  function descargar(nombre, contenido, tipo) {
    const blob = contenido instanceof ArrayBuffer
      ? new Blob([contenido], { type: tipo || 'application/octet-stream' })
      : new Blob([contenido], { type: tipo || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  global.RP.exportar = { generarSTEP, generarSTL, descargar, fnum };
})(window);
