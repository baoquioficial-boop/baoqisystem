/* =============================================
   BaoQi v3 — app.js
   Filtrado por rol: doctor ve solo lo suyo,
   admin ve todo. Sin UI de roles visible.
   ============================================= */

let PACS = [], CITAS = [], COBROS = [], NOTAS = [];
let citaActual = null;

/* ============ UTILIDADES ============ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
// Convierte Date a 'YYYY-MM-DD' usando zona horaria LOCAL (no UTC)
// Esto evita el bug de que toISOString() retroceda/adelante un día en TZ negativas
function toLocalISO(d){const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function hoy() { return toLocalISO(new Date()); }
function fmtF(iso) { if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function fmtM(n) { return '$'+Number(n).toLocaleString('es-MX'); }
function ini2(n) { const p=n.trim().split(' '); return (p[0]?.[0]||'')+(p[1]?.[0]||p[0]?.[1]||''); }
function toast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

/* ============ FILTROS POR ROL ============ */
function esAdmin() { return doctorActual?.rol === 'admin'; }

// Query filter para citas y cobros según rol
function qDoctor() {
  if (esAdmin()) return '';
  return `&doctor_id=eq.${doctorActual.id}`;
}
// Query filter para pacientes según rol
function qPacientes() {
  if (esAdmin()) return '';
  return `&doctor_id=eq.${doctorActual.id}`;
}

/* ============ CARGA CON FILTRO ============ */
async function cargarTodo() {
  try {
    [PACS, CITAS, COBROS, NOTAS] = await Promise.all([
      sb('pacientes','GET',null,`?order=created_at.desc${qPacientes()}`),
      sb('citas','GET',null,`?order=fecha.asc,hora.asc${qDoctor()}`),
      sb('cobros','GET',null,`?order=created_at.desc${qDoctor()}`),
      sb('notas_soap','GET',null,`?order=created_at.desc${qDoctor()}`),
    ]);
    // Admin: mostrar filtro por doctor en reportes
    const filtroDocEl = document.getElementById('rep-doctor-fil');
    if (filtroDocEl) {
      filtroDocEl.style.display = esAdmin() ? 'block' : 'none';
      filtroDocEl.innerHTML = '<option value="">Todos los doctores</option>' +
        DOCS.map(d=>`<option value="${d.id}">${d.nombre}</option>`).join('');
      filtroDocEl.addEventListener('change', renderReporte);
    }
    // Columna doctor en reportes: visible solo para admin
    const thDoc = document.getElementById('th-doctor-rep');
    if (thDoc) thDoc.style.display = esAdmin() ? '' : 'none';

    actualizarBadges();
    renderAgenda();
  } catch(e) { toast('⚠ Error al cargar datos'); }
}

function actualizarBadges() {
  const h = hoy();
  document.getElementById('nb-pac').textContent = PACS.length;
  document.getElementById('nb-agenda').textContent = CITAS.filter(c=>c.fecha===h).length;
  document.getElementById('nb-caja').textContent = CITAS.filter(c=>c.fecha===h&&c.estado==='Pendiente').length;
}

/* ============ NAVEGACIÓN ============ */
function gp(page,el) {
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));
  document.getElementById('pg-'+page).classList.add('on');
  el.classList.add('on');
  const t={agenda:'Agenda',pac:'Pacientes',caja:'Caja',rep:'Reportes',exp:'Expedientes',admin:'Administración'};
  document.getElementById('ptit').textContent=t[page];
  if(page==='agenda') renderAgenda();
  if(page==='pac') renderPacs(PACS);
  if(page==='caja') renderCaja();
  if(page==='rep') renderReporte();
  if(page==='exp') renderExp();
  if(page==='admin') renderAdmin();
}

function om(id) {
  document.getElementById('m-'+id).classList.add('op');
  if(id==='cobrar') poblarSelectCobro();
  if(id==='ncita') { document.getElementById('nc-fecha').value=agendaFecha||hoy(); poblarSelectDoctor(); }
}
function cm(id) { document.getElementById('m-'+id).classList.remove('op'); }
function sm(el) { el.closest('.met-g').querySelectorAll('.met').forEach(b=>b.classList.remove('on')); el.classList.add('on'); }
function st(btn,panel) {
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on');
  btn.closest('.mb').querySelectorAll('.tp').forEach(p=>p.classList.remove('on'));
  document.getElementById('t-'+panel).classList.add('on');
}
document.querySelectorAll('.mw').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('op');}));

