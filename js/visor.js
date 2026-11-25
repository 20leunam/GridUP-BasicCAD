/* ============================================================
   visor.js - visor 3D (three.js) con órbita propia, eje Z arriba
   ============================================================ */
(function (global) {
  'use strict';

  const THREE = global.THREE;


  const ANGULO_ARISTA = 30;          // grados: a partir de aquí hay arista viva
  const OPACIDAD_ARISTA = 0.75;

  /* Arista = el color de la pieza, más oscuro y algo apagado: se lee como
     un trazo fino de acabado, no como un contorno negro. */
  function colorArista(hex) {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * 0.9), Math.max(0.08, hsl.l * 0.42));
    return c;
  }

  let _texPunto = null;
  function texturaPunto() {
    if (_texPunto) return _texPunto;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.beginPath();
    g.arc(32, 32, 29, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    _texPunto = new THREE.CanvasTexture(cv);
    return _texPunto;
  }

  /* Geometría sin índices con normales "por aristas vivas": las caras
     planas quedan planas (cajas nítidas) y las curvas, suaves.
     También devuelve las aristas vivas y los vértices esquina.      */
  function construirGeometria(m, anguloGrados) {
    const cosU = Math.cos((anguloGrados * Math.PI) / 180);
    const nf = m.f.length;
    const fnorm = new Float32Array(nf * 3);   // normal sin normalizar (ponderada por área)
    const funit = new Float32Array(nf * 3);
    const vf = new Array(m.v.length);
    for (let i = 0; i < m.v.length; i++) vf[i] = [];

    for (let i = 0; i < nf; i++) {
      const t = m.f[i];
      const a = m.v[t[0]], b = m.v[t[1]], c = m.v[t[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      fnorm[i * 3] = nx; fnorm[i * 3 + 1] = ny; fnorm[i * 3 + 2] = nz;
      funit[i * 3] = nx / l; funit[i * 3 + 1] = ny / l; funit[i * 3 + 2] = nz / l;
      vf[t[0]].push(i); vf[t[1]].push(i); vf[t[2]].push(i);
    }

    const pos = new Float32Array(nf * 9);
    const nor = new Float32Array(nf * 9);
    for (let i = 0; i < nf; i++) {
      const t = m.f[i];
      for (let k = 0; k < 3; k++) {
        const vi = t[k];
        const p = m.v[vi];
        let sx = 0, sy = 0, sz = 0;
        const lista = vf[vi];
        for (let q = 0; q < lista.length; q++) {
          const j = lista[q];
          const dp = funit[i * 3] * funit[j * 3] + funit[i * 3 + 1] * funit[j * 3 + 1] + funit[i * 3 + 2] * funit[j * 3 + 2];
          if (dp >= cosU) { sx += fnorm[j * 3]; sy += fnorm[j * 3 + 1]; sz += fnorm[j * 3 + 2]; }
        }
        const l = Math.hypot(sx, sy, sz) || 1;
        const o = i * 9 + k * 3;
        pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
        nor[o] = sx / l; nor[o + 1] = sy / l; nor[o + 2] = sz / l;
      }
    }
    /* aristas vivas */
    const aristas = new Map();
    for (let i = 0; i < nf; i++) {
      const t = m.f[i];
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        const key = a < b ? a + '_' + b : b + '_' + a;
        let e = aristas.get(key);
        if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), f: [] }; aristas.set(key, e); }
        e.f.push(i);
      }
    }
    const seg = [];
    const grado = new Map();
    aristas.forEach((e) => {
      let viva = e.f.length !== 2;
      if (!viva) {
        const i = e.f[0], j = e.f[1];
        const dp = funit[i * 3] * funit[j * 3] + funit[i * 3 + 1] * funit[j * 3 + 1] + funit[i * 3 + 2] * funit[j * 3 + 2];
        viva = dp < cosU;
      }
      if (!viva) return;
      const A = m.v[e.a], B = m.v[e.b];
      seg.push(A[0], A[1], A[2], B[0], B[1], B[2]);
      grado.set(e.a, (grado.get(e.a) || 0) + 1);
      grado.set(e.b, (grado.get(e.b) || 0) + 1);
    });
    const pts = [];
    grado.forEach((n, vi) => {
      if (n >= 3) { const p = m.v[vi]; pts.push(p[0], p[1], p[2]); }
    });

    return {
      pos, nor,
      lineas: seg.length ? new Float32Array(seg) : null,
      puntos: pts.length ? new Float32Array(pts) : null
    };
  }

  class Visor {
    constructor(contenedor, opciones) {
      opciones = opciones || {};
      this.contenedor = contenedor;
      this.colorFondo = opciones.fondo === undefined ? null : opciones.fondo;
      this.usarSombra = opciones.sombra !== false;

      /* Interpreta los colores como sRGB para que el azul del modelo
         coincida con el de la interfaz y no se lave con la luz. */
      if (THREE.ColorManagement && 'legacyMode' in THREE.ColorManagement) {
        THREE.ColorManagement.legacyMode = false;
      }

      this.escena = new THREE.Scene();
      if (this.colorFondo !== null) {
        this.escena.background = new THREE.Color(this.colorFondo);
      }

      this.camara = new THREE.PerspectiveCamera(42, 1, 0.1, 200000);
      this.camara.up.set(0, 0, 1);

      this.ok = true;
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (err) {
        this.ok = false;
        this.renderer = null;
        this.necesita = false;
        const aviso = document.createElement('div');
        aviso.className = 'sin-webgl';
        aviso.innerHTML = '<b>Vista 3D no disponible</b><br>El navegador ha bloqueado WebGL.' +
          '<br>Puedes seguir configurando y descargando STEP / STL.';
        contenedor.appendChild(aviso);
        return;
      }
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      if ('outputEncoding' in this.renderer && THREE.sRGBEncoding !== undefined) {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }
      this.renderer.shadowMap.enabled = false;
      contenedor.appendChild(this.renderer.domElement);
      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.touchAction = 'none';

      /* luces de estudio, suaves y neutras */
      const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d9d4, 0.55);
      this.escena.add(hemi);
      const key = new THREE.DirectionalLight(0xffffff, 0.85);
      key.position.set(0.6, -1, 1.4);
      this.escena.add(key);
      const fill = new THREE.DirectionalLight(0xdfe9ff, 0.26);
      fill.position.set(-1, 0.8, 0.4);
      this.escena.add(fill);
      const rim = new THREE.DirectionalLight(0xffffff, 0.18);
      rim.position.set(0.2, 1, -0.6);
      this.escena.add(rim);

      this.grupo = new THREE.Group();
      this.escena.add(this.grupo);

      this.rejilla = null;
      this.sombra = null;
      this.ejes = null;

      /* órbita */
      this.objetivo = new THREE.Vector3(0, 0, 0);
      this.theta = -Math.PI / 4;
      this.phi = Math.PI / 3.2;
      this.dist = 260;
      this.c = { theta: this.theta, phi: this.phi, dist: this.dist, obj: new THREE.Vector3(0, 0, 0) };
      this.arrastrando = null;
      this.ultimo = { x: 0, y: 0 };
      this.necesita = true;

      this._enlazar();
      this._bucle();

      this.observador = new ResizeObserver(() => this.redimensionar());
      this.observador.observe(contenedor);
      this.redimensionar();
    }

    _enlazar() {
      const el = this.renderer.domElement;
      el.addEventListener('contextmenu', (e) => e.preventDefault());

      el.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.contextoPerdido = true;
      });
      el.addEventListener('webglcontextrestored', () => {
        this.contextoPerdido = false;
        this.necesita = true;
      });

      el.addEventListener('pointerdown', (e) => {
        this._down = { x: e.clientX, y: e.clientY, boton: e.button };
        el.setPointerCapture(e.pointerId);
        this.arrastrando = (e.button === 0 && !e.shiftKey) ? 'rotar' : 'mover';
        this.ultimo.x = e.clientX;
        this.ultimo.y = e.clientY;
      });
      el.addEventListener('pointermove', (e) => {
        if (!this.arrastrando) {
          if (this.alMover) this.alMover(e.clientX, e.clientY);
          return;
        }
        const dx = e.clientX - this.ultimo.x;
        const dy = e.clientY - this.ultimo.y;
        this.ultimo.x = e.clientX;
        this.ultimo.y = e.clientY;
        if (this.arrastrando === 'rotar') {
          this.theta -= dx * 0.008;
          this.phi -= dy * 0.008;
          this.phi = Math.max(0.02, Math.min(Math.PI - 0.02, this.phi));
        } else {
          this._mover(dx, dy);
        }
        this.necesita = true;
      });
      const soltar = (e) => {
        if (this.arrastrando) {
          try { el.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
        }
        this.arrastrando = null;
      };
      el.addEventListener('pointerup', (e) => {
        const d = this._down;
        soltar(e);
        /* clic simple (sin arrastrar): lo recibe quien lo haya pedido */
        if (d && d.boton === 0 && this.alClic &&
            Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) {
          if (this.alClic(e.clientX, e.clientY)) this._tClic = performance.now();
        }
        this._down = null;
      });
      el.addEventListener('pointercancel', soltar);

      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const k = Math.exp(e.deltaY * 0.0012);
        this.dist = Math.max(1, Math.min(200000, this.dist * k));
        this.necesita = true;
      }, { passive: false });

      el.addEventListener('dblclick', () => {
        if (this._tClic && performance.now() - this._tClic < 700) return;
        this.encuadrar();
      });
    }

    /* Punto donde el rayo del cursor corta el plano horizontal z = zPlano
       (coordenadas del mundo). Devuelve [x, y] o null. */
    pickPlano(clientX, clientY, zPlano) {
      if (!this.ok) return null;
      const r = this.renderer.domElement.getBoundingClientRect();
      const nx = ((clientX - r.left) / r.width) * 2 - 1;
      const ny = -((clientY - r.top) / r.height) * 2 + 1;
      this.camara.updateMatrixWorld();
      const rc = new THREE.Raycaster();
      rc.setFromCamera({ x: nx, y: ny }, this.camara);
      const pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -zPlano);
      const p = new THREE.Vector3();
      return rc.ray.intersectPlane(pl, p) ? [p.x, p.y] : null;
    }

    /* Marcador circular sobre el plano (vista previa al colocar). */
    marcador(x, y, z, radio, color) {
      if (!this.ok) return;
      if (x === null) {
        if (this._marc) { this._marc.visible = false; this.necesita = true; }
        return;
      }
      if (!this._marc) {
        const g = new THREE.RingGeometry(0.82, 1, 40);
        const m = new THREE.MeshBasicMaterial({
          color: 0x8656fb, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false
        });
        this._marc = new THREE.Mesh(g, m);
        this._marc.renderOrder = 10;
        this.escena.add(this._marc);
      }
      this._marc.visible = true;
      this._marc.material.color.setHex(color === undefined ? 0x8656fb : color);
      this._marc.scale.set(radio, radio, radio);
      this._marc.position.set(x, y, z);
      this.necesita = true;
    }

    cursor(c) { if (this.ok) this.renderer.domElement.style.cursor = c || ''; }

    _mover(dx, dy) {
      const k = this.dist * 0.0018;
      const derecha = new THREE.Vector3();
      const arriba = new THREE.Vector3();
      this.camara.getWorldDirection(new THREE.Vector3());
      derecha.set(1, 0, 0).applyQuaternion(this.camara.quaternion);
      arriba.set(0, 1, 0).applyQuaternion(this.camara.quaternion);
      this.objetivo.addScaledVector(derecha, -dx * k);
      this.objetivo.addScaledVector(arriba, dy * k);
    }

    _snap() {
      this.c.theta = this.theta; this.c.phi = this.phi; this.c.dist = this.dist;
      this.c.obj.copy(this.objetivo);
    }

    /* Acerca la cámara mostrada a la cámara objetivo (amortiguado).
       Devuelve true mientras siga en movimiento. */
    _suavizar() {
      const c = this.c, k = 0.38;
      const dt = this.theta - c.theta, dp = this.phi - c.phi;
      const dd = this.dist - c.dist;
      const dobj = this.objetivo.distanceTo(c.obj);
      const quieto = Math.abs(dt) < 1e-4 && Math.abs(dp) < 1e-4 &&
        Math.abs(dd) < c.dist * 1e-4 && dobj < c.dist * 1e-4;
      if (quieto) { this._snap(); return false; }
      c.theta += dt * k; c.phi += dp * k; c.dist += dd * k;
      c.obj.lerp(this.objetivo, k);
      return true;
    }

    _aplicarCamara() {
      const c = this.c;
      const sp = Math.sin(c.phi), cp = Math.cos(c.phi);
      const st = Math.sin(c.theta), ct = Math.cos(c.theta);
      this.camara.position.set(
        c.obj.x + c.dist * sp * ct,
        c.obj.y + c.dist * sp * st,
        c.obj.z + c.dist * cp
      );
      this.camara.lookAt(c.obj);
      /* Planos de corte ajustados a la distancia: con un rango enorme
         el buffer de profundidad pierde precisión y las caras
         coplanares parpadean. */
      const near = Math.max(0.05, c.dist * 0.04);
      const far = c.dist * 12 + 2000;
      if (Math.abs(near - this.camara.near) > 1e-6 || Math.abs(far - this.camara.far) > 1e-6) {
        this.camara.near = near;
        this.camara.far = far;
        this.camara.updateProjectionMatrix();
      }
    }

    _bucle() {
      const paso = () => {
        requestAnimationFrame(paso);
        if (!this.necesita) return;
        this.necesita = this._suavizar();
        this._aplicarCamara();
        this.renderer.render(this.escena, this.camara);
      };
      requestAnimationFrame(paso);
    }

    redimensionar() {
      if (!this.ok) return;
      const w = this.contenedor.clientWidth || 1;
      const h = this.contenedor.clientHeight || 1;
      this.renderer.setSize(w, h, false);
      this.camara.aspect = w / h;
      this.camara.updateProjectionMatrix();
      this.necesita = true;
      if (this.grupo) {
        this._aplicarCamara();
        this.renderer.render(this.escena, this.camara);
        this.necesita = false;
      }
    }

    limpiar() {
      if (!this.ok) return;
      while (this.grupo.children.length) {
        const o = this.grupo.children.pop();
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      }
      if (this.rejilla) { this.escena.remove(this.rejilla); this.rejilla.geometry.dispose(); this.rejilla.material.dispose(); this.rejilla = null; }
      if (this.sombra) {
        this.escena.remove(this.sombra);
        this.sombra.geometry.dispose();
        if (this.sombra.material.map) this.sombra.material.map.dispose();
        this.sombra.material.dispose();
        this.sombra = null;
      }
      if (this.ejes) { this.escena.remove(this.ejes); this.ejes = null; }
    }

    /* piezas: [{ malla: Malla, color: 0xRRGGBB, metal: bool }] */
    mostrar(piezas, opciones) {
      if (!this.ok) return;
      opciones = opciones || {};
      this.limpiar();
      const caja = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      let hay = false;

      /* Todas las piezas del mismo material se funden en una sola malla,
         una sola capa de aristas y una sola de vértices: pocas llamadas
         de dibujo = órbita fluida aunque haya decenas de piezas. */
      const grupos = new Map();
      const extraL = [], extraP = [];
      for (const p of piezas) {
        const m0 = p.malla;
        if (!m0 || !m0.f.length) continue;
        const m = m0.clonar().soldar(1e-5);
        if (!m.f.length) continue;

        const d = construirGeometria(m, ANGULO_ARISTA);
        const color = p.color === undefined ? 0x2f80ed : p.color;
        const metal = p.metal === undefined ? 0 : p.metal;
        const rough = p.rough === undefined ? 0.62 : p.rough;
        const clave = color + '|' + metal + '|' + rough;
        let g = grupos.get(clave);
        if (!g) { g = { color, metal, rough, pos: [], nor: [], lin: [], pun: [] }; grupos.set(clave, g); }
        g.pos.push(d.pos); g.nor.push(d.nor);
        if (!p.sinAristas) {
          if (d.lineas) g.lin.push(d.lineas);
          if (d.puntos) g.pun.push(d.puntos);
        }

        const c = m.caja();
        for (let i = 0; i < 3; i++) {
          caja.min[i] = Math.min(caja.min[i], c.min[i]);
          caja.max[i] = Math.max(caja.max[i], c.max[i]);
        }
        hay = true;
      }
      if (opciones.lineas) extraL.push(opciones.lineas);
      if (opciones.puntos) extraP.push(opciones.puntos);

      const unir = (arr) => {
        let n = 0;
        for (const a of arr) n += a.length;
        const out = new Float32Array(n);
        let o = 0;
        for (const a of arr) { out.set(a, o); o += a.length; }
        return out;
      };

      let primero = true;
      grupos.forEach((g) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(unir(g.pos), 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(unir(g.nor), 3));
        const mat = new THREE.MeshStandardMaterial({
          color: g.color,
          metalness: g.metal,
          roughness: g.rough,
          side: THREE.FrontSide,
          flatShading: false,
          /* empuja las caras hacia atrás para que las aristas se vean limpias */
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        });
        const obj = new THREE.Mesh(geo, mat);
        this.grupo.add(obj);

        const lin = g.lin.concat(primero ? extraL : []);
        const pun = g.pun.concat(primero ? extraP : []);
        primero = false;
        const tinte = colorArista(g.color);
        if (lin.length) {
          const lg = new THREE.BufferGeometry();
          lg.setAttribute('position', new THREE.BufferAttribute(unir(lin), 3));
          const ln = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
            color: tinte, transparent: true, opacity: OPACIDAD_ARISTA
          }));
          ln.userData.fijo = 'linea';
          ln.renderOrder = 2;
          this.grupo.add(ln);
        }
        if (pun.length) {
          const pg = new THREE.BufferGeometry();
          pg.setAttribute('position', new THREE.BufferAttribute(unir(pun), 3));
          const pt = new THREE.Points(pg, new THREE.PointsMaterial({
            color: tinte, size: 4.5, sizeAttenuation: false, map: texturaPunto(),
            alphaTest: 0.5, transparent: false
          }));
          pt.userData.fijo = 'punto';
          pt.renderOrder = 3;
          this.grupo.add(pt);
        }
      });

      if (!hay) {
        this.necesita = true;
        return;
      }

      const centro = [
        (caja.min[0] + caja.max[0]) / 2,
        (caja.min[1] + caja.max[1]) / 2,
        (caja.min[2] + caja.max[2]) / 2
      ];
      const tam = Math.max(
        caja.max[0] - caja.min[0],
        caja.max[1] - caja.min[1],
        caja.max[2] - caja.min[2],
        1
      );

      if (opciones.autoEncuadrar !== false) {
        this.objetivo.set(centro[0], centro[1], centro[2]);
        const diag = Math.hypot(
          caja.max[0] - caja.min[0],
          caja.max[1] - caja.min[1],
          caja.max[2] - caja.min[2]
        );
        this._ajustarDistancia(Math.max(diag, 1));
        this._snap();
      }

      this._crearRejilla(caja, tam);
      if (this.usarSombra) this._crearSombra(caja, tam);

      /* Dibuja ya un primer fotograma: si la pestaña está oculta el
         navegador pausa requestAnimationFrame y el visor quedaría vacío. */
      this._aplicarCamara();
      this.renderer.render(this.escena, this.camara);
      this.necesita = true;
    }

    _crearSombra(caja, tam) {
      if (!this.ok) return;
      const centroX = (caja.min[0] + caja.max[0]) / 2;
      const centroY = (caja.min[1] + caja.max[1]) / 2;
      const ancho = caja.max[0] - caja.min[0];
      const fondo = caja.max[1] - caja.min[1];
      const lado = Math.max(ancho, fondo, 1) * 1.5;

      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 256;
      const g = cv.getContext('2d');
      const grad = g.createRadialGradient(128, 128, 8, 128, 128, 126);
      grad.addColorStop(0, 'rgba(40, 40, 38, 0.26)');
      grad.addColorStop(0.45, 'rgba(40, 40, 38, 0.12)');
      grad.addColorStop(1, 'rgba(40, 40, 38, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);

      const textura = new THREE.CanvasTexture(cv);
      if ('encoding' in textura && THREE.sRGBEncoding !== undefined) textura.encoding = THREE.sRGBEncoding;
      const geo = new THREE.PlaneGeometry(lado, lado);
      const mat = new THREE.MeshBasicMaterial({
        map: textura,
        transparent: true,
        depthWrite: false,
        opacity: 0.8
      });
      const plano = new THREE.Mesh(geo, mat);
      plano.position.set(centroX, centroY, caja.min[2] - tam * 0.006);
      plano.renderOrder = 1;
      this.sombra = plano;
      this.escena.add(plano);
    }

    setColor(hex) {
      if (!this.ok) return;
      this.grupo.children.forEach((o) => {
        if (o.userData.fijo) { o.material.color.copy(colorArista(hex)); return; }
        if (o.material && o.material.color) o.material.color.set(hex);
      });
      this.necesita = true;
    }

    _crearRejilla(caja, tam) {
      if (!this.ok) return;
      if (this.rejilla) { this.escena.remove(this.rejilla); this.rejilla.geometry.dispose(); this.rejilla.material.dispose(); }
      const paso = Math.pow(10, Math.floor(Math.log10(Math.max(tam, 1) / 8)));
      const div = Math.ceil((tam * 3) / paso);
      const geo = new THREE.GridHelper(paso * div, div, 0xc9c9c4, 0xdeded9);
      geo.rotation.x = Math.PI / 2;
      geo.position.set(
        Math.round((caja.min[0] + caja.max[0]) / 2 / paso) * paso,
        Math.round((caja.min[1] + caja.max[1]) / 2 / paso) * paso,
        caja.min[2] - tam * 0.012
      );
      geo.material.transparent = true;
      geo.material.opacity = 0.75;
      this.rejilla = geo;
      this.escena.add(this.rejilla);
    }

    _ajustarDistancia(diag) {
      const fov = (this.camara.fov * Math.PI) / 180;
      const aspect = this.camara.aspect || 1;
      const tanV = Math.tan(fov / 2);
      const tanH = tanV * aspect;
      const t = Math.max(0.05, Math.min(tanV, tanH));
      this.dist = (Math.max(diag, 1) / 2) / t * 1.2;
    }

    encuadrar() {
      if (!this.ok) return;
      this.objetivo.set(0, 0, 0);
      let diag = 10;
      const caja = new THREE.Box3();
      this.grupo.children.forEach((o) => {
        if (o.geometry) {
          o.geometry.computeBoundingBox();
          caja.union(o.geometry.boundingBox);
        }
      });
      if (!caja.isEmpty()) {
        const c = caja.getCenter(new THREE.Vector3());
        this.objetivo.copy(c);
        diag = caja.getSize(new THREE.Vector3()).length();
      }
      this._ajustarDistancia(diag);
      this.theta = -Math.PI / 4;
      this.phi = Math.PI / 3.2;
      this.necesita = true;
    }

    vistaFrontal() { this.theta = -Math.PI / 2; this.phi = Math.PI / 2; this.necesita = true; }
    vistaLateral() { this.theta = 0; this.phi = Math.PI / 2; this.necesita = true; }
    vistaSuperior() { this.theta = -Math.PI / 2; this.phi = 0.02; this.necesita = true; }
    vistaIso() { this.theta = -Math.PI / 4; this.phi = Math.PI / 3.2; this.necesita = true; }
  }

  global.RP.Visor = Visor;
})(window);
