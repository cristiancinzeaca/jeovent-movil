/* persiana.js - coste de una persiana con los precios de compra de La Viuda (albaranes -> viuda_precios.csv).
   UMD: window.Persiana en el navegador (PC y PWA), module.exports en Node.

   Persiana.parseCSV(texto)            -> [{ codigo, descripcion, unidad, precio, fecha }] (viuda_precios.csv o viuda_lineas.csv; separador ; y coma decimal)
   Persiana.opciones(precios)          -> listas para los desplegables (colores de lama, terminal y cajón foliado) sacadas de las descripciones
   Persiana.calcular(p, precios, reglas, ajustes) -> { piezas: [...], coste, coste_ud, faltan: [...], lamas: { n, largo_mm, ml } }
       p = { ancho_mm, alto_mm, cajon_mm (155|185|200), uds, color_lama, color_terminal, cajon ('blanco'|'foliado'), color_cajon, eje (0 = automático, 40, 60), recogedor }
       reglas = Persiana.REGLAS con cambios; ajustes = { clave: cantidad por unidad } para forzar cantidades a mano.

   Regla Jeovent (2026-11-19, dictada por Cristian):
     lamas CS-45: (alto + cajón) / 45 redondeado hacia abajo + 2, largo ancho - 75     eje octogonal: ancho - 75
     cajón (RTX enrasado o principal + tapa + enrasado + inferior foliados) y perfil aislante: ancho - 16     testeros: 1 juego
     felpudo: 3 × ancho (terminal + dos lados del cajón)     guías, embudos y tornillos NO (las guías van en el precio de la ventana)
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Persiana = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var REGLAS = {
    descuento_lama: 75,      // largo de la lama = ancho - 75
    paso_lama: 45,           // mm de alto por lama
    lamas_extra: 2,          // lamas que se suman al cociente
    descuento_eje: 75,       // largo del eje = ancho - 75
    descuento_cajon: 16,     // largo del cajón y del perfil aislante = ancho - 16
    felpudo_por_ancho: 3,    // ml de felpudo = 3 × ancho
    tirantes: 3,             // tirantes por persiana
    tirantes_desde_mm: 1800, // a partir de este ancho, un tirante más cada tirantes_cada_mm
    tirantes_cada_mm: 600,
    eje60_desde_mm: 2500,    // eje de 60 (y adaptador + placa de 72) a partir de este ancho, si eje = automático
    topes: 2,
    merma_pct: 0             // % que se añade al coste de lamas, eje, cajón y perfiles por recortes
  };

  // Correspondencia color de folio del cajón -> color del perfil PRINCIPAL (masa) que La Viuda sirve con él (visto en los albaranes)
  var PRINCIPAL_DE_FOLIO = { 'GRIS 1605': 'RAL 7016', 'GOLDEN 8001': 'RAL 8014', 'BRONZE 3714': 'BRONCE', 'NEGRO ULTIMAT': 'NEGRO' };

  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x; }
  function num(v) { var x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(x) ? 0 : x; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function up(s) { return String(s || '').trim().toUpperCase(); }

  // CSV con cabecera; acepta viuda_precios.csv (precio_ultimo) y viuda_lineas.csv (precio). Devuelve una fila por código (la más reciente si hay varias).
  function parseCSV(texto) {
    var lineas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lineas.length) return [];
    var sep = lineas[0].indexOf(';') >= 0 ? ';' : ',';
    var cab = lineas[0].split(sep).map(function (c) { return c.trim().toLowerCase(); });
    var ix = function (nombre) { return cab.indexOf(nombre); };
    var iCod = ix('codigo'), iDes = ix('descripcion'), iUd = ix('unidad'), iPre = ix('precio_ultimo') >= 0 ? ix('precio_ultimo') : ix('precio'), iFe = ix('fecha_ultimo') >= 0 ? ix('fecha_ultimo') : ix('fecha');
    if (iCod < 0 || iDes < 0 || iPre < 0) return [];
    var porCodigo = {};
    for (var i = 1; i < lineas.length; i++) {
      var c = lineas[i].split(sep);
      var fila = { codigo: (c[iCod] || '').trim(), descripcion: (c[iDes] || '').trim(), unidad: iUd >= 0 ? (c[iUd] || '').trim() : '', precio: n(c[iPre]), fecha: iFe >= 0 ? (c[iFe] || '').trim() : '' };
      if (!fila.codigo || !fila.precio) continue;
      var prev = porCodigo[fila.codigo];
      if (!prev || fechaISO(fila.fecha) >= fechaISO(prev.fecha)) porCodigo[fila.codigo] = fila;
    }
    return Object.keys(porCodigo).map(function (k) { return porCodigo[k]; });
  }
  function fechaISO(f) { var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : (f || ''); }

  function buscar(precios, re) {
    for (var i = 0; i < precios.length; i++) if (re.test(up(precios[i].descripcion))) return precios[i];
    return null;
  }
  function colores(precios, re) {
    var out = [];
    precios.forEach(function (p) { var m = re.exec(up(p.descripcion)); if (m && out.indexOf(m[1].trim()) < 0) out.push(m[1].trim()); });
    return out.sort(function (a, b) { return a === 'BLANCO' ? -1 : b === 'BLANCO' ? 1 : a.localeCompare(b); });
  }
  function opciones(precios) {
    precios = precios || [];
    return {
      colores_lama: colores(precios, /^PERF CS-45-LS D90 (.+)$/),
      colores_terminal: colores(precios, /^TERMINAL ALU EIB-44 V2 (.+)$/),
      colores_cajon: colores(precios, /^TAPA RTX FOLIADA DT (?:155|185) (.+)$/),
      cajones: [155, 185, 200]
    };
  }

  function calcular(p, precios, reglas, ajustes) {
    p = p || {}; precios = precios || []; ajustes = ajustes || {};
    var R = {}; Object.keys(REGLAS).forEach(function (k) { R[k] = reglas && reglas[k] != null && reglas[k] !== '' ? num(reglas[k]) : REGLAS[k]; });
    var A = num(p.ancho_mm), H = num(p.alto_mm), C = num(p.cajon_mm) || 155, uds = Math.max(1, Math.round(num(p.uds) || 1));
    var colorLama = up(p.color_lama) || 'BLANCO', colorTerm = up(p.color_terminal) || colorLama, foliado = p.cajon === 'foliado', colorCajon = up(p.color_cajon);
    var eje = num(p.eje) === 40 || num(p.eje) === 60 ? num(p.eje) : (A >= R.eje60_desde_mm ? 60 : 40);
    var recogedor = p.recogedor !== false;
    var piezas = [], faltan = [];
    var nLamas = A > 0 && H > 0 ? Math.floor((H + C) / R.paso_lama) + R.lamas_extra : 0;
    var largoLama = Math.max(0, A - R.descuento_lama), largoEje = Math.max(0, A - R.descuento_eje), largoCajon = Math.max(0, A - R.descuento_cajon);
    var merma = 1 + R.merma_pct / 100;
    var cm = String(C);

    // pieza(clave, grupo, patrón o lista de patrones (el primero que exista), cantidad por unidad, unidad esperada, fórmula en texto, con merma)
    function pieza(clave, grupo, patrones, cantidad, formula, conMerma) {
      if (!Array.isArray(patrones)) patrones = [patrones];
      var art = null, pat = null;
      for (var i = 0; i < patrones.length && !art; i++) { pat = patrones[i]; art = buscar(precios, pat); }
      var cant = ajustes[clave] != null && ajustes[clave] !== '' ? num(ajustes[clave]) : cantidad;
      var forzada = ajustes[clave] != null && ajustes[clave] !== '';
      var precio = art ? art.precio : 0;
      var fila = { clave: clave, grupo: grupo, codigo: art ? art.codigo : '', descripcion: art ? art.descripcion : ('(sin precio) ' + patrones[0].source.replace(/[\^$\\]/g, '')), unidad: art ? art.unidad : '',
        cantidad: r3(cant), cantidad_total: r3(cant * uds), precio: precio, fecha: art ? art.fecha : '', formula: formula, forzada: forzada, falta: !art,
        importe_ud: r2(cant * precio * (conMerma ? merma : 1)), importe: r2(cant * precio * (conMerma ? merma : 1) * uds), merma: !!conMerma };
      piezas.push(fila);
      if (!art) faltan.push(fila.descripcion);
      return fila;
    }

    if (A > 0 && H > 0) {
      pieza('lama', 'Lamas', [new RegExp('^PERF CS-45-LS D90 ' + esc(colorLama) + '$'), new RegExp('^PERF C-45 D-90 ' + esc(colorLama) + '$')],
        r3(nLamas * largoLama / 1000), nLamas + ' lamas × ' + largoLama + ' mm ((' + H + ' + ' + C + ') / ' + R.paso_lama + ' + ' + R.lamas_extra + '; ancho − ' + R.descuento_lama + ')', true);
      pieza('terminal', 'Lamas', new RegExp('^TERMINAL ALU EIB-44 V2 ' + esc(colorTerm) + '$'), r3(largoLama / 1000), 'ancho − ' + R.descuento_lama + ' mm', true);
      pieza('eje', 'Eje', new RegExp('^METROS EJE OCTOGONAL ' + eje + 'X'), r3(largoEje / 1000), 'ancho − ' + R.descuento_eje + ' mm, eje de ' + eje + (num(p.eje) ? '' : ' (automático)'), true);
      pieza('capsula', 'Eje', /^CAPSULA TELES\. 40 OCT/, 1, '1 por persiana');
      if (eje === 60) pieza('adaptador', 'Eje', /^ADAP\. CAPS\. TELES P\/EJE 60/, 1, 'eje de 60');
      pieza('disco', 'Eje', /^DISCO PVC 120X40/, 1, '1 por persiana');
      pieza('placa_disco', 'Eje', new RegExp('^PLACA CONTENCION ' + cm + ' AGUJERO 120'), 1, 'lado del disco, cajón ' + cm);
      pieza('placa_eje', 'Eje', new RegExp('^PLACA CONTENCION ' + cm + ' AGUJERO ' + (eje === 60 ? 72 : 40)), 1, 'lado de la cápsula, cajón ' + cm + ', eje ' + eje);
      var tir = R.tirantes + (A > R.tirantes_desde_mm && R.tirantes_cada_mm > 0 ? Math.ceil((A - R.tirantes_desde_mm) / R.tirantes_cada_mm) : 0);
      pieza('tirantes', 'Eje', /^TIRANTE AUTO\. MIXTO LAMA ALU/, tir, R.tirantes + ' + 1 cada ' + R.tirantes_cada_mm + ' mm por encima de ' + R.tirantes_desde_mm);
      pieza('topes', 'Lamas', /^TOPE CON ARANDELA 40 MM/, R.topes, R.topes + ' por persiana');
      if (recogedor) {
        pieza('pasacintas', 'Recogedor', [new RegExp('^PASACINTAS INFERIOR C\\/18 MM\\. ' + (/NEGRO/.test(colorCajon) || /NEGRO/.test(colorLama) ? 'NEGRO' : 'BLANCO')), /^PASACINTAS INFERIOR C\/18 MM\./], 1, '1 por persiana');
        pieza('recogedor', 'Recogedor', /^RECOG\. UNIVERSAL/, 1, '1 por persiana');
      }
      pieza('felpudo', 'Cajón', /^FELPUDO 7X6/, r3(R.felpudo_por_ancho * A / 1000), R.felpudo_por_ancho + ' × ancho (terminal + dos lados del cajón)');
      if (!foliado) {
        pieza('cajon', 'Cajón', C === 200 ? /^CAJON RGLX 200 ENR RTX BLANCO/ : new RegExp('^CAJON RTX ' + cm + ' DT ENR BLANCO'), r3(largoCajon / 1000), 'ancho − ' + R.descuento_cajon + ' mm', true);
      } else {
        var principal = PRINCIPAL_DE_FOLIO[colorCajon] || colorCajon;
        pieza('principal', 'Cajón', new RegExp('^PRINCIPAL RGBK ' + cm + ' DT ' + esc(principal) + '$'), r3(largoCajon / 1000), 'ancho − ' + R.descuento_cajon + ' mm', true);
        pieza('tapa', 'Cajón', new RegExp('^TAPA RTX FOLIADA DT ' + cm + ' ' + esc(colorCajon) + '$'), r3(largoCajon / 1000), 'ancho − ' + R.descuento_cajon + ' mm', true);
        pieza('enrasado', 'Cajón', new RegExp('^ENRASADO FOL\\. RGBK DT' + cm + ' ' + esc(colorCajon) + '$'), r3(largoCajon / 1000), 'ancho − ' + R.descuento_cajon + ' mm', true);
        pieza('inferior', 'Cajón', new RegExp('^(INFERIOR|INF) FOL\\. RGBK DT ?' + cm + ' ' + esc(colorCajon) + '$'), r3(largoCajon / 1000), 'ancho − ' + R.descuento_cajon + ' mm', true);
      }
      var colorTest = foliado ? (principal === 'RAL 7016' ? 'RAL 7016' : 'BLANCO') : 'BLANCO';
      pieza('testeros', 'Cajón', [new RegExp('^TEST DEC TEL-1P-TD-' + cm + ' ' + esc(colorTest) + ' RTX'), new RegExp('^TEST DEC TEL-1P-TD-' + cm + ' '), new RegExp('^TEST DEC TEL-0P-' + cm + '-RTX')], 1, '1 juego');
      pieza('aislante_testero', 'Cajón', new RegExp('^JGO\\. AISLANTE TESTERO ABS ' + cm + ' RTX'), 1, '1 juego');
      pieza('perfil_aislante', 'Cajón', new RegExp('^PERF AISL TD' + cm + ' RGBK PS30'), r3(largoCajon / 1000), 'ancho − ' + R.descuento_cajon + ' mm', true);
    }
    var costeUd = r2(piezas.reduce(function (s, x) { return s + x.importe_ud; }, 0));
    return { piezas: piezas, coste_ud: costeUd, coste: r2(costeUd * uds), uds: uds, faltan: faltan, eje: eje,
      lamas: { n: nLamas, largo_mm: largoLama, ml: r3(nLamas * largoLama / 1000) }, reglas: R };
  }

  return { REGLAS: REGLAS, PRINCIPAL_DE_FOLIO: PRINCIPAL_DE_FOLIO, parseCSV: parseCSV, opciones: opciones, calcular: calcular };
}));