function poblarSelectDoctor() {
  const sel=document.getElementById('nc-doctor');
  if(!sel) return;
  // Admin puede asignar a cualquier doctor, doctor solo se asigna a sí mismo
  if(esAdmin()) {
    sel.innerHTML=DOCS.map(d=>`<option value="${d.id}">${d.nombre}</option>`).join('');
    sel.disabled=false;
  } else {
    sel.innerHTML=`<option value="${doctorActual.id}">${doctorActual.nombre}</option>`;
    sel.disabled=true;
  }
}

function poblarSelectCobro() {
  const citasH=CITAS.filter(c=>c.fecha===hoy()&&(c.estado==='Atendida'||c.estado==='Llegó'));
  const opts=citasH.length
    ? citasH.map(c=>{const p=PACS.find(p=>p.id===c.pac_id)||{nombre:c.pac_nombre||'Paciente'};return `<option value="${p.id}">${p.nombre}</option>`;}).join('')
    : PACS.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
  const sel=document.getElementById('cob-pac');
  if(sel) sel.innerHTML=opts||'<option value="">Sin pacientes</option>';
}

function actualizarMonto() {
  const v=document.getElementById('cob-serv').value;
  document.getElementById('cob-monto').value=fmtM(v);
  document.getElementById('cob-total').textContent=fmtM(v);
}

