/* ============================================================
   app.js - pestañas, deslizadores, paleta e inicialización
   ============================================================ */
(function () {
  'use strict';

  const RP = window.RP;
  RP.estado = RP.estado || {
    colores: { rejas: 0x2f80ed, revolucion: 0x2f80ed, extrusion: 0x2f80ed }
  };

  /* Convierte los campos numéricos con data-slider en píldoras con
     deslizador + caja de número, al estilo de Bento3D. */
  function mejorarDeslizadores() {
    document.querySelectorAll('input[type="number"][data-slider]').forEach((inp) => {
      if (inp.parentNode && inp.parentNode.classList.contains('desliz')) return;
      const min = parseFloat(inp.dataset.min || inp.min || '0');
      const max = parseFloat(inp.dataset.max || '100');
      const step = parseFloat(inp.step || '1');
      const valor = parseFloat(String(inp.value).replace(',', '.'));
      const inicial = isFinite(valor) ? Math.min(max, Math.max(min, valor)) : min;

      const wrap = document.createElement('div');
      wrap.className = 'desliz';

      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(min);
      range.max = String(max);
      range.step = String(step);
      range.value = String(inicial);
      range.setAttribute('aria-label', inp.id);

      inp.parentNode.insertBefore(wrap, inp);
      wrap.appendChild(range);
      wrap.appendChild(inp);

      const pintarPista = () => {
        const v = parseFloat(range.value);
        const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
        range.style.setProperty('--p', Math.max(0, Math.min(100, pct)).toFixed(2) + '%');
      };
      pintarPista();

      range.addEventListener('input', () => {
        inp.value = range.value;
        pintarPista();
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
      inp.addEventListener('input', () => {
        const v = parseFloat(String(inp.value).replace(',', '.'));
        if (isFinite(v)) {
          range.value = String(Math.min(max, Math.max(min, v)));
          pintarPista();
        }
      });
    });
  }

  /* Paleta de acabado: solo cambia el color de la previsualización. */
  function mejorarPaletas() {
    document.querySelectorAll('.paleta').forEach((paleta) => {
      const tab = paleta.getAttribute('data-paleta');
      paleta.querySelectorAll('.muestra').forEach((btn) => {
        btn.addEventListener('click', () => {
          const color = parseInt(btn.getAttribute('data-color'), 16);
          if (!isFinite(color)) return;
          RP.estado.colores[tab] = color;
          paleta.querySelectorAll('.muestra').forEach((m) => m.classList.toggle('activa', m === btn));
          const visor = RP[tab] && RP[tab].visor;
          if (visor && visor.setColor) visor.setColor(color);
        });
      });
    });
  }

  function conectarPestanas() {
    const botones = document.querySelectorAll('.pestana');
    const tabs = {
      rejas: document.getElementById('tab-rejas'),
      revolucion: document.getElementById('tab-revolucion'),
      extrusion: document.getElementById('tab-extrusion')
    };
    const primeraVez = { revolucion: true, extrusion: true };
    const visto = { rejas: true, revolucion: false, extrusion: false };

    const activar = (nombre, recordar) => {
      if (!tabs[nombre]) return;
      botones.forEach((x) => x.classList.toggle('activa', x.getAttribute('data-tab') === nombre));
      Object.keys(tabs).forEach((k) => tabs[k].classList.toggle('activa', k === nombre));

      if (recordar && window.location.hash !== '#' + nombre) {
        try { history.replaceState(null, '', '#' + nombre); } catch (err) { /* file:// */ }
      }

      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (nombre === 'rejas' && RP.rejas.visor) {
          RP.rejas.visor.redimensionar();
          RP.rejas.visor.necesita = true;
        }
        if (nombre === 'revolucion') {
          if (RP.revolucion.visor) {
            RP.revolucion.visor.redimensionar();
            if (!visto.revolucion) {
              visto.revolucion = true;
              RP.revolucion.visor.encuadrar();
            } else {
              RP.revolucion.visor.necesita = true;
            }
          }
          if (RP.boceto) { RP.boceto.redibujar(); if (primeraVez.revolucion) { primeraVez.revolucion = false; RP.boceto.encuadrar(); } }
        }
        if (nombre === 'extrusion') {
          if (RP.extrusion.visor) {
            RP.extrusion.visor.redimensionar();
            if (!visto.extrusion) {
              visto.extrusion = true;
              RP.extrusion.visor.encuadrar();
            } else {
              RP.extrusion.visor.necesita = true;
            }
          }
          if (RP.extrusion.boceto) { RP.extrusion.boceto.redibujar(); if (primeraVez.extrusion) { primeraVez.extrusion = false; RP.extrusion.boceto.encuadrar(); } }
        }
      }));
    };

    botones.forEach((b) => {
      b.addEventListener('click', () => activar(b.getAttribute('data-tab'), true));
    });

    const inicial = (window.location.hash || '').replace('#', '');
    if (tabs[inicial] && inicial !== 'rejas') activar(inicial, false);
  }

  function arrancar() {
    mejorarDeslizadores();
    mejorarPaletas();
    conectarPestanas();
    try {
      RP.rejas.iniciar();
    } catch (e) {
      console.error('Error iniciando rejas:', e);
    }
    try {
      RP.revolucion.iniciar();
    } catch (e) {
      console.error('Error iniciando revolución:', e);
    }
    try {
      RP.extrusion.iniciar();
    } catch (e) {
      console.error('Error iniciando extrusión:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
