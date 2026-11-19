/* croquis.js - dibujos de ventanas (SVG) al estilo de PrefGest/PrefCAD, compartidos por la página del móvil
   (pwa/presupuesto-movil.html) y por Jeovent Taller. UMD: window.Croquis en el navegador, module.exports en Node.

   Convenciones (las de la ficha de medición de Jeovent, ver presupuesto.js):
   - triángulo en la hoja = practicable (el vértice en el lado de la manilla), Λ = oscilobatiente
   - flecha horizontal = corredera, F = fijo, rayado = panel ciego
   - cajón de persiana arriba, con su altura; punto negro en el marco = recogedor de cinta (lado); M = motor
   - tapajuntas = doble línea alrededor del marco

   Croquis.svg(v, opts)  -> string SVG de la ventana v = { tipo, ancho_cm, alto_cm, cajon_cm, persiana, recogedor_lado,
                            ancho_tramo1_cm, panel, tapajuntas, uds }
        opts = { w: anchura px (320), cotas: true/false, activo: 'ancho'|'alto'|'' (cota resaltada), ids: true (atributos data-zona) }
   Croquis.icono(tipo, w) -> SVG pequeño del tipo (para el selector)
   Croquis.TIPOS          -> { clave: etiqueta } en el orden del selector
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Croquis = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIPOS = {
    fijo: 'Fijo',
    '1_hoja_practicable': '1 hoja practicable',
    '1_hoja_oscilobatiente': '1 hoja oscilobatiente',
    '2_hojas_practicables': '2 hojas practicables',
    '2_hojas_1_oscilobatiente': '2 hojas · 1 oscilobatiente',
    '2_hojas_oscilobatientes': '2 hojas oscilobatientes',
    corredera: 'Corredera',
    balconera: 'Balconera',
    puerta: 'Puerta',
    balconera_exterior: 'Balconera ap. exterior',
    abatible: 'Abatible',
    osciloparalela: 'Osciloparalela',
    osc_fijo_osc: 'Hoja + fijo + hoja',
    '2h_1osc_fijo_arriba': '2 hojas + fijo arriba',
    '2h_1osc_fijo_abajo': '2 hojas + fijo abajo',
    corredera_2h_abajo: 'Corredera arriba + 2 hojas abajo',
    corredera_fijo_abajo: 'Corredera arriba + fijo abajo',
    '4_hojas_2_osc': '4 hojas · 2 oscilobatientes',
    corredera_3_hojas: 'Corredera 3 hojas',
    corredera_4_hojas: 'Corredera 4 hojas',
    bandera_derecha: 'Bandera: hoja + fijo arriba dcha.',
    bandera_izquierda: 'Bandera: fijo arriba izq. + hoja',
    otro: 'Fijo de panel + hojas'
  };
  // Qué cotas secundarias usa cada tipo (compartido con el PWA y el PC):
  //   ancho_tramo1_cm = primer tramo (izquierda); ancho_tramo2_cm = fijo central; alto_fijo_cm = tramo separado por travesaño (fijo arriba/abajo, tramo inferior bajo una corredera, fijo de la bandera)
  function conTramo1(tipo) { return /^(otro|osc_fijo_osc|4_hojas_2_osc|bandera_(derecha|izquierda))$/.test(tipo || ''); }
  function conTramo2(tipo) { return tipo === 'osc_fijo_osc'; }
  function conTramoAlto(tipo) { return /^(2h_1osc_fijo_(arriba|abajo)|corredera_(2h|fijo)_abajo|bandera_(derecha|izquierda))$/.test(tipo || ''); }
  function nombreTramo1(tipo) { return tipo === 'osc_fijo_osc' ? 'ancho de la hoja izquierda' : tipo === '4_hojas_2_osc' ? 'ancho de la mitad izquierda' : /^bandera_/.test(tipo || '') ? 'ancho del primer tramo (izquierda)' : 'tramo L1'; }
  function nombreTramoAlto(tipo) { return /^corredera_/.test(tipo || '') ? 'alto del tramo inferior (incluido en el alto)' : /^bandera_/.test(tipo || '') ? 'alto del fijo' : 'alto del tramo fijo (incluido en el alto)'; }

  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(x) ? 0 : x; }
  function f(x) { return Math.round(x * 10) / 10; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtCm(v) { v = n(v); if (!v) return '–'; return String(v).replace('.', ','); }

  // Primitivas ------------------------------------------------------------
  function rect(x, y, w, h, cls, extra) { return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" class="' + cls + '"' + (extra || '') + '/>'; }
  function line(x1, y1, x2, y2, cls) { return '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" class="' + cls + '"/>'; }
  function poly(pts, cls) { return '<polyline points="' + pts.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ') + '" class="' + cls + '"/>'; }
  function text(x, y, t, cls, extra) { return '<text x="' + f(x) + '" y="' + f(y) + '" class="' + cls + '"' + (extra || '') + '>' + esc(t) + '</text>'; }

  // Hoja practicable: triángulo con el vértice en el lado de la manilla (manilla = lado contrario a las bisagras).
  // bisagra: 'izq' | 'der'
  function practicable(x, y, w, h, bisagra) {
    var ax = bisagra === 'izq' ? x + w : x, bx = bisagra === 'izq' ? x : x + w;   // vértice (manilla) en ax
    return poly([[bx, y], [ax, y + h / 2], [bx, y + h]], 'ap');
  }
  function oscilo(x, y, w, h) { return poly([[x, y + h], [x + w / 2, y], [x + w, y + h]], 'ap'); }
  function corredera(x, y, w, h, dir) {
    var cy = y + h / 2, l = Math.min(w * 0.5, 40), cx = x + w / 2, s = 6;
    var x1 = cx - l / 2, x2 = cx + l / 2;
    var h1 = line(x1, cy, x2, cy, 'ap');
    if (dir === 'der') return h1 + poly([[x2 - s, cy - s], [x2, cy], [x2 - s, cy + s]], 'ap');
    return h1 + poly([[x1 + s, cy - s], [x1, cy], [x1 + s, cy + s]], 'ap');
  }
  function fijoMarca(x, y, w, h) { return text(x + w / 2, y + h / 2 + 5, 'F', 'fj', ' text-anchor="middle"'); }
  function panelRayado(x, y, w, h) {
    var out = rect(x, y, w, h, 'pan'), paso = 9;
    for (var d = paso; d < w + h; d += paso) {
      var x1 = x + Math.max(0, d - h), y1 = y + Math.min(h, d), x2 = x + Math.min(w, d), y2 = y + Math.max(0, d - w);
      out += line(x1, y1, x2, y2, 'ray');
    }
    return out;
  }
  function manilla(x, y, h, lado) { var mx = lado === 'izq' ? x + 6 : x - 6; return rect(mx - 2, y + h / 2 - 9, 4, 18, 'man'); }

  // Composición de hojas dentro de un marco interior (x,y,w,h) -----------------
  function hojas(tipo, x, y, w, h, marco) {
    var out = '', g = 6;   // g = grosor de hoja dibujado
    function hoja(hx, hw, dibujo) { out += rect(hx, y, hw, h, 'hoja'); out += rect(hx + g, y + g, Math.max(1, hw - 2 * g), Math.max(1, h - 2 * g), 'vid'); if (dibujo) out += dibujo(hx + g, y + g, hw - 2 * g, h - 2 * g); }
    switch (tipo) {
      case 'fijo':
        out += rect(x, y, w, h, 'vid'); out += fijoMarca(x, y, w, h); break;
      case '1_hoja_practicable':
        hoja(x, w, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'der') + manilla(hx, hy, hh, 'izq'); }); break;
      case '1_hoja_oscilobatiente': case 'balconera':
        hoja(x, w, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'der') + oscilo(hx, hy, hw, hh) + manilla(hx, hy, hh, 'izq'); }); break;
      case 'puerta':
        hoja(x, w, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'der') + manilla(hx, hy, hh, 'izq') + rect(hx, hy + hh * 0.62, hw, hh * 0.38, 'pan'); }); break;
      case '2_hojas_practicables':
        hoja(x, w / 2, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'izq'); });
        hoja(x + w / 2, w / 2, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'der') + manilla(hx, hy, hh, 'izq'); });
        break;
      case '2_hojas_1_oscilobatiente':
        hoja(x, w / 2, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'izq'); });
        hoja(x + w / 2, w / 2, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'der') + oscilo(hx, hy, hw, hh) + manilla(hx, hy, hh, 'izq'); });
        break;
      case '2_hojas_oscilobatientes':
        hoja(x, w / 2, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'izq') + oscilo(hx, hy, hw, hh); });
        hoja(x + w / 2, w / 2, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'der') + oscilo(hx, hy, hw, hh) + manilla(hx, hy, hh, 'izq'); });
        break;
      case 'balconera_exterior':
        hoja(x, w, function (hx, hy, hw, hh) { return practicable(hx, hy, hw, hh, 'der') + manilla(hx, hy, hh, 'izq') + (hh > 70 ? text(hx + hw / 2, hy + hh - 6, 'ap. ext.', 'uds', ' text-anchor="middle"') : ''); }); break;
      case 'abatible':
        hoja(x, w, function (hx, hy, hw, hh) { return oscilo(hx, hy, hw, hh); }); break;
      case 'osciloparalela':
        hoja(x, w / 2 + 3, null);
        hoja(x + w / 2 - 3, w / 2 + 3, function (hx, hy, hw, hh) { return oscilo(hx, hy, hw, hh) + corredera(hx, hy, hw, hh, 'izq') + manilla(hx, hy, hh, 'izq'); });
        break;
      case 'corredera':
        hoja(x, w / 2 + 3, function (hx, hy, hw, hh) { return corredera(hx, hy, hw, hh, 'der'); });
        hoja(x + w / 2 - 3, w / 2 + 3, function (hx, hy, hw, hh) { return corredera(hx, hy, hw, hh, 'izq'); });
        break;
      default:
        out += rect(x, y, w, h, 'vid');
    }
    return out;
  }

  // Dibujo completo ---------------------------------------------------------------
  function svg(v, opts) {
    v = v || {}; opts = opts || {};
    var W = opts.w || 320, cotas = opts.cotas !== false, ids = !!opts.ids, activo = opts.activo || '';
    var ancho = n(v.ancho_cm) || 120, alto = n(v.alto_cm) || 120, cajon = (v.persiana && v.persiana !== 'ninguna') ? (n(v.cajon_cm) || 18.5) : 0;
    var tapa = v.tapajuntas !== false, pers = v.persiana || 'ninguna', lado = v.recogedor_lado || 'ninguno';
    // escala: la ventana entra en un área W x (W*0.9) con márgenes para cotas
    var mL = cotas ? 10 : 6, mR = cotas ? 84 : 6, mT = cotas ? 30 : 6, mB = cotas ? 10 : 6;
    var areaW = W - mL - mR, areaH = (opts.h || Math.round(W * 0.95)) - mT - mB;
    var totalH = alto + cajon;
    var k = Math.min(areaW / ancho, areaH / totalH);
    var pw = ancho * k, ph = alto * k, pc = cajon * k;
    var x0 = mL + (areaW - pw) / 2, y0 = mT + (areaH - ph - pc) / 2;   // y0 = arriba del cajón (o del marco si no hay)
    var H = mT + areaH + mB;
    var out = '';
    out += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + f(H) + '" width="100%" class="croquis">';
    out += '<style>.croquis .mar{fill:#fff;stroke:#0f172a;stroke-width:2}.croquis .tap{fill:none;stroke:#0f172a;stroke-width:1.2}.croquis .hoja{fill:#fff;stroke:#0f172a;stroke-width:1.6}.croquis .vid{fill:#dbeafe;stroke:#334155;stroke-width:1}.croquis .ap{fill:none;stroke:#0f172a;stroke-width:1.3}.croquis .man{fill:#0f172a}.croquis .fj{font:600 15px sans-serif;fill:#0f172a}.croquis .pan{fill:#e2e8f0;stroke:#334155;stroke-width:1}.croquis .ray{stroke:#64748b;stroke-width:.8}.croquis .caj{fill:#f1f5f9;stroke:#0f172a;stroke-width:1.6}.croquis .cot{stroke:#1a4fa0;stroke-width:1}.croquis .ct{font:600 13px sans-serif;fill:#1a4fa0}.croquis .ct.act{fill:#b45309}.croquis .cota.act rect{fill:#fef3c7;stroke:#f59e0b}.croquis .cota rect{fill:#fff;stroke:#cbd5e1;rx:5}.croquis .rec{fill:#0f172a}.croquis .mot{font:700 12px sans-serif;fill:#0f172a}.croquis .zona{fill:transparent}.croquis .uds{font:600 12px sans-serif;fill:#64748b}.croquis .pared{fill:#fff;stroke:#fff;stroke-width:3}</style>';

    // cajón
    var yMarco = y0 + pc;
    if (cajon) {
      out += rect(x0, y0, pw, pc, 'caj', ids ? ' data-zona="cajon"' : '');
      if (pw >= 150) out += text(x0 + pw / 2, y0 + pc / 2 + 4, 'Cajón ' + fmtCm(cajon) + (pers === 'motor' ? ' · MOTOR' : ''), 'mot', ' text-anchor="middle"');
      else if (pers === 'motor') out += text(x0 + pw / 2, y0 + pc / 2 + 3, 'M', 'mot', ' text-anchor="middle" style="font-size:8px"');
    }
    // marco + tapajuntas
    if (tapa) out += rect(x0 - 5, (cajon ? y0 : yMarco) - 5, pw + 10, ph + pc + 10, 'tap');
    out += rect(x0, yMarco, pw, ph, 'mar');
    var g = Math.min(9, pw * 0.06, ph * 0.06);   // grosor del marco dibujado
    var ix = x0 + g, iy = yMarco + g, iw = pw - 2 * g, ih = ph - 2 * g;
    if (v.tipo === 'otro') {
      // fijo de panel (o vidrio) a la izquierda con anchura L1, poste y 2 hojas (1 oscilobatiente) a la derecha
      var l1 = n(v.ancho_tramo1_cm); var pl = l1 > 0 && l1 < ancho ? l1 * k : iw * 0.3;
      if (v.panel !== false) out += panelRayado(ix, iy, pl, ih); else { out += rect(ix, iy, pl, ih, 'vid'); out += fijoMarca(ix, iy, pl, ih); }
      out += rect(ix + pl - 2, iy, 5, ih, 'mar');   // poste
      out += hojas('2_hojas_1_oscilobatiente', ix + pl + 3, iy, iw - pl - 3, ih);
    } else if (/^2h_1osc_fijo_(arriba|abajo)$/.test(v.tipo)) {
      // 2 hojas (1 oscilobatiente) con un tramo fijo arriba o abajo, separado por travesaño
      var fj = n(v.alto_fijo_cm), abajo = /abajo$/.test(v.tipo);
      var pf = fj > 0 && fj < alto ? fj * k : ih * 0.22;
      var yF = abajo ? iy + ih - pf : iy;
      out += rect(ix, yF, iw, pf, 'vid') + fijoMarca(ix, yF, iw, pf);
      if (cotas && fj > 0) out += text(ix + iw - 4, yF + pf / 2 + 4, fmtCm(fj), 'ct', ' text-anchor="end" style="font-size:11px"');
      out += rect(ix, (abajo ? yF : yF + pf) - 2, iw, 5, 'mar');
      out += hojas('2_hojas_1_oscilobatiente', ix, abajo ? iy : iy + pf + 3, iw, Math.max(10, ih - pf - 3));
    } else if (v.tipo === 'osc_fijo_osc') {
      // hoja oscilobatiente (bisagras a la izquierda) + fijo central + hoja oscilobatiente (bisagras a la derecha), con dos postes
      var t1 = n(v.ancho_tramo1_cm), t2 = n(v.ancho_tramo2_cm);
      var p1 = t1 > 0 && t1 < ancho ? t1 * k : iw * 0.36, p2 = t2 > 0 && t1 + t2 < ancho ? t2 * k : iw * 0.28, p3 = iw - p1 - p2;
      var gg = 6;
      out += rect(ix, iy, p1, ih, 'hoja') + rect(ix + gg, iy + gg, Math.max(1, p1 - 2 * gg), Math.max(1, ih - 2 * gg), 'vid') + practicable(ix + gg, iy + gg, p1 - 2 * gg, ih - 2 * gg, 'izq') + oscilo(ix + gg, iy + gg, p1 - 2 * gg, ih - 2 * gg) + manilla(ix + p1 - gg, iy + gg, ih - 2 * gg, 'der');
      out += rect(ix + p1 - 2, iy, 5, ih, 'mar');
      out += rect(ix + p1 + 3, iy, Math.max(1, p2 - 6), ih, 'vid') + fijoMarca(ix + p1, iy, p2, ih);
      out += rect(ix + p1 + p2 - 2, iy, 5, ih, 'mar');
      var x3 = ix + p1 + p2 + 3, w3 = Math.max(1, p3 - 3);
      out += rect(x3, iy, w3, ih, 'hoja') + rect(x3 + gg, iy + gg, Math.max(1, w3 - 2 * gg), Math.max(1, ih - 2 * gg), 'vid') + practicable(x3 + gg, iy + gg, w3 - 2 * gg, ih - 2 * gg, 'der') + oscilo(x3 + gg, iy + gg, w3 - 2 * gg, ih - 2 * gg) + manilla(x3 + gg, iy + gg, ih - 2 * gg, 'izq');
    } else if (/^corredera_(2h|fijo)_abajo$/.test(v.tipo)) {
      // corredera de 2 hojas arriba + (2 hojas con 1 oscilobatiente | fijo) abajo, separados por travesaño; alto_fijo_cm = alto del tramo inferior
      var ab = n(v.alto_fijo_cm), pAb = ab > 0 && ab < alto ? ab * k : ih / 2, yAb = iy + ih - pAb;
      out += hojas('corredera', ix, iy, iw, Math.max(10, ih - pAb - 3));
      out += rect(ix, yAb - 2, iw, 5, 'mar');
      if (v.tipo === 'corredera_2h_abajo') out += hojas('2_hojas_1_oscilobatiente', ix, yAb + 3, iw, Math.max(10, pAb - 3));
      else { out += rect(ix, yAb + 3, iw, Math.max(1, pAb - 3), 'vid'); out += fijoMarca(ix, yAb + 3, iw, pAb - 3); }
      if (cotas && ab > 0) out += text(ix + iw - 4, yAb + pAb / 2 + 4, fmtCm(ab), 'ct', ' text-anchor="end" style="font-size:11px"');
    } else if (v.tipo === '4_hojas_2_osc') {
      // dos ventanas de 2 hojas (1 oscilobatiente) unidas por un poste central; ancho_tramo1_cm = mitad izquierda
      var mit = n(v.ancho_tramo1_cm), pm = mit > 0 && mit < ancho ? mit * k : iw / 2;
      out += hojas('2_hojas_1_oscilobatiente', ix, iy, Math.max(10, pm - 3), ih);
      out += rect(ix + pm - 2, iy, 5, ih, 'mar');
      out += hojas('2_hojas_1_oscilobatiente', ix + pm + 3, iy, Math.max(10, iw - pm - 3), ih);
    } else if (/^corredera_(3|4)_hojas$/.test(v.tipo)) {
      // corredera de 3 ("→ (←) ←") o 4 hojas ("→ ← → ←")
      var nh = v.tipo === 'corredera_3_hojas' ? 3 : 4, hw = iw / nh, dirs = nh === 3 ? ['der', 'izq', 'izq'] : ['der', 'izq', 'der', 'izq'], gh = 6;
      for (var hi = 0; hi < nh; hi++) { var hx = ix + hi * hw; out += rect(hx, iy, hw, ih, 'hoja') + rect(hx + gh, iy + gh, Math.max(1, hw - 2 * gh), Math.max(1, ih - 2 * gh), 'vid') + corredera(hx + gh, iy + gh, hw - 2 * gh, ih - 2 * gh, dirs[hi]); }
    } else if (/^bandera_(derecha|izquierda)$/.test(v.tipo)) {
      // marco en "L" (bandera): hoja oscilobatiente alta + fijo pequeño arriba a un lado; debajo del fijo hay pared.
      // ancho_tramo1_cm = primer tramo (izquierda): la hoja en bandera_derecha, el fijo en bandera_izquierda; alto_fijo_cm = alto del fijo
      var der = v.tipo === 'bandera_derecha', t1b = n(v.ancho_tramo1_cm), fjb = n(v.alto_fijo_cm);
      var wH = t1b > 0 && t1b < ancho ? (der ? t1b : ancho - t1b) * k : iw * 0.62, wF = iw - wH, hF = fjb > 0 && fjb < alto ? fjb * k : ih / 2;
      var xH = der ? ix : ix + wF, xF = der ? ix + wH : ix, xP = der ? ix + wH - 2 : ix + wF - 2, yFb = iy + hF;
      out += hojas('1_hoja_oscilobatiente', xH + (der ? 0 : 3), iy, Math.max(10, wH - 3), ih);
      out += rect(xF + (der ? 3 : 0), iy, Math.max(1, wF - 3), hF, 'vid') + fijoMarca(xF, iy, wF, hF);
      // pared bajo el fijo (tapa el marco exterior) y el marco en "L"
      out += rect(der ? xP + 5 : x0 - 7, yFb + 3, der ? (x0 + pw + 7) - (xP + 5) : xP - (x0 - 7), (yMarco + ph + 7) - (yFb + 3), 'pared');
      out += rect(xP, iy, 5, ih + g, 'mar');
      out += rect(der ? xP : x0, yFb, der ? x0 + pw - xP : xP + 5 - x0, g, 'mar');
      if (cotas && fjb > 0) out += text(xF + wF / 2, yFb + 14, fmtCm(fjb), 'ct', ' text-anchor="middle" style="font-size:11px"');
    } else out += hojas(v.tipo || '1_hoja_oscilobatiente', ix, iy, iw, ih);
    // recogedor (punto negro en el marco, a media altura)
    if (cajon && pers === 'recogedor' && (lado === 'izquierda' || lado === 'derecha')) {
      var rx = lado === 'izquierda' ? x0 + g / 2 : x0 + pw - g / 2;
      out += '<circle cx="' + f(rx) + '" cy="' + f(yMarco + ph * 0.45) + '" r="' + (W < 160 ? 2.5 : 5) + '" class="rec"/>';
    }
    // zonas tocables (transparentes) para el editor
    if (ids) {
      out += rect(x0, yMarco, pw * 0.25, ph, 'zona', ' data-zona="izquierda"');
      out += rect(x0 + pw * 0.75, yMarco, pw * 0.25, ph, 'zona', ' data-zona="derecha"');
      out += rect(x0, Math.max(0, y0 - 24), pw, cajon ? pc + 24 : 24, 'zona', ' data-zona="cajon"');
    }
    // cotas
    if (cotas) {
      var cy = y0 - 12;
      out += line(x0, cy, x0 + pw, cy, 'cot'); out += line(x0, cy - 5, x0, cy + 5, 'cot'); out += line(x0 + pw, cy - 5, x0 + pw, cy + 5, 'cot');
      var ta = fmtCm(v.ancho_cm), wa = Math.max(52, ta.length * 9 + 18);
      out += '<g class="cota' + (activo === 'ancho' ? ' act' : '') + '"' + (ids ? ' data-cota="ancho"' : '') + '>' + rect(x0 + pw / 2 - wa / 2, cy - 11, wa, 22, '') + text(x0 + pw / 2, cy + 5, ta, 'ct' + (activo === 'ancho' ? ' act' : ''), ' text-anchor="middle"') + '</g>';
      var cx = x0 + pw + 14;
      out += line(cx, yMarco, cx, yMarco + ph, 'cot'); out += line(cx - 5, yMarco, cx + 5, yMarco, 'cot'); out += line(cx - 5, yMarco + ph, cx + 5, yMarco + ph, 'cot');
      var th = fmtCm(v.alto_cm), wh = Math.max(44, th.length * 9 + 16);
      out += '<g class="cota' + (activo === 'alto' ? ' act' : '') + '"' + (ids ? ' data-cota="alto"' : '') + '>' + rect(cx + 6, yMarco + ph / 2 - 11, wh, 22, '') + text(cx + 6 + wh / 2, yMarco + ph / 2 + 5, th, 'ct' + (activo === 'alto' ? ' act' : ''), ' text-anchor="middle"') + '</g>';
      if (v.tipo === 'osc_fijo_osc' && n(v.ancho_tramo1_cm) > 0) {
        var cl2 = yMarco + ph + 8, a1 = n(v.ancho_tramo1_cm) * k, a2 = n(v.ancho_tramo2_cm) * k;
        out += line(x0, cl2, x0 + a1, cl2, 'cot') + text(x0 + a1 / 2, cl2 + 12, fmtCm(v.ancho_tramo1_cm), 'ct', ' text-anchor="middle" style="font-size:11px"');
        if (a2 > 0 && a1 + a2 < pw) { out += line(x0 + a1 + 3, cl2, x0 + a1 + a2, cl2, 'cot') + text(x0 + a1 + a2 / 2, cl2 + 12, fmtCm(v.ancho_tramo2_cm), 'ct', ' text-anchor="middle" style="font-size:11px"'); out += text(x0 + a1 + a2 + (pw - a1 - a2) / 2, cl2 + 12, fmtCm(Math.round((ancho - n(v.ancho_tramo1_cm) - n(v.ancho_tramo2_cm)) * 10) / 10), 'ct', ' text-anchor="middle" style="font-size:11px"'); }
      }
      if (conTramo1(v.tipo) && v.tipo !== 'osc_fijo_osc' && n(v.ancho_tramo1_cm) > 0) {
        var cl = yMarco + ph + 8; out += line(x0, cl, x0 + n(v.ancho_tramo1_cm) * k, cl, 'cot');
        out += text(x0 + n(v.ancho_tramo1_cm) * k / 2, cl + 12, 'L1 ' + fmtCm(v.ancho_tramo1_cm), 'ct', ' text-anchor="middle" style="font-size:11px"');
      }
      if (n(v.uds) > 1) out += text(W - 4, H - 4, '×' + n(v.uds), 'uds', ' text-anchor="end"');
    }
    out += '</svg>';
    return out;
  }

  function icono(tipo, w) {
    var una = /^(puerta|balconera|balconera_exterior|1_hoja_practicable|1_hoja_oscilobatiente|abatible)$/.test(tipo), alta = /^(puerta|balconera|balconera_exterior)$/.test(tipo), conFijo = conTramoAlto(tipo);
    var ancho = una ? 90 : tipo === 'osc_fijo_osc' ? 190 : /^(4_hojas_2_osc|corredera_4_hojas)$/.test(tipo) ? 200 : tipo === 'corredera_3_hojas' ? 180 : /^bandera_/.test(tipo) ? 100 : /^corredera_(2h|fijo)_abajo$/.test(tipo) ? 110 : 150;
    var alto = alta ? 210 : /^corredera_(2h|fijo)_abajo$/.test(tipo) ? 200 : conFijo ? 150 : tipo === 'abatible' ? 70 : 120;
    var v = { tipo: tipo, ancho_cm: ancho, alto_cm: alto, persiana: 'ninguna', tapajuntas: false, ancho_tramo1_cm: tipo === 'osc_fijo_osc' ? 68 : tipo === 'bandera_derecha' ? 62 : tipo === 'bandera_izquierda' ? 38 : tipo === '4_hojas_2_osc' ? 100 : 45, ancho_tramo2_cm: 54, alto_fijo_cm: /^bandera_/.test(tipo) ? 70 : /^corredera_/.test(tipo) ? 100 : 40, panel: true };
    return svg(v, { w: w || 80, h: Math.round((w || 80) * 0.95), cotas: false });
  }

  function resumen(v) {
    var t = (TIPOS[v.tipo] || v.tipo || '') + ' · ' + fmtCm(v.ancho_cm) + ' × ' + fmtCm(v.alto_cm) + ' cm';
    if (v.persiana && v.persiana !== 'ninguna') t += ' · cajón ' + fmtCm(v.cajon_cm || 18.5) + (v.persiana === 'motor' ? ' motor' : (v.recogedor_lado && v.recogedor_lado !== 'ninguno' ? ' recogedor ' + v.recogedor_lado : ' recogedor'));
    if (conTramoAlto(v.tipo) && n(v.alto_fijo_cm) > 0) t += (/^corredera_/.test(v.tipo) ? ' · abajo ' : ' · fijo ') + fmtCm(v.alto_fijo_cm);
    if (conTramo1(v.tipo) && v.tipo !== 'otro' && n(v.ancho_tramo1_cm) > 0) t += ' · tramo 1: ' + fmtCm(v.ancho_tramo1_cm);
    if (v.tapajuntas === false) t += ' · sin tapajuntas';
    if (n(v.uds) > 1) t += ' · ' + n(v.uds) + ' uds';
    return t;
  }

  return { svg: svg, icono: icono, resumen: resumen, TIPOS: TIPOS, fmtCm: fmtCm, conTramo1: conTramo1, conTramo2: conTramo2, conTramoAlto: conTramoAlto, nombreTramo1: nombreTramo1, nombreTramoAlto: nombreTramoAlto };
}));