/* ============ NUEVA CITA SIMPLE ============ */
async function guardarCitaSimple() {
  const nombre=document.getElementById('nc-nombre').value.trim();
  const tel=document.getElementById('nc-tel').value.trim();
  const fecha=document.getElementById('nc-fecha').value;
  if(!nombre||!fecha){toast('⚠ Nombre y fecha son obligatorios');return;}

  const doctorId=document.getElementById('nc-doctor')?.value||doctorActual.id;
  const doctorNombre=DOCS.find(d=>d.id===doctorId)?.nombre||doctorActual.nombre;

  // Crear paciente básico si no existe
  let pac=PACS.find(p=>p.nombre.toLowerCase()===nombre.toLowerCase()&&p.tel===tel);
  if(!pac) {
    pac={id:uid(),nombre,tel,motivo:document.getElementById('nc-motivo').value,
      doctor_id:doctorId,fecha_reg:hoy()};
    try { await sb('pacientes','POST',pac); PACS.unshift(pac); }
    catch(e){toast('⚠ Error creando paciente: '+e.message);return;}
  }

  const cita={id:uid(),pac_id:pac.id,pac_nombre:pac.nombre,
    tipo:document.getElementById('nc-tipo').value,
    fecha,hora:document.getElementById('nc-hora').value,
    motivo:document.getElementById('nc-motivo').value,
    notas:document.getElementById('nc-notas').value,
    estado:'Pendiente',fecha_reg:hoy(),
    doctor_id:doctorId,doctor_nombre:doctorNombre};
  try {
    await sb('citas','POST',cita);
    CITAS.push(cita);cm('ncita');renderAgenda();actualizarBadges();
    toast('✓ Cita agendada');
    ['nc-nombre','nc-tel','nc-motivo','nc-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  } catch(e){toast('⚠ Error: '+e.message);}
}

/* ============ LLEGÓ ============ */
function registrarLlegada(citaId) {
  citaActual=CITAS.find(c=>c.id===citaId);
  if(!citaActual) return;
  const pac=PACS.find(p=>p.id===citaActual.pac_id)||{nombre:citaActual.pac_nombre||'Paciente'};
  document.getElementById('llego-av').textContent=ini2(pac.nombre);
  document.getElementById('llego-nombre').textContent=pac.nombre;
  document.getElementById('llego-meta').textContent=`${citaActual.tipo} · ${citaActual.hora} · ${citaActual.doctor_nombre||''}`;
  document.getElementById('btn-hc-ahora').onclick=async()=>{
    await marcarLlegada(citaId); cm('llego'); abrirHC(citaActual,pac);
  };
  document.getElementById('btn-solo-llego').onclick=async()=>{
    await marcarLlegada(citaId); cm('llego'); toast('✓ Llegada registrada');
  };
  om('llego');
}

async function marcarLlegada(citaId) {
  try {
    await sb('citas','PATCH',{estado:'Llegó'},`?id=eq.${citaId}`);
    const c=CITAS.find(c=>c.id===citaId); if(c) c.estado='Llegó';
    renderAgenda(); actualizarBadges();
  } catch(e){toast('⚠ Error: '+e.message);}
}

async function marcarAtendida(citaId) {
  try {
    await sb('citas','PATCH',{estado:'Atendida'},`?id=eq.${citaId}`);
    const c=CITAS.find(c=>c.id===citaId); if(c) c.estado='Atendida';
    renderAgenda(); actualizarBadges();
  } catch(e){}
}

/* ============ HISTORIA CLÍNICA ============ */
function abrirHC(cita,pac) {
  citaActual=cita;
  document.getElementById('hc-pac-nombre').textContent=pac.nombre;
  document.getElementById('hc-nombre').value=pac.nombre||'';
  document.getElementById('hc-tel').value=pac.tel||'';
  document.getElementById('hc-motivo').value=cita.motivo||'';
  document.getElementById('hc-cfecha').value=hoy();
  document.getElementById('hc-crespons').value=doctorActual.nombre||'';
  document.getElementById('hc-cnombre').value=pac.nombre||'';
  om('hc');
}

async function guardarHC() {
  const nombre=document.getElementById('hc-nombre').value.trim();
  if(!nombre){toast('⚠ El nombre es obligatorio');return;}
  if(!citaActual){toast('⚠ No hay cita activa');return;}

  const pac={
    id:citaActual.pac_id,nombre,
    tel:document.getElementById('hc-tel').value,
    email:document.getElementById('hc-email').value,
    fnac:document.getElementById('hc-fnac').value,
    sexo:document.getElementById('hc-sexo').value,
    ecivil:document.getElementById('hc-ecivil').value,
    ocup:document.getElementById('hc-ocup').value,
    dom:document.getElementById('hc-dom').value,
    resp:document.getElementById('hc-resp').value,
    telemer:document.getElementById('hc-telemer').value,
    motivo:document.getElementById('hc-motivo').value,
    padec:document.getElementById('hc-padec').value,
    padre:document.getElementById('hc-padre').value,
    madre:document.getElementById('hc-madre').value,
    alergias:document.getElementById('hc-alerg').value,
    meds:document.getElementById('hc-meds').value,
    ta:document.getElementById('hc-ta').value,
    peso:document.getElementById('hc-peso').value,
    talla:document.getElementById('hc-talla').value,
    lcolor:document.getElementById('hc-lcolor').value,
    dxbio:document.getElementById('hc-dxbio').value,
    dxmtch:document.getElementById('hc-dxmtch').value,
    puntos:document.getElementById('hc-puntos').value,
    doctor_id:doctorActual.id,
    fecha_reg:hoy()
  };

  const nota={
    id:uid(),pac_id:citaActual.pac_id,
    fecha:hoy(),num:1,
    s:document.getElementById('hc-s').value,
    o:document.getElementById('hc-o').value,
    a:document.getElementById('hc-a').value,
    p:document.getElementById('hc-p').value,
    puntos_sesion:document.getElementById('hc-puntos').value,
    retencion:document.getElementById('hc-ret').value,
    doctor_id:doctorActual.id,
    doctor_nombre:doctorActual.nombre
  };

  try {
    await sb('pacientes','PATCH',pac,`?id=eq.${pac.id}`);
    await sb('notas_soap','POST',nota);
    await marcarAtendida(citaActual.id);
    const idx=PACS.findIndex(p=>p.id===pac.id);
    if(idx>=0) PACS[idx]={...PACS[idx],...pac};
    NOTAS.unshift(nota);
    cm('hc');
    toast('✓ Historia clínica guardada');
    renderAgenda(); renderExp();
  } catch(e){toast('⚠ Error: '+e.message);}
}

/* ============ COBROS ============ */
async function confirmarCobro() {
  const pacId=document.getElementById('cob-pac').value;
  if(!pacId){toast('⚠ Selecciona un paciente');return;}
  const metEl=document.querySelector('.met.on');
  const met=metEl?metEl.dataset.met:'Efectivo';
  const monto=parseInt(document.getElementById('cob-serv').value)||0;
  const serv=document.getElementById('cob-serv').options[document.getElementById('cob-serv').selectedIndex].text.split(' — ')[0];
  const pac=PACS.find(p=>p.id===pacId)||{nombre:'Paciente'};
  const folio='BQ-'+new Date().getFullYear()+'-'+String(COBROS.length+1).padStart(4,'0');
  const cobro={id:uid(),pac_id:pacId,pac_nombre:pac.nombre,serv,monto,met,
    fecha:hoy(),hora:new Date().toTimeString().slice(0,5),
    folio,estado:'Pagado',doctor_id:doctorActual.id,doctor_nombre:doctorActual.nombre};
  try {
    await sb('cobros','POST',cobro);
    COBROS.unshift(cobro);
    const cp=CITAS.find(c=>c.pac_id===pacId&&c.fecha===hoy()&&c.estado!=='Pagado');
    if(cp){cp.estado='Pagado';await sb('citas','PATCH',{estado:'Pagado'},`?id=eq.${cp.id}`);}
    cm('cobrar');
    if(document.getElementById('gent').checked){generarTicket(cobro);om('ticket');}
    renderAgenda();renderCaja();actualizarBadges();
    toast('✓ Cobro registrado — '+folio);
  } catch(e){toast('⚠ Error: '+e.message);}
}

function generarTicket(c) {
  const sig=CITAS.find(ct=>ct.pac_id===c.pac_id&&ct.fecha>hoy());
  document.getElementById('tk-contenido').innerHTML=`
    <div class="tk-lg">保气 · BaoQi<br><span style="font-size:10px;font-weight:400;color:#666">Centro de Bienestar Integral</span></div>
    <div class="tk-r"><span>Folio:</span><span>${c.folio}</span></div>
    <div class="tk-r"><span>Fecha:</span><span>${fmtF(c.fecha)} ${c.hora}</span></div>
    <div class="tk-r"><span>Paciente:</span><span>${c.pac_nombre}</span></div>
    <div class="tk-r"><span>Servicio:</span><span>${c.serv}</span></div>
    <div class="tk-r"><span>Atendió:</span><span>${c.doctor_nombre}</span></div>
    <div class="tk-r"><span>Método:</span><span>${c.met}</span></div>
    <div style="border-top:1px dashed #ccc;margin:5px 0"></div>
    <div class="tk-t"><span>Total:</span><span>${fmtM(c.monto)}</span></div>
    ${sig?`<div class="tk-f">Próxima cita: ${fmtF(sig.fecha)} ${sig.hora||''}</div>`:''}
    <div class="tk-f">Gracias por su preferencia · NOM-004-SSA3-2012</div>`;
}

/* ============ AGENDA — navegación por días ============ */
let agendaFecha = hoy();
let cajaFecha = hoy();
let semOffset = 0; // semanas desde hoy, compartido entre agenda y caja

/* ---- Utilidades de semana ---- */
function getSabDom(weekOffset) {
  const hoyD = new Date();
  const diaSem = hoyD.getDay();
  const lunes = new Date(hoyD);
  lunes.setDate(hoyD.getDate() - (diaSem === 0 ? 6 : diaSem - 1) + weekOffset * 7);
  return [5, 6].map(offset => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + offset);
    const iso = toLocalISO(d);
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const nombres = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    return { iso, diaNombre: nombres[d.getDay()], diaNum: d.getDate(), mes: meses[d.getMonth()], esHoy: iso === hoy() };
  });
}

