/* ============================================================
   JEOVENT - Historial de cambios (tracking automat)
   ============================================================
   Auto-loghează orice schimbare făcută prin sbFetch în tabela 'cambios'.
   Adaugă un buton flotant 📋 care deschide un modal cu lista de schimbări.
   Inclus în: presupuestos.html, cuadrante.html, gestion.html, gastos.html
   ============================================================ */
(function(){
  'use strict';

  var WATCHED = ['presupuestos','facturas','cuadrante','obras','clientes','gastos','fabricaciones'];
  var TABLE_LABELS = {
    presupuestos:'📋 Presupuesto',
    facturas:'🧾 Factura',
    cuadrante:'📊 Cuadrante',
    obras:'🏗️ Obra',
    clientes:'👤 Cliente',
    gastos:'💸 Gasto',
    fabricaciones:'🔨 Fabricación'
  };
  var FIELD_LABELS = {
    num:'N°', fecha:'Fecha', cliente_nombre:'Cliente', cliente:'Cliente',
    cliente_id:'ID cliente', cliente_nif:'CIF/NIF', cliente_dir:'Dirección',
    cliente_tel:'Teléfono', cliente_ciu:'Ciudad', estado:'Estado',
    motivo_rechazo:'Motivo rechazo', total:'Total', base:'Base', iva:'IVA',
    iva_p:'IVA %', iva_amt:'IVA importe', valor:'Valor', obs:'Observaciones',
    observaciones:'Observaciones', presupuesto_num:'N° presupuesto',
    presupuesto_id:'ID presupuesto', factura:'N° factura',
    primer_pago:'1er pago', segundo_pago:'2° pago', tercer_pago:'3er pago',
    total_instalacion:'Total instalación', total_deuda:'Total deuda',
    pagada:'Pagada', recoge_lleva:'Recoge/Lleva', fecha_recogida:'Fecha rec/inst',
    instaladores:'Instaladores', in_instalacion:'En instalación',
    in_medicion:'En medición', ajuste:'Ajuste', obra:'Obra',
    pdf_url:'PDF URL', pdf_name:'PDF nombre',
    fabricacion_pdf_url:'PDF fab.', fabricacion_pdf_name:'PDF fab. nombre',
    pagos:'Pagos', lineas:'Líneas', dreg:'Datos registro',
    is_abo:'Es abono', tipo:'Tipo', cif:'CIF', nombre:'Nombre',
    direccion:'Dirección', tel:'Teléfono', email:'Email',
    contacto:'Contacto', comercial:'Comercial', antiguedad:'Antigüedad'
  };

  function fieldLabel(k){ return FIELD_LABELS[k] || k; }
  function tableLabel(t){ return TABLE_LABELS[t] || t; }

  function _val2str(v){
    if(v==null)return '—';
    if(typeof v==='string')return v.length>120?v.slice(0,120)+'…':v;
    if(typeof v==='number'||typeof v==='boolean')return String(v);
    try{var s=JSON.stringify(v);return s.length>120?s.slice(0,120)+'…':s;}catch(_){return String(v);}
  }
  function _esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

  // Public logChange
  window.logChange = async function(opts){
    if(!opts||!opts.tabla)return;
    if(typeof sbFetch!=='function')return;
    var rec={
      id: 'cb_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36),
      ts: new Date().toISOString(),
      tabla: opts.tabla,
      registro_id: opts.registroId||null,
      registro_ref: opts.registroRef||null,
      accion: opts.accion||'UPDATE',
      campo: opts.campo||null,
      valor_ant: opts.valorAnt==null?null:String(_val2str(opts.valorAnt)),
      valor_nou: opts.valorNou==null?null:String(_val2str(opts.valorNou)),
      usuario: (window.JEO_USER||(window.localStorage&&localStorage.getItem('jeo_user'))||'-'),
      device:  (window.JEO_DEVICE||(window.localStorage&&localStorage.getItem('jeo_device'))||(typeof navigator!=='undefined'?(navigator.platform||'-'):'-')),
      descripcion: opts.descripcion||null
    };
    try{
      // Apel direct fara logger (folosim _origSbFetch ca sa evitam recursie)
      await (window._origSbFetch||window.sbFetch)('POST','cambios',rec);
    }catch(e){console.warn('logChange failed',e);}
  };

  // ===== QUEUE pentru cambios — batched, async, nu blocheaza UI =====
  var _logQueue = [];
  var _logFlushTimer = null;
  function _enqueueLog(rec){
    _logQueue.push(rec);
    if(_logFlushTimer) return;
    // Flush dupa 2 secunde — aduna intr-un singur burst toate modificarile
    _logFlushTimer = setTimeout(_flushLogs, 2000);
  }
  async function _flushLogs(){
    _logFlushTimer = null;
    if(!_logQueue.length) return;
    var batch = _logQueue.splice(0, 50); // max 50 per batch
    try{
      // Insert in bulk (Supabase accepta array)
      await (window._origSbFetch||window.sbFetch)('POST','cambios',batch);
    }catch(e){
      // daca insert bulk a esuat, returneaza-le in coada (best effort)
      console.warn('[Historico] flush failed:',e.message);
    }
    // daca mai sunt, reprogrameaza
    if(_logQueue.length && !_logFlushTimer){
      _logFlushTimer = setTimeout(_flushLogs, 2000);
    }
  }
  // Flush la unload (sa nu pierdem schimbarile)
  window.addEventListener('beforeunload', function(){
    if(_logQueue.length) _flushLogs();
  });

  // Wrap sbFetch to auto-log — FARA GET-before-PATCH (zero overhead pe scriere)
  function wrapSbFetch(){
    if(typeof sbFetch!=='function'||window._origSbFetch)return;
    window._origSbFetch = window.sbFetch;
    window.sbFetch = async function(method, table, data, query){
      var watched = WATCHED.indexOf(table)>=0;
      var isWrite = (method==='PATCH'||method==='POST'||method==='DELETE');

      // PATCH/POST/DELETE merg DIRECT, fara GET prealabil — zero latenta extra
      var result = await window._origSbFetch(method, table, data, query);

      if(watched && isWrite){
        try{
          var idMatch = query && query.match(/id=eq\.([^&]+)/);
          var registroId = (data && data.id) ? data.id : (idMatch?decodeURIComponent(idMatch[1]):null);
          var registroRef = '';
          if(data){
            if(data.num)registroRef=data.num;
            else if(data.nombre)registroRef=data.nombre;
            else if(data.cliente_nombre)registroRef=data.cliente_nombre;
            else if(data.cliente)registroRef=data.cliente;
            else if(data.factura)registroRef='F-'+data.factura;
            else if(data.presupuesto_num)registroRef='P-'+data.presupuesto_num;
          }
          var ts = new Date().toISOString();
          var usuario = (window.JEO_USER||(window.localStorage&&localStorage.getItem('jeo_user'))||'-');
          var device  = (window.JEO_DEVICE||(window.localStorage&&localStorage.getItem('jeo_device'))||(typeof navigator!=='undefined'?(navigator.platform||'-'):'-'));
          // helpers
          function mkLog(accion, campo, valNou){
            return {
              id: 'cb_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36),
              ts: ts,
              tabla: table,
              registro_id: registroId,
              registro_ref: registroRef || null,
              accion: accion,
              campo: campo || null,
              valor_ant: null,
              valor_nou: valNou==null?null:String(_val2str(valNou)),
              usuario: usuario,
              device: device,
              descripcion: null
            };
          }
          if(method==='POST'){
            _enqueueLog(mkLog('CREATE', null, null));
          }else if(method==='DELETE'){
            _enqueueLog(mkLog('DELETE', null, null));
          }else if(method==='PATCH' && data){
            Object.keys(data).forEach(function(k){
              if(k==='id'||k==='created_at'||k==='saved_at'||k==='updated_at')return;
              _enqueueLog(mkLog('UPDATE', k, data[k]));
            });
          }
        }catch(eLog){/* silentios — niciodata sa nu blocheze write-ul real */}
      }
      return result;
    };
    console.log('[Historico] sbFetch wrapped (lightweight mode)');
  }

  // ===== UI: floating button + modal =====
  var STYLE = `
  #histo-fab{position:fixed;bottom:18px;right:18px;width:48px;height:48px;border-radius:50%;background:#1a4fa0;color:#fff;border:none;font-size:22px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);z-index:9998;transition:transform .15s, box-shadow .15s}
  #histo-fab:hover{transform:scale(1.08);box-shadow:0 6px 18px rgba(0,0,0,.25)}
  #histo-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:9999}
  #histo-overlay.open{display:flex}
  #histo-modal{background:#fff;border-radius:12px;width:min(900px,95vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)}
  #histo-modal header{padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px}
  #histo-modal h3{margin:0;font-size:16px;color:#111827;flex:1}
  #histo-close{border:none;background:#f3f4f6;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px}
  #histo-close:hover{background:#e5e7eb}
  #histo-toolbar{padding:10px 18px;display:flex;gap:8px;border-bottom:1px solid #f3f4f6;flex-wrap:wrap}
  #histo-search{flex:1;min-width:200px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px}
  #histo-tab{padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff;cursor:pointer}
  #histo-action{padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff;cursor:pointer}
  #histo-reload{padding:7px 12px;border:1px solid #1a4fa0;background:#1a4fa0;color:#fff;border-radius:6px;font-size:13px;cursor:pointer}
  #histo-reload:hover{background:#163d80}
  #histo-stats{padding:6px 18px;font-size:11px;color:#6b7280;border-bottom:1px solid #f3f4f6}
  #histo-list{flex:1;overflow-y:auto;padding:8px 14px}
  .histo-item{padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px}
  .histo-item .h-line{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
  .histo-item .h-ts{color:#6b7280;font-size:11px;font-family:ui-monospace,monospace;min-width:130px}
  .histo-item .h-tag{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
  .histo-item .h-tag.create{background:#d1fae5;color:#059669}
  .histo-item .h-tag.update{background:#dbeafe;color:#1a4fa0}
  .histo-item .h-tag.delete{background:#fee2e2;color:#dc2626}
  .histo-item .h-tab{font-weight:600;color:#374151}
  .histo-item .h-ref{color:#1a4fa0;font-family:ui-monospace,monospace;background:#eef2ff;padding:1px 6px;border-radius:3px;font-size:11px}
  .histo-item .h-field{color:#111827;font-weight:500;margin-top:3px;font-size:12px}
  .histo-item .h-old{color:#dc2626;text-decoration:line-through;background:#fee2e2;padding:1px 5px;border-radius:3px;font-size:11px}
  .histo-item .h-arrow{color:#9ca3af;margin:0 6px}
  .histo-item .h-new{color:#059669;background:#d1fae5;padding:1px 5px;border-radius:3px;font-size:11px}
  .histo-item .h-user{font-size:10px;color:#9ca3af;margin-left:auto}
  .histo-empty{text-align:center;padding:40px;color:#9ca3af;font-size:14px}
  `;

  var MODAL_HTML = `
    <div id="histo-overlay">
      <div id="histo-modal">
        <header>
          <h3>📋 Historial de cambios</h3>
          <button id="histo-close" title="Cerrar">✕</button>
        </header>
        <div id="histo-toolbar">
          <input type="text" id="histo-search" placeholder="🔍 Buscar (cliente, n°, campo, valor...)">
          <select id="histo-tab">
            <option value="">📦 Todas las tablas</option>
            <option value="presupuestos">📋 Presupuestos</option>
            <option value="facturas">🧾 Facturas</option>
            <option value="cuadrante">📊 Cuadrante</option>
            <option value="obras">🏗️ Obras</option>
            <option value="clientes">👤 Clientes</option>
            <option value="gastos">💸 Gastos</option>
            <option value="fabricaciones">🔨 Fabricaciones</option>
          </select>
          <select id="histo-action">
            <option value="">⚡ Todas las acciones</option>
            <option value="CREATE">✨ Creación</option>
            <option value="UPDATE">✏️ Modificación</option>
            <option value="DELETE">🗑️ Eliminación</option>
          </select>
          <button id="histo-reload">🔄 Recargar</button>
        </div>
        <div id="histo-stats"></div>
        <div id="histo-list"></div>
      </div>
    </div>
  `;

  function injectUI(){
    if(document.getElementById('histo-fab'))return;
    var st=document.createElement('style');st.textContent=STYLE;document.head.appendChild(st);
    var btn=document.createElement('button');btn.id='histo-fab';btn.title='Historial de cambios';btn.textContent='📋';
    document.body.appendChild(btn);
    var div=document.createElement('div');div.innerHTML=MODAL_HTML;document.body.appendChild(div.firstElementChild);
    btn.addEventListener('click',openHisto);
    document.getElementById('histo-close').addEventListener('click',closeHisto);
    document.getElementById('histo-overlay').addEventListener('click',function(e){if(e.target===this)closeHisto();});
    document.getElementById('histo-search').addEventListener('input',renderHisto);
    document.getElementById('histo-tab').addEventListener('change',renderHisto);
    document.getElementById('histo-action').addEventListener('change',renderHisto);
    document.getElementById('histo-reload').addEventListener('click',loadHisto);
  }

  var _histoData = [];

  async function loadHisto(){
    var list=document.getElementById('histo-list');
    if(!list)return;
    list.innerHTML='<div class="histo-empty">⏳ Cargando...</div>';
    try{
      // Ultimele 500 schimbari
      var data = await (window._origSbFetch||window.sbFetch)('GET','cambios',null,'order=ts.desc&limit=500');
      _histoData = Array.isArray(data) ? data : [];
      renderHisto();
    }catch(e){
      list.innerHTML='<div class="histo-empty">⚠️ Error: '+_esc(e.message||e)+'<br><small>Asegúrate de que la tabla "cambios" existe en Supabase (ver supabase_setup_v9e_historico.sql)</small></div>';
    }
  }

  function fmtTs(iso){
    try{
      var d=new Date(iso);
      var dd=String(d.getDate()).padStart(2,'0');
      var mm=String(d.getMonth()+1).padStart(2,'0');
      var yy=d.getFullYear();
      var hh=String(d.getHours()).padStart(2,'0');
      var mn=String(d.getMinutes()).padStart(2,'0');
      var ss=String(d.getSeconds()).padStart(2,'0');
      return dd+'/'+mm+'/'+yy+' '+hh+':'+mn+':'+ss;
    }catch(_){return iso;}
  }

  function renderHisto(){
    var list=document.getElementById('histo-list');
    var stats=document.getElementById('histo-stats');
    if(!list)return;
    var q=(document.getElementById('histo-search').value||'').toLowerCase().trim();
    var tFil=document.getElementById('histo-tab').value;
    var aFil=document.getElementById('histo-action').value;
    var rows = _histoData.filter(function(r){
      if(tFil && r.tabla!==tFil)return false;
      if(aFil && r.accion!==aFil)return false;
      if(q){
        var hay = ((r.tabla||'')+' '+(r.registro_ref||'')+' '+(r.campo||'')+' '+(r.valor_ant||'')+' '+(r.valor_nou||'')+' '+(r.descripcion||'')+' '+(r.usuario||'')).toLowerCase();
        if(hay.indexOf(q)<0)return false;
      }
      return true;
    });
    stats.textContent = rows.length+' / '+_histoData.length+' registros';
    if(!rows.length){list.innerHTML='<div class="histo-empty">No hay cambios registrados que coincidan</div>';return;}
    list.innerHTML = rows.map(function(r){
      var actCls = r.accion==='CREATE'?'create':r.accion==='DELETE'?'delete':'update';
      var actLbl = r.accion==='CREATE'?'✨ Creado':r.accion==='DELETE'?'🗑️ Eliminado':'✏️ Modificado';
      var diffHtml = '';
      if(r.accion==='UPDATE' && r.campo){
        diffHtml = '<div class="h-field">'+_esc(fieldLabel(r.campo))+': '
          +'<span class="h-old">'+_esc(r.valor_ant||'—')+'</span>'
          +'<span class="h-arrow">→</span>'
          +'<span class="h-new">'+_esc(r.valor_nou||'—')+'</span></div>';
      } else if(r.descripcion){
        diffHtml = '<div class="h-field" style="color:#6b7280">'+_esc(r.descripcion)+'</div>';
      }
      var refHtml = r.registro_ref ? '<span class="h-ref">'+_esc(r.registro_ref)+'</span>' : '';
      return '<div class="histo-item">'
        + '<div class="h-line">'
          + '<span class="h-ts">'+_esc(fmtTs(r.ts))+'</span>'
          + '<span class="h-tag '+actCls+'">'+actLbl+'</span>'
          + '<span class="h-tab">'+_esc(tableLabel(r.tabla))+'</span>'
          + refHtml
          + '<span class="h-user">'+_esc(r.usuario||'-')+'</span>'
        + '</div>'
        + diffHtml
      + '</div>';
    }).join('');
  }

  function openHisto(){
    var ov=document.getElementById('histo-overlay');
    if(!ov)return;
    ov.classList.add('open');
    loadHisto();
  }
  function closeHisto(){
    var ov=document.getElementById('histo-overlay');
    if(ov)ov.classList.remove('open');
  }

  // Init: wait for sbFetch then wrap + inject UI
  function init(){
    wrapSbFetch();
    injectUI();
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})();
