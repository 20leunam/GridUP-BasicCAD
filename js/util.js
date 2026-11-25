/* ============================================================
   util.js - helpers de interfaz
   ============================================================ */
(function (global) {
  'use strict';

  function num(id, def) {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(String(el.value).replace(',', '.'));
    return isFinite(v) ? v : def;
  }

  function chk(id) {
    const el = document.getElementById(id);
    return !!(el && el.checked);
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v;
  }

  function debounce(fn, ms) {
    let t = 0;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  }

  function fmt(n, dec) {
    if (!isFinite(n)) return '—';
    const d = dec === undefined ? 2 : dec;
    return n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  /* Pie de información con el mismo lenguaje visual que las cotas del visor */
  function infoHTML(tam, solidos, tris, volCm3, gramos) {
    const detalle = solidos + ' sólido' + (solidos === 1 ? '' : 's') +
      ' · ' + tris.toLocaleString('es-ES') + ' triángulos';
    return '<span class="medida"><i>Ancho</i><b>' + fmt(tam[0], 1) + '</b><em>mm</em></span>' +
      '<span class="medida"><i>Alto</i><b>' + fmt(tam[2], 1) + '</b><em>mm</em></span>' +
      '<span class="medida"><i>Fondo</i><b>' + fmt(tam[1], 1) + '</b><em>mm</em></span>' +
      '<span class="dato" title="' + detalle + '">' +
      fmt(volCm3, 2) + ' cm³ · PLA ' + fmt(gramos, 1) + ' g</span>';
  }

  global.RP = global.RP || {};
  global.RP.util = { num, chk, setVal, debounce, fmt, el, infoHTML };
})(window);