function getMesLabel(weekOffset) {
  const dias = getSabDom(weekOffset);
  const d = new Date(dias[0].iso + 'T12:00:00');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return meses[d.getMonth()] + ' ' + d.getFullYear();
}

function fmtFechaAgenda(iso) {
  const d = new Date(iso + 'T12:00:00');
  const manana = new Date(); manana.setDate(manana.getDate()+1);
  const ayer = new Date(); ayer.setDate(ayer.getDate()-1);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const diasN = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  if (iso===hoy()) return 'Hoy — '+diasN[d.getDay()]+' '+d.getDate()+' '+meses[d.getMonth()];
  if (iso===toLocalISO(manana)) return 'Mañana — '+diasN[d.getDay()]+' '+d.getDate()+' '+meses[d.getMonth()];
  if (iso===toLocalISO(ayer)) return 'Ayer — '+diasN[d.getDay()]+' '+d.getDate()+' '+meses[d.getMonth()];
  return diasN[d.getDay()]+' '+d.getDate()+' de '+meses[d.getMonth()]+' '+d.getFullYear();
}

function contarCitas(iso) { return CITAS.filter(c=>c.fecha===iso).length; }

/* ---- Barra sáb/dom reutilizable ---- */
function renderBarraDias(navId, fechaActual, fnSelDia, fnSemana) {
  const navEl = document.getElementById(navId);
  if (!navEl) return;
  const dias = getSabDom(semOffset);
  const esHoyVisible = semOffset === 0;
  navEl.innerHTML = `
    <div style="background:white;border:.5px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <button class="btn btn-sm" onclick="${fnSemana}(-1)"><i class="ti ti-chevron-left"></i></button>
        <span style="font-size:12px;font-weight:500;color:var(--text-sec)">${getMesLabel(semOffset)}</span>
        <button class="btn btn-sm" onclick="${fnSemana}(1)"><i class="ti ti-chevron-right"></i></button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${dias.map(d=>`
          <button onclick="${fnSelDia}('${d.iso}')"
            style="padding:10px 8px;border-radius:9px;
              border:${d.iso===fechaActual?'2px solid var(--g)':'.5px solid var(--border)'};
              background:${d.iso===fechaActual?'var(--gl)':d.esHoy?'var(--aul)':'white'};
              cursor:pointer;text-align:center;transition:all .15s;">
            <div style="font-size:11px;font-weight:500;color:${d.iso===fechaActual?'var(--g)':d.esHoy?'var(--aud)':'var(--text-sec)'};">${d.diaNombre}</div>
            <div style="font-size:20px;font-weight:600;color:${d.iso===fechaActual?'var(--g)':d.esHoy?'var(--aud)':'var(--text)'};line-height:1.2;">${d.diaNum}</div>
            <div style="font-size:10px;color:var(--text-ter);">${d.mes}</div>
            ${d.esHoy?'<div style="font-size:9px;color:var(--aud);font-weight:600;margin-top:2px">Hoy</div>':''}
            <div style="font-size:9px;margin-top:5px;padding:2px 6px;border-radius:6px;display:inline-block;
              background:${contarCitas(d.iso)>0?'var(--gl)':'var(--bg-sec)'};
              color:${contarCitas(d.iso)>0?'var(--g)':'var(--text-ter)'};">
              ${contarCitas(d.iso)} cita${contarCitas(d.iso)!==1?'s':''}
            </div>
          </button>`).join('')}
      </div>
      ${!esHoyVisible?`<div style="text-align:center;margin-top:10px">
        <button class="btn btn-sm btn-g" onclick="semOffset=0;${fnSelDia}('${hoy()}')">
          <i class="ti ti-calendar-event"></i> Ir a hoy
        </button></div>`:''}
    </div>`;
}

