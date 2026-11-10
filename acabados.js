// =====================================================================
// Vidrio y color: de lo que pone la ficha (texto libre) al nombre exacto de PrefGest.
// Módulo compartido: lo usan la pantalla Presupuestos de Jeovent Taller (renderer),
// el worker del móvil (movil.js, Node) y la página del móvil (pwa/presupuesto-movil.html).
// El catálogo viene de db.catalogoAcabados(): { vidrios:[{ref, descripcion, grupo}], colores:[{nombre, n}] }
// =====================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Acabados = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // "4+4-18-4 Guardian Sun" -> "4+4-18-4gs"; "6/20/4 bajo emisivo" -> "6-20-4be"
  function normVidrio(t) {
    return sinAcentos(t).replace(/[\/x×]/g, '-').replace(/\s+/g, '')
      .replace(/guardiansun|guardian/g, 'gs').replace(/climaguard(premium)?/g, 'c').replace(/clarglas/g, 'cg')
      .replace(/acustico/g, 'ac').replace(/argon/g, 'a').replace(/mate/g, 'm').replace(/bajoemisivo/g, 'be').replace(/[^0-9a-z+\-.]/g, '');
  }

  // Referencia PrefGest para el texto de la ficha, o null
  function matchVidrio(cat, texto) {
    const t = normVidrio(texto);
    if (!t || !cat || !cat.vidrios) return null;
    const lista = cat.vidrios;
    const exacto = lista.find(v => normVidrio(v.ref) === t) || lista.find(v => normVidrio(v.descripcion) === t);
    if (exacto) return exacto.ref;
    // sólo la composición ("4+4-18-4"): se prefiere la versión Guardian Sun, la habitual en Jeovent
    const cand = lista.filter(v => normVidrio(v.ref).startsWith(t));
    if (cand.length === 1) return cand[0].ref;
    const gs = cand.find(v => normVidrio(v.ref) === t + 'gs');
    if (gs) return gs.ref;
    // misma composición y mismas letras en otro orden: "4/16/4 argon guardian sun" -> 4-16A-4GS, "climaguard 4+4-18-4" -> 4+4-18-4C
    const firma = (x) => { const comp = x.replace(/[a-z]/g, ''); const letras = []; let rest = x.replace(/[^a-z]/g, ''); while (rest) { const tok = ['ac', 'cg', 'gs', 'be', 'a', 'c', 'm'].find(k => rest.startsWith(k)); if (!tok) return null; letras.push(tok); rest = rest.slice(tok.length); } return comp + '|' + letras.sort().join(','); };
    const ft = firma(t);
    const mismo = ft && lista.find(v => firma(normVidrio(v.ref)) === ft);
    if (mismo) return mismo.ref;
    // letras que no son ninguna capa conocida ("6-20-4BS", "4+4-18-4 BE"): misma composición, versión Guardian Sun
    const comp = t.replace(/[a-z]/g, '');
    const gs2 = comp && comp !== t ? lista.find(v => normVidrio(v.ref) === comp + 'gs') : null;
    return gs2 ? gs2.ref : null;
  }

  // Nombre de color PrefGest (ContenidoPAF.Color) para el texto de la ficha, o null
  function matchColor(cat, texto) {
    const t = sinAcentos(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || !cat || !cat.colores) return null;
    const lista = cat.colores;   // ordenada por uso
    const norm = (c) => sinAcentos(c.nombre);
    if (/^(blanco|blanca|bl|b|white|654|654 v blanco)$/.test(t)) { const b = lista.find(c => /^654 - v\. blanco$/i.test(c.nombre)) || lista.find(c => /blanco/.test(norm(c)) && !/ext|int|crema|wx/.test(norm(c))); return b ? b.nombre : null; }
    const palabras = t.split(' ').filter(p => p && !['color', 'colour', 'folio', 'exterior', 'ext', 'interior', 'int', 'ral', 'liso', 'mate', 'de', 'y'].includes(p));
    if (!palabras.length) return null;
    const cand = lista.filter(c => palabras.every(p => norm(c).includes(p)));
    if (!cand.length) return null;
    const quiere2caras = /2 caras|dos caras|ambas|por dentro y por fuera/.test(t);
    const quiereExt = /\bext/.test(t) || /bicolor/.test(t);
    const pref = quiere2caras ? cand.filter(c => /2 caras/.test(norm(c))) : quiereExt ? cand.filter(c => /ext/.test(norm(c))) : cand.filter(c => /ext/.test(norm(c)) || !/int/.test(norm(c)));
    return (pref[0] || cand[0]).nombre;
  }

  // Versión MATE de un vidrio del catálogo (la primera luna pasa a mate): 6-20-4GS -> 6M-20-4GS, 4+4-18-4GS -> 4+4M-18-4GS
  function vidrioMate(cat, ref) {
    if (!ref || !cat || !cat.vidrios) return null;
    const n = normVidrio(ref);
    const objetivo = n.replace(/^([0-9+]+)/, '$1m');
    const directo = cat.vidrios.find(v => normVidrio(v.ref) === objetivo);
    if (directo) return directo.ref;
    const firma = (x) => x.replace(/[a-z]/g, '') + '|' + x.replace(/[^a-z]/g, '').split('').sort().join('');
    const f = firma(objetivo);
    const otro = cat.vidrios.find(v => firma(normVidrio(v.ref)) === f && /mate/i.test(v.descripcion || ''));
    return otro ? otro.ref : null;
  }

  // Vidrio de una ventana concreta: '' = el general, 'mate' = versión mate del general, o referencia PrefGest
  function vidrioVentana(cat, v, vidrioGeneral) {
    const x = String(v.vidrio || '').trim();
    if (!x) return '';
    if (x === 'mate') return vidrioMate(cat, vidrioGeneral) || '';
    return x;
  }

  return { sinAcentos, normVidrio, matchVidrio, matchColor, vidrioMate, vidrioVentana };
});