/* ---- Agenda ---- */
function selAgendaDia(iso) { agendaFecha = iso; renderAgenda(); }
function cambiarSemAgenda(dir) { semOffset += dir; renderAgenda(); }

function renderAgenda() {
  const fecha = agendaFecha;
  const esHoy = fecha === hoy();
  renderBarraDias('agenda-nav', fecha, 'selAgendaDia', 'cambiarSemAgenda');
  const citasF = CITAS.filter(c=>c.fecha===fecha).sort((a,b)=>a.hora>b.hora?1:-1);
  document.getElementById('ag-porllevar').textContent = citasF.filter(c=>c.estado==='Pendiente').length;
  document.getElementById('ag-consulta').textContent  = citasF.filter(c=>c.estado==='Llegó').length;
  document.getElementById('ag-cobrar').textContent    = fmtM(citasF.filter(c=>c.estado==='Atendida').length*400);
  document.getElementById('ag-term').textContent      = citasF.filter(c=>c.estado==='Atendida'||c.estado==='Pagado').length;
  const wrap = document.getElementById('agenda-lista');
  if (!citasF.length) {
    wrap.innerHTML = `<div class="empty"><i class="ti ti-calendar-off"></i>Sin citas para ${esHoy?'hoy':fmtFechaAgenda(fecha)}<br><button class="btn btn-sm btn-g" onclick="om('ncita')" style="margin-top:10px"><i class="ti ti-plus"></i> Agendar cita</button></div>`;
    return;
  }
  const am = citasF.filter(c=>c.hora<'13:00');
  const pm = citasF.filter(c=>c.hora>='13:00');
  let html = '';
  if (am.length) { html += '<div class="hora-sep">Mañana</div>'; am.forEach(c=>{html+=renderCitaCard(c);}); }
  if (pm.length) { html += '<div class="hora-sep" style="margin-top:14px">Tarde</div>'; pm.forEach(c=>{html+=renderCitaCard(c);}); }
  wrap.innerHTML = html;
}

/* ---- Caja ---- */
function selCajaDia(iso) { cajaFecha = iso; renderCaja(); }
function cambiarSemCaja(dir) { semOffset += dir; renderCaja(); }

function renderCaja() {
  const fecha = cajaFecha;
  const esHoy = fecha === hoy();
  renderBarraDias('caja-nav', fecha, 'selCajaDia', 'cambiarSemCaja');
  const cobF = COBROS.filter(c=>c.fecha===fecha);
  const totalF = cobF.reduce((s,c)=>s+c.monto,0);
  const pendF = CITAS.filter(c=>c.fecha===fecha&&c.estado==='Pendiente').length;
  const lbl = document.getElementById('cj-hoy-lbl');
  if (lbl) lbl.textContent = esHoy ? 'Cobrado hoy' : fmtFechaAgenda(fecha).split(' — ')[0];
  document.getElementById('cj-hoy').textContent = fmtM(totalF);
  document.getElementById('cj-hoy-n').textContent = cobF.length+' cobros';
  document.getElementById('cj-pend').textContent = fmtM(pendF*400);
  const d=new Date(); const lun=new Date(d); lun.setDate(d.getDate()-d.getDay()+1);
  document.getElementById('cj-sem').textContent=fmtM(COBROS.filter(c=>c.fecha>=toLocalISO(lun)).reduce((s,c)=>s+c.monto,0));
  document.getElementById('cj-mes').textContent=fmtM(COBROS.filter(c=>c.fecha.startsWith(hoy().slice(0,7))).reduce((s,c)=>s+c.monto,0));
  const tb=document.getElementById('tb-caja');
  tb.innerHTML=cobF.length
    ?cobF.map(c=>`<tr><td>${c.hora}</td><td>${c.pac_nombre}</td><td class="hide-sm">${c.serv}</td><td>${fmtM(c.monto)}</td><td class="hide-sm"><span style="background:var(--gl);color:var(--g);padding:2px 8px;border-radius:8px;font-size:10px;font-weight:500">${c.met}</span></td><td class="hide-sm" style="font-size:11px;color:var(--text-sec)">${esAdmin()?c.doctor_nombre||'—':''}</td><td><button class="ra" onclick='generarTicket(${JSON.stringify(c)});om("ticket")'><i class="ti ti-printer"></i></button></td></tr>`).join('')
    :`<tr><td colspan="7"><div class="empty"><i class="ti ti-receipt-off"></i>Sin cobros para ${esHoy?'hoy':fmtFechaAgenda(fecha)}</div></td></tr>`;
}

function renderCitaCard(cita) {
  const pac=PACS.find(p=>p.id===cita.pac_id)||{nombre:cita.pac_nombre||'Paciente'};
  const nombre=pac.nombre;
  const avClass=cita.tipo==='Primera vez'?'av-nueva':'av-sub';
  const tipoClass=cita.tipo==='Primera vez'?'tipo-pv':'tipo-sub';
  let estadoPill='',acciones='';
  switch(cita.estado){
    case 'Pendiente':
      estadoPill=`<span class="ep ep-pendiente">Pendiente</span>`;
      acciones=`<button class="btn btn-sm" style="background:var(--gl);border-color:var(--g);color:var(--g)" onclick="registrarLlegada('${cita.id}')"><i class="ti ti-door-enter"></i> Llegó</button>`;
      break;
    case 'Llegó':
      estadoPill=`<span class="ep ep-llego"><i class="ti ti-door-enter" style="font-size:11px"></i> Llegó</span>`;
      acciones=`<button class="btn btn-teal btn-sm" onclick="abrirHCdesdeCita('${cita.id}')"><i class="ti ti-clipboard-heart"></i> ${cita.tipo==='Primera vez'?'Historia clínica':'Nota SOAP'}</button>`;
      break;
    case 'Atendida':
      estadoPill=`<span class="ep ep-atendido">Atendida</span>`;
      acciones=`<button class="btn btn-a btn-sm" onclick="om('cobrar')"><i class="ti ti-cash"></i> Cobrar</button>`;
      break;
    case 'Pagado':
      estadoPill=`<span class="ep ep-pagado"><i class="ti ti-check" style="font-size:11px"></i> Pagada</span>`;
      acciones=`<button class="btn btn-sm" onclick="abrirSOAPdesdeCita('${cita.id}')"><i class="ti ti-notes"></i> SOAP</button>`;
      break;
  }
  // Mostrar doctor solo si es admin (varios doctores)
  const docLine=esAdmin()?`<div class="cita-doctor"><i class="ti ti-user-circle" style="font-size:11px;vertical-align:-1px"></i> ${cita.doctor_nombre||'—'}</div>`:'';
  return `<div class="cita-card" style="${cita.estado==='Llegó'?'border-left:3px solid var(--g);':''}${cita.estado==='Pagado'||cita.estado==='Atendida'?'opacity:.8;':''}">
    <div class="cita-hora">${cita.hora}<div class="h-sub">60 min</div></div>
    <div class="cita-av ${avClass}">${ini2(nombre)}</div>
    <div class="cita-info">
      <div class="cita-nombre">${nombre}</div>
      <div class="cita-motivo"><span class="tipo-tag ${tipoClass}">${cita.tipo}</span> · ${cita.motivo||'—'}</div>
      ${docLine}
    </div>
    <div class="cita-acciones">${estadoPill}${acciones}</div>
  </div>`;
}

function abrirHCdesdeCita(citaId) {
  const cita=CITAS.find(c=>c.id===citaId); if(!cita) return;
  const pac=PACS.find(p=>p.id===cita.pac_id)||{nombre:cita.pac_nombre||'Paciente',id:cita.pac_id};
  if(cita.tipo==='Primera vez') abrirHC(cita,pac);
  else abrirSOAPdesdeCita(citaId);
}

function abrirSOAPdesdeCita(citaId) {
  const cita=CITAS.find(c=>c.id===citaId); if(!cita) return;
  citaActual=cita;
  const pac=PACS.find(p=>p.id===cita.pac_id)||{nombre:cita.pac_nombre||'Paciente'};
  const numSesion=NOTAS.filter(n=>n.pac_id===cita.pac_id).length+1;
  document.getElementById('soap-pac-nombre').textContent=pac.nombre;
  document.getElementById('soap-num').value=numSesion;
  soapReset(); om('soap');
}

/* ============ PACIENTES ============ */
function renderPacs(lista) {
  const tb=document.getElementById('tb-pac');
  if(!lista.length){tb.innerHTML=`<tr><td colspan="6"><div class="empty"><i class="ti ti-users-off"></i>Sin pacientes aún</div></td></tr>`;return;}
  tb.innerHTML=lista.map(p=>{
    const citas=CITAS.filter(c=>c.pac_id===p.id);
    const edad=p.fnac?Math.floor((new Date()-new Date(p.fnac))/31557600000):'—';
    return `<tr>
      <td><div style="display:flex;align-items:center"><div class="av">${ini2(p.nombre)}</div>${p.nombre}</div></td>
      <td>${edad}/${p.sexo?.[0]||'—'}</td>
      <td class="hide-sm">${p.tel||'—'}</td>
      <td class="hide-sm" style="white-space:normal">${p.motivo||p.dxbio||'—'}</td>
      <td>${citas.length}</td>
      <td><button class="ra" onclick="abrirSOAPpaciente('${p.id}','${p.nombre}')"><i class="ti ti-file-text"></i></button></td>
    </tr>`;
  }).join('');
}

function filtrarPacs(q) {
  renderPacs(PACS.filter(p=>p.nombre.toLowerCase().includes(q.toLowerCase())||((p.motivo||'').toLowerCase().includes(q.toLowerCase()))));
}

function abrirSOAPpaciente(pacId,nombre) {
  citaActual={pac_id:pacId};
  const numSesion=NOTAS.filter(n=>n.pac_id===pacId).length+1;
  document.getElementById('soap-pac-nombre').textContent=nombre;
  document.getElementById('soap-num').value=numSesion;
  soapReset(); om('soap');
}

/* ============ CAJA ============ */
/* ============ CAJA — navegación por días ============ */
/* ============ REPORTES ============ */
function toggleRango(){document.getElementById('rep-rango').style.display=document.getElementById('rep-periodo').value==='rango'?'flex':'none';}
function getRango(){
  const per=document.getElementById('rep-periodo').value;const h=hoy();const d=new Date();
  let desde=h,hasta=h;
  if(per==='semana'){const l=new Date(d);l.setDate(d.getDate()-d.getDay()+1);desde=toLocalISO(l);}
  else if(per==='mes'){desde=h.slice(0,7)+'-01';}
  else if(per==='rango'){desde=document.getElementById('rep-desde').value||h;hasta=document.getElementById('rep-hasta').value||h;}
  return{desde,hasta};
}
function renderReporte(){
  const{desde,hasta}=getRango();
  const docFil=document.getElementById('rep-doctor-fil')?.value||'';
  let cobros=COBROS.filter(c=>c.fecha>=desde&&c.fecha<=hasta);
  if(docFil) cobros=cobros.filter(c=>c.doctor_id===docFil);
  const total=cobros.reduce((s,c)=>s+c.monto,0);
  const prom=cobros.length?Math.round(total/cobros.length):0;
  document.getElementById('r-total').textContent=fmtM(total);
  document.getElementById('r-sub').textContent=cobros.length+' pagos';
  document.getElementById('r-n').textContent=cobros.length;
  document.getElementById('r-prom').textContent=fmtM(prom);
  document.getElementById('r-ef').textContent=fmtM(cobros.filter(c=>c.met==='Efectivo').reduce((s,c)=>s+c.monto,0));
  document.getElementById('r-tj').textContent=fmtM(cobros.filter(c=>c.met==='Tarjeta').reduce((s,c)=>s+c.monto,0));
  document.getElementById('r-tr').textContent=fmtM(cobros.filter(c=>c.met==='Transferencia').reduce((s,c)=>s+c.monto,0));
  const ag={};cobros.forEach(c=>{ag[c.fecha]=(ag[c.fecha]||0)+c.monto;});
  const claves=Object.keys(ag).sort();const maxV=Math.max(...Object.values(ag),1);
  document.getElementById('bars').innerHTML=claves.length
    ?claves.map(f=>{const v=ag[f];const hh=Math.round((v/maxV)*100);const[y,m,dd]=f.split('-');return`<div class="bar-col"><div class="bar-val">${fmtM(v)}</div><div class="bar" style="height:${hh}px"></div><div class="bar-lbl">${dd}/${m}</div></div>`;}).join('')
    :'<div style="font-size:12px;color:var(--text-ter);margin:auto">Sin cobros</div>';
  document.getElementById('tb-rep').innerHTML=cobros.length
    ?cobros.sort((a,b)=>b.fecha>a.fecha?1:-1).map(c=>`<tr><td>${fmtF(c.fecha)}</td><td>${c.pac_nombre}</td><td class="hide-sm">${c.serv}</td><td>${fmtM(c.monto)}</td><td class="hide-sm"><span style="background:var(--gl);color:var(--g);padding:2px 7px;border-radius:8px;font-size:10px;font-weight:500">${c.met}</span></td><td class="hide-sm" style="${esAdmin()?'':'display:none'};font-size:11px;color:var(--text-sec)">${c.doctor_nombre||'—'}</td></tr>`).join('')
    :`<tr><td colspan="6"><div class="empty"><i class="ti ti-receipt-off"></i>Sin cobros</div></td></tr>`;
}
function exportarCSV(){
  const{desde,hasta}=getRango();
  const cobros=COBROS.filter(c=>c.fecha>=desde&&c.fecha<=hasta);
  const csv=['Fecha,Folio,Paciente,Servicio,Monto,Método,Doctor',...cobros.map(c=>`${c.fecha},${c.folio},${c.pac_nombre},${c.serv},${c.monto},${c.met},${c.doctor_nombre||''}`)].join('\n');
  const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=`BaoQi_${desde}_${hasta}.csv`;a.click();
  toast('✓ CSV exportado');
}

/* ============ EXPEDIENTES ============ */
function renderExp(){
  const tb=document.getElementById('tb-exp');
  const conHC=PACS.filter(p=>p.dxbio||p.dxmtch||NOTAS.some(n=>n.pac_id===p.id));
  if(!conHC.length){tb.innerHTML=`<tr><td colspan="6"><div class="empty"><i class="ti ti-clipboard-off"></i>Aún no hay expedientes con historia clínica</div></td></tr>`;return;}
  tb.innerHTML=conHC.map((p,i)=>{
    const citas=CITAS.filter(c=>c.pac_id===p.id).length;
    return`<tr>
      <td><div style="display:flex;align-items:center"><div class="av">${ini2(p.nombre)}</div>${p.nombre}</div></td>
      <td style="color:var(--text-ter);font-size:11px">BQ-${String(i+1).padStart(4,'0')}</td>
      <td class="hide-sm">${p.dxbio||'—'}</td>
      <td class="hide-sm">${p.dxmtch||'—'}</td>
      <td>${citas}</td>
      <td><button class="ra" onclick="abrirSOAPpaciente('${p.id}','${p.nombre}')"><i class="ti ti-notes"></i></button></td>
    </tr>`;
  }).join('');
}

/* ============ ADMIN ============ */
function renderAdmin(){
  document.getElementById('doc-grid').innerHTML=DOCS.map(d=>`
    <div class="doc-card">
      <div class="doc-card-av ${d.rol==='admin'?'admin':''}">${ini2(d.nombre)}</div>
      <div class="doc-card-name">${d.nombre}</div>
      <div class="doc-card-esp">${d.especialidad||'—'}</div>
      <div class="doc-card-ced">Cédula: ${d.cedula||'—'}</div>
      <div class="doc-card-foot">
        <span class="doc-activo ${d.activo?'si':'no'}">${d.activo?'Activo':'Inactivo'}</span>
        <div style="display:flex;gap:5px;align-items:center">
          <span style="font-size:10px;background:var(--bg-sec);padding:2px 7px;border-radius:8px;color:var(--text-ter)">${d.rol==='admin'?'Admin':'Doctor'}</span>
          ${d.id!=='admin-001'?`<button class="ra" onclick="toggleDoctor('${d.id}',${d.activo})" title="${d.activo?'Desactivar':'Activar'}"><i class="ti ti-power"></i></button>`:''}
        </div>
      </div>
    </div>`).join('');
}
