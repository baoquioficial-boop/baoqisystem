/* =============================================
   BaoQi v3 — app.js
   Filtrado por rol: doctor ve solo lo suyo,
   admin ve todo. Sin UI de roles visible.
   ============================================= */

let PACS = [], CITAS = [], COBROS = [], NOTAS = [], DIAS_BLOQUEADOS = [];
let citaActual = null;

/* ============ UTILIDADES ============ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function hoy() {
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
// Convierte un objeto Date a 'YYYY-MM-DD' en zona LOCAL (no UTC)
function fechaLocal(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
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

// Centro de un solo doctor: todos ven todas las citas y pacientes.
// (Si en el futuro se agregan mas doctores, reactivar el filtro por doctor_id.)
function qDoctor() { return ''; }
function qPacientes() { return ''; }

/* ============ CARGA CON FILTRO ============ */
async function cargarTodo() {
  // Cargar cada tabla por separado: si una falla, las demás siguen cargando
  try { PACS = await sb('pacientes','GET',null,`?order=created_at.desc${qPacientes()}`) || []; } catch(e){ PACS=[]; }
  try { CITAS = await sb('citas','GET',null,`?order=fecha.asc,hora.asc${qDoctor()}`) || []; } catch(e){ CITAS=[]; }
  try { COBROS = await sb('cobros','GET',null,`?order=created_at.desc${qDoctor()}`) || []; } catch(e){ COBROS=[]; }
  try { NOTAS = await sb('notas_soap','GET',null,`?order=created_at.desc${qDoctor()}`) || []; } catch(e){ NOTAS=[]; }
  try { DIAS_BLOQUEADOS = await sb('dias_bloqueados','GET',null,'?order=fecha.asc') || []; } catch(e){ DIAS_BLOQUEADOS=[]; }

  // Admin: mostrar filtro por doctor en reportes
  const filtroDocEl = document.getElementById('rep-doctor-fil');
  if (filtroDocEl) {
    filtroDocEl.style.display = esAdmin() ? 'block' : 'none';
    filtroDocEl.innerHTML = '<option value="">Todos los doctores</option>' +
      DOCS.map(d=>`<option value="${d.id}">${d.nombre}</option>`).join('');
    filtroDocEl.addEventListener('change', renderReporte);
  }
  const thDoc = document.getElementById('th-doctor-rep');
  if (thDoc) thDoc.style.display = esAdmin() ? '' : 'none';

  actualizarBadges();
  renderAgenda();
  // Cursos, inscripciones, comprobantes y promociones: los ve admin Y doctor
  cargarCursos();
  cargarPanelAdmin();
  cargarPausados();
  cargarInteresados();
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
  const t={agenda:'Agenda',pac:'Pacientes',caja:'Caja',rep:'Reportes',exp:'Expedientes',admin:'Configuración',cursos:'Cursos de herbolaria',dorados:'Jueves Dorados',interesados:'Interesados',dashboard:'Dashboard',crm:'CRM — Contactos',inscripciones:'Inscripciones',comprobantes:'Comprobantes',promos:'Promociones',agente:'Agente IA',recordatorios:'Recordatorios',atencion:'Atención WhatsApp'};
  document.getElementById('ptit').textContent=t[page];
  if(page==='agenda') renderAgenda();
  if(page==='pac') renderPacs(PACS);
  if(page==='caja') renderCaja();
  if(page==='rep') renderReporte();
  if(page==='exp') renderExp();
  if(page==='admin') renderAdmin();
  if(page==='cursos'){ cargarCursos().then(renderCursos); }
  if(page==='dorados'){ cargarCursos().then(renderDorados); }
  if(page==='interesados'){ cargarInteresados().then(renderInteresados); }
  if(page==='dashboard') renderDashboard();
  if(page==='crm') renderCRM();
  if(page==='inscripciones') renderInscripciones();
  if(page==='comprobantes') renderComprobantes();
  if(page==='promos') renderPromos();
  if(page==='agente') renderConfigAgente();
  if(page==='recordatorios'){ const rf=document.getElementById('rec-fecha'); if(rf && !rf.value){ rf.value=hoy(); } cargarRecordatorios(); }
  if(page==='atencion'){ cargarPausados().then(renderPausados); }
}

function om(id) {
  document.getElementById('m-'+id).classList.add('op');
  if(id==='cobrar') { poblarSelectCobro(); actualizarMonto(); }
  if(id==='ncita') { document.getElementById('nc-fecha').value=agendaFecha||hoy(); poblarSelectDoctor(); if(typeof limpiarPacienteCita==='function') limpiarPacienteCita(); }
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
  const v = document.getElementById('cob-serv').value;
  document.getElementById('cob-monto').value = fmtM(v);
  document.getElementById('cob-total').textContent = fmtM(v);
}

/* ============ NUEVA CITA SIMPLE ============ */
// ---- Buscador de paciente existente en modal de cita ----
let ncPacienteSel = null;

function buscarPacienteCita(q) {
  const cont = document.getElementById('nc-resultados');
  if (!cont) return;
  q = (q||'').trim().toLowerCase();
  if (q.length < 2) { cont.style.display='none'; return; }
  const qNum = q.replace(/[^0-9]/g,'');
  const res = PACS.filter(p => {
    const nom = (p.nombre||'').toLowerCase();
    const tel = (p.tel||'').replace(/[^0-9]/g,'');
    return nom.includes(q) || (qNum.length>=3 && tel.includes(qNum));
  }).slice(0, 8);
  if (!res.length) {
    cont.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:var(--text-ter)">Sin coincidencias — puedes registrarlo como nuevo abajo</div>';
    cont.style.display='block';
    return;
  }
  cont.innerHTML = res.map(p => {
    const nCitas = CITAS.filter(c=>c.pac_id===p.id).length;
    return `<div onclick="seleccionarPacienteCita('${p.id}')" style="padding:9px 12px;cursor:pointer;border-bottom:.5px solid var(--border);font-size:13px" onmouseover="this.style.background='var(--bg-sec)'" onmouseout="this.style.background='white'">
      <div style="font-weight:500;color:var(--text)">${p.nombre}</div>
      <div style="font-size:11px;color:var(--text-ter)">${p.tel||'sin tel'} · ${nCitas} cita${nCitas!==1?'s':''} previa${nCitas!==1?'s':''}</div>
    </div>`;
  }).join('');
  cont.style.display='block';
}

function seleccionarPacienteCita(pacId) {
  const p = PACS.find(x=>x.id===pacId);
  if (!p) return;
  ncPacienteSel = p;
  // Autocompletar y bloquear campos
  document.getElementById('nc-nombre').value = p.nombre||'';
  document.getElementById('nc-tel').value = p.tel||'';
  document.getElementById('nc-motivo').value = p.motivo||'';
  // Marcar como subsecuente automáticamente
  document.getElementById('nc-tipo').value = 'Subsecuente';
  // Mostrar chip de paciente seleccionado
  const chip = document.getElementById('nc-pac-sel');
  const nCitas = CITAS.filter(c=>c.pac_id===p.id).length;
  document.getElementById('nc-pac-sel-txt').innerHTML = `<i class="ti ti-user-check" style="vertical-align:-2px"></i> ${p.nombre} — paciente existente (${nCitas} cita${nCitas!==1?'s':''})`;
  chip.style.display='flex';
  // Ocultar buscador y resultados
  document.getElementById('nc-resultados').style.display='none';
  document.getElementById('nc-buscar').value='';
}

function limpiarPacienteCita() {
  ncPacienteSel = null;
  document.getElementById('nc-pac-sel').style.display='none';
  document.getElementById('nc-nombre').value='';
  document.getElementById('nc-tel').value='';
  document.getElementById('nc-motivo').value='';
  document.getElementById('nc-tipo').value='Primera vez';
}

async function guardarCitaSimple() {
  const nombre=document.getElementById('nc-nombre').value.trim();
  const tel=document.getElementById('nc-tel').value.trim();
  const fecha=document.getElementById('nc-fecha').value;
  if(!nombre||!fecha){toast('⚠ Nombre y fecha son obligatorios');return;}

  // ✅ Martes(2) a Sábado(6) — cerrado domingo(0) y lunes(1)
  const _diaSem = new Date(fecha+'T12:00:00').getDay();
  if(_diaSem===0 || _diaSem===1){
    toast('⚠ Se atiende de martes a sábado');return;
  }
  // ✅ Verificar que no esté bloqueado
  const _bloq = DIAS_BLOQUEADOS.find(d=>d.fecha===fecha);
  if(_bloq){ toast('⚠ Día bloqueado: '+(_bloq.motivo||'No disponible')); return; }


  const doctorId=document.getElementById('nc-doctor')?.value||doctorActual.id;
  const doctorNombre=DOCS.find(d=>d.id===doctorId)?.nombre||doctorActual.nombre;

  // Buscar paciente existente — primero por teléfono normalizado, luego por nombre
  const telNorm = (tel||'').replace(/[^0-9]/g,'').slice(-10);
  let pac = null;
  // Si ya se seleccionó un paciente del buscador, usarlo directo (no duplicar)
  if (ncPacienteSel) {
    pac = ncPacienteSel;
  }
  if (!pac && telNorm) {
    pac = PACS.find(p => (p.tel||'').replace(/[^0-9]/g,'').slice(-10) === telNorm);
  }
  if (!pac) {
    pac = PACS.find(p => p.nombre.toLowerCase().trim() === nombre.toLowerCase().trim());
  }
  if(!pac) {
    pac={id:uid(),nombre,tel:telNorm,motivo:document.getElementById('nc-motivo').value,
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
// Días laborables: martes(2) a sábado(6). Devuelve los 5 días de la semana con offset.
function getSabDom(weekOffset) {
  const hoyD = new Date();
  const diaSem = hoyD.getDay();
  const lunes = new Date(hoyD);
  lunes.setDate(hoyD.getDate() - (diaSem === 0 ? 6 : diaSem - 1) + weekOffset * 7);
  // offsets desde lunes: martes=1, miércoles=2, jueves=3, viernes=4, sábado=5
  return [1, 2, 3, 4, 5].map(offset => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + offset);
    const iso = fechaLocal(d);
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
  if (iso===fechaLocal(manana)) return 'Mañana — '+diasN[d.getDay()]+' '+d.getDate()+' '+meses[d.getMonth()];
  if (iso===fechaLocal(ayer)) return 'Ayer — '+diasN[d.getDay()]+' '+d.getDate()+' '+meses[d.getMonth()];
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
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">
        ${dias.map(d=>`
          <button onclick="${fnSelDia}('${d.iso}')"
            style="padding:9px 4px;border-radius:9px;
              border:${d.iso===fechaActual?'2px solid var(--g)':'.5px solid var(--border)'};
              background:${d.iso===fechaActual?'var(--gl)':d.esHoy?'var(--aul)':'white'};
              cursor:pointer;text-align:center;transition:all .15s;">
            <div style="font-size:10px;font-weight:500;color:${d.iso===fechaActual?'var(--g)':d.esHoy?'var(--aud)':'var(--text-sec)'};">${d.diaNombre}</div>
            <div style="font-size:18px;font-weight:600;color:${d.iso===fechaActual?'var(--g)':d.esHoy?'var(--aud)':'var(--text)'};line-height:1.2;">${d.diaNum}</div>
            <div style="font-size:9px;color:var(--text-ter);">${d.mes}</div>
            ${d.esHoy?'<div style="font-size:8px;color:var(--aud);font-weight:600;margin-top:1px">Hoy</div>':''}
            <div style="font-size:8px;margin-top:4px;padding:2px 4px;border-radius:5px;display:inline-block;
              background:${DIAS_BLOQUEADOS.find(b=>b.fecha===d.iso)?'#FCEBEB':contarCitas(d.iso)>0?'var(--gl)':'var(--bg-sec)'};
              color:${DIAS_BLOQUEADOS.find(b=>b.fecha===d.iso)?'#A32D2D':contarCitas(d.iso)>0?'var(--g)':'var(--text-ter)'};">
              ${DIAS_BLOQUEADOS.find(b=>b.fecha===d.iso)?'🔒':contarCitas(d.iso)+(contarCitas(d.iso)!==1?' citas':' cita')}
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
  document.getElementById('cj-sem').textContent=fmtM(COBROS.filter(c=>c.fecha>=fechaLocal(lun)).reduce((s,c)=>s+c.monto,0));
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
  const estadoCita = cita.estado || 'Pendiente';
  switch(estadoCita){
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
    case 'Cancelada':
      estadoPill=`<span class="ep" style="background:#FCEBEB;color:#A32D2D">Cancelada</span>`;
      acciones='';
      break;
    default:
      // Cualquier estado desconocido o vacío se trata como Pendiente (para no dejar la cita sin acciones)
      estadoPill=`<span class="ep ep-pendiente">Pendiente</span>`;
      acciones=`<button class="btn btn-sm" style="background:var(--gl);border-color:var(--g);color:var(--g)" onclick="registrarLlegada('${cita.id}')"><i class="ti ti-door-enter"></i> Llegó</button>`;
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
    <div class="cita-acciones">${estadoPill}${acciones}<button class="ra" onclick="menuCita('${cita.id}',event)" title="Opciones" style="margin-left:2px"><i class="ti ti-dots-vertical"></i></button></div>
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
  if(per==='semana'){const l=new Date(d);l.setDate(d.getDate()-d.getDay()+1);desde=fechaLocal(l);}
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
/* ============ ADMIN ============ */
function renderAdmin(){
  // Sección doctores
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

  // Sección días bloqueados
  const diasEl = document.getElementById('admin-dias');
  if(!diasEl) return;

  // Próximos días laborables (martes a sábado) — fecha local (no UTC)
  const proxDias = [];
  const hoyD = new Date();
  const hoyLocal = hoyD.getFullYear()+'-'+String(hoyD.getMonth()+1).padStart(2,'0')+'-'+String(hoyD.getDate()).padStart(2,'0');
  for(let i=0;i<30;i++){
    const d = new Date(hoyD); d.setDate(hoyD.getDate()+i);
    const dow = d.getDay();
    if(dow>=2 && dow<=6){  // martes(2) a sábado(6)
      const iso = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      proxDias.push(iso);
      if(proxDias.length>=10) break;
    }
  }

  if(!proxDias.length){ diasEl.innerHTML='<div class="empty">Sin días disponibles</div>'; return; }

  const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const diasN=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  diasEl.innerHTML = proxDias.map(iso=>{
    const d = new Date(iso+'T12:00:00');
    const bloq = DIAS_BLOQUEADOS.find(b=>b.fecha===iso);
    const numCitas = CITAS.filter(c=>c.fecha===iso).length;
    const esHoy = iso===hoyLocal;
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:.5px solid var(--border);">
      <div style="text-align:center;min-width:52px;">
        <div style="font-size:10px;font-weight:600;color:var(--text-ter);text-transform:uppercase">${diasN[d.getDay()]}</div>
        <div style="font-size:22px;font-weight:600;line-height:1.1;color:${bloq?'#A32D2D':esHoy?'var(--aud)':'var(--text)'}">${d.getDate()}</div>
        <div style="font-size:10px;color:var(--text-ter)">${meses[d.getMonth()]}</div>
        ${esHoy?'<div style="font-size:9px;color:var(--aud);font-weight:600">HOY</div>':''}
      </div>
      <div style="flex:1">
        ${bloq
          ? `<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;padding:3px 10px;border-radius:8px;font-weight:500">🔒 Bloqueado</span>
             <div style="font-size:11px;color:var(--text-ter);margin-top:3px">${bloq.motivo||'Sin motivo'}</div>`
          : `<span style="background:var(--gl);color:var(--g);font-size:11px;padding:3px 10px;border-radius:8px;font-weight:500">✓ Disponible</span>
             <div style="font-size:11px;color:var(--text-ter);margin-top:3px">${numCitas} cita${numCitas!==1?'s':''} agendada${numCitas!==1?'s':''}</div>`
        }
      </div>
      ${bloq
        ? `<button class="btn btn-sm" style="color:var(--g);border-color:var(--g);white-space:nowrap" onclick="desbloquearDia('${iso}','${bloq.id}')"><i class="ti ti-lock-open"></i> Desbloquear</button>`
        : `<button class="btn btn-sm" style="color:#A32D2D;border-color:#E24B4A;white-space:nowrap" onclick="bloquearDia('${iso}')"><i class="ti ti-lock"></i> Bloquear</button>`
      }
    </div>`;
  }).join('');
}
async function bloquearDia(fecha) {
  const motivo = prompt(`Motivo para bloquear ${fmtF(fecha)} (opcional):`);
  if(motivo === null) return; // canceló
  const reg = {id:uid(), fecha, motivo: motivo||'', creado_por: doctorActual.nombre};
  try {
    await sb('dias_bloqueados','POST',reg);
    DIAS_BLOQUEADOS.push(reg);
    renderAdmin();
    renderBarraDias('agenda-nav', agendaFecha, 'selAgendaDia', 'cambiarSemAgenda');
    toast('✓ Día bloqueado: '+fmtF(fecha));
  } catch(e){ toast('⚠ Error: '+e.message); }
}

async function desbloquearDia(fecha, id) {
  if(!confirm('¿Desbloquear '+fmtF(fecha)+'?')) return;
  try {
    await sb('dias_bloqueados','DELETE',null,`?id=eq.${id}`);
    DIAS_BLOQUEADOS = DIAS_BLOQUEADOS.filter(d=>d.id!==id);
    renderAdmin();
    renderBarraDias('agenda-nav', agendaFecha, 'selAgendaDia', 'cambiarSemAgenda');
    toast('✓ Día desbloqueado');
  } catch(e){ toast('⚠ Error: '+e.message); }
}

/* ============================================================
   MÓDULO CURSOS (solo admin)
   ============================================================ */
let CURSOS = [], INSCRIPCIONES = [], insAlumnoSel = null;

async function cargarCursos() {
  // Cargar por separado para que si una tabla falla, la otra siga funcionando
  try {
    CURSOS = await sb('cursos','GET',null,'?order=fecha_inicio.asc') || [];
  } catch(e) { CURSOS = []; }
  try {
    INSCRIPCIONES = await sb('inscripciones','GET',null,'?order=created_at.desc') || [];
  } catch(e) { INSCRIPCIONES = []; }
  const nb = document.getElementById('nb-cursos');
  if (nb) nb.textContent = CURSOS.filter(c=>c.activo && !esDorado(c)).length;
  const nbd = document.getElementById('nb-dorados');
  if (nbd) nbd.textContent = CURSOS.filter(c=>c.activo && esDorado(c)).length;
}

function inscritosDe(cursoId) {
  return INSCRIPCIONES.filter(i => i.curso_id===cursoId && i.estado!=='Cancelado');
}

function tarjetaCurso(c) {
  const inscritos = inscritosDe(c.id).length;
  const lugares = (c.cupo||0) - inscritos;
  const lleno = lugares <= 0;
  const totalAnticipos = inscritosDe(c.id).reduce((s,i)=>s+Number(i.anticipo_pagado||0),0);
  return `
  <div style="background:white;border:.5px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;${!c.activo?'opacity:.6;':''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:600;color:var(--text)">${c.nombre}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${c.modalidad==='En línea'?'#E6F1FB':'var(--gl)'};color:${c.modalidad==='En línea'?'#185FA5':'var(--g)'}">${c.modalidad||'Presencial'}</span>
          ${!c.activo?'<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:#FCEBEB;color:#A32D2D">Inactivo</span>':''}
        </div>
        ${c.descripcion?`<div style="font-size:12px;color:var(--text-sec);margin-top:4px">${c.descripcion}</div>`:''}
        <div style="font-size:11px;color:var(--text-ter);margin-top:6px;display:flex;gap:14px;flex-wrap:wrap">
          ${c.fecha_inicio?`<span><i class="ti ti-calendar" style="vertical-align:-1px"></i> ${fmtF(c.fecha_inicio)}</span>`:''}
          ${c.horario?`<span><i class="ti ti-clock" style="vertical-align:-1px"></i> ${c.horario}</span>`:''}
          ${c.instructor?`<span><i class="ti ti-user" style="vertical-align:-1px"></i> ${c.instructor}</span>`:''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:18px;font-weight:600;color:var(--g)">${fmtM(c.precio||0)}</div>
        ${Number(c.anticipo)>0?`<div style="font-size:10px;color:var(--text-ter)">anticipo ${fmtM(c.anticipo||0)}</div>`:''}
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:.5px solid var(--border)">
      <div style="display:flex;gap:14px;align-items:center">
        <span style="font-size:12px;color:${lleno?'#A32D2D':'var(--g)'};font-weight:500">
          <i class="ti ti-users" style="vertical-align:-1px"></i> ${inscritos}/${c.cupo} ${lleno?'(lleno)':`· ${lugares} libre${lugares!==1?'s':''}`}
        </span>
        <span style="font-size:11px;color:var(--text-ter)">Anticipos: ${fmtM(totalAnticipos)}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="verInscritos('${c.id}')"><i class="ti ti-list"></i> Ver</button>
        <button class="btn btn-sm" onclick="editarCurso('${c.id}')"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm btn-g" ${lleno?'disabled style="opacity:.5"':''} onclick="abrirInscribir('${c.id}')"><i class="ti ti-user-plus"></i> Inscribir</button>
      </div>
    </div>
  </div>`;
}

function esDorado(c){ return (c.categoria==='jueves_dorados') || /jueves dorados/i.test(c.nombre||''); }

function renderCursos() {
  const cont = document.getElementById('cursos-lista');
  if (!cont) return;
  const lista = CURSOS.filter(c=>!esDorado(c));  // solo herbolaria
  if (!lista.length) {
    cont.innerHTML = '<div class="empty"><i class="ti ti-school-off"></i>Aún no hay cursos. Crea el primero con "Nuevo curso".</div>';
    return;
  }
  cont.innerHTML = lista.map(tarjetaCurso).join('');
}

function renderDorados() {
  const cont = document.getElementById('dorados-lista');
  if (!cont) return;
  const lista = CURSOS.filter(esDorado).sort((a,b)=>(a.fecha_inicio||'').localeCompare(b.fecha_inicio||''));
  const nb = document.getElementById('nb-dorados');
  if (nb) nb.textContent = lista.filter(c=>c.activo).length;
  if (!lista.length) {
    cont.innerHTML = '<div class="empty"><i class="ti ti-sun-off"></i>Aún no hay sesiones de Jueves Dorados. Crea la primera con "Nueva sesión".</div>';
    return;
  }
  cont.innerHTML = lista.map(tarjetaCurso).join('');
}

function abrirNuevoDorado() {
  abrirNuevoCurso();
  document.getElementById('curso-modal-tit').textContent = 'Nueva sesión — Jueves Dorados';
  // Prellenar valores típicos de Jueves Dorados
  const h=document.getElementById('cur-horario'); if(h) h.value='Jueves 10:00-13:00';
  const p=document.getElementById('cur-precio'); if(p) p.value=100;
  const cup=document.getElementById('cur-cupo'); if(cup) cup.value=30;
  window._nuevoDorado = true;
}

function abrirNuevoCurso() {
  document.getElementById('curso-modal-tit').textContent = 'Nuevo curso';
  ['cur-id','cur-nombre','cur-desc','cur-fecha','cur-horario','cur-instructor'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('cur-cupo').value = 10;
  document.getElementById('cur-precio').value = '';
  document.getElementById('cur-anticipo').value = '';
  document.getElementById('cur-modalidad').value = 'Presencial';
  document.getElementById('cur-activo').checked = true;
  om('curso');
}

function editarCurso(id) {
  const c = CURSOS.find(x=>x.id===id); if(!c) return;
  document.getElementById('curso-modal-tit').textContent = 'Editar curso';
  document.getElementById('cur-id').value = c.id;
  document.getElementById('cur-nombre').value = c.nombre||'';
  document.getElementById('cur-desc').value = c.descripcion||'';
  document.getElementById('cur-fecha').value = c.fecha_inicio||'';
  document.getElementById('cur-horario').value = c.horario||'';
  document.getElementById('cur-instructor').value = c.instructor||'';
  document.getElementById('cur-cupo').value = c.cupo||10;
  document.getElementById('cur-precio').value = c.precio||'';
  document.getElementById('cur-anticipo').value = c.anticipo||'';
  document.getElementById('cur-modalidad').value = c.modalidad||'Presencial';
  document.getElementById('cur-activo').checked = c.activo!==false;
  om('curso');
}

async function guardarCurso() {
  const nombre = document.getElementById('cur-nombre').value.trim();
  const fecha = document.getElementById('cur-fecha').value;
  if(!nombre){toast('⚠ El nombre es obligatorio');return;}
  if(!fecha){toast('⚠ La fecha de inicio es obligatoria');return;}
  const id = document.getElementById('cur-id').value;
  const datos = {
    nombre,
    descripcion: document.getElementById('cur-desc').value,
    fecha_inicio: fecha,
    horario: document.getElementById('cur-horario').value,
    instructor: document.getElementById('cur-instructor').value,
    modalidad: document.getElementById('cur-modalidad').value,
    cupo: parseInt(document.getElementById('cur-cupo').value)||10,
    precio: parseFloat(document.getElementById('cur-precio').value)||0,
    anticipo: parseFloat(document.getElementById('cur-anticipo').value)||0,
    activo: document.getElementById('cur-activo').checked
  };
  try {
    if(id){
      await sb('cursos','PATCH',datos,`?id=eq.${id}`);
      const idx=CURSOS.findIndex(c=>c.id===id); if(idx>=0) CURSOS[idx]={...CURSOS[idx],...datos};
      toast('✓ Curso actualizado');
    } else {
      datos.id = uid();
      datos.creado_por = doctorActual?.nombre||'';
      datos.categoria = window._nuevoDorado ? 'jueves_dorados' : 'herbolaria';
      window._nuevoDorado = false;
      await sb('cursos','POST',datos);
      CURSOS.push(datos);
      toast('✓ Curso creado');
    }
    cm('curso'); renderCursos(); renderDorados();
    document.getElementById('nb-cursos').textContent = CURSOS.filter(c=>c.activo && !esDorado(c)).length;
  } catch(e){toast('⚠ Error: '+e.message);}
}

/* ---- Inscribir ---- */
function abrirInscribir(cursoId) {
  const c = CURSOS.find(x=>x.id===cursoId); if(!c) return;
  insAlumnoSel = null;
  document.getElementById('ins-curso-id').value = cursoId;
  document.getElementById('ins-curso-nombre').textContent = c.nombre;
  ['ins-nombre','ins-tel','ins-notas','ins-buscar'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('ins-anticipo').value = c.anticipo||'';
  document.getElementById('ins-resto').value = fmtM((c.precio||0)-(c.anticipo||0));
  document.getElementById('ins-resultados').style.display='none';
  // Aviso si es paquete
  const aviso = document.getElementById('ins-aviso-paquete');
  if (aviso) {
    if (c.es_paquete) {
      const incluidos = (c.cursos_incluidos||[]).length || 4;
      aviso.style.display = 'block';
      aviso.innerHTML = `<i class="ti ti-package"></i> Este es el paquete completo. Al inscribir se apartará el lugar en los ${incluidos} cursos automáticamente, con pago único de ${fmtM(c.precio||0)}.`;
    } else {
      aviso.style.display = 'none';
    }
  }
  om('inscribir');
}

function calcResto() {
  const cursoId = document.getElementById('ins-curso-id').value;
  const c = CURSOS.find(x=>x.id===cursoId); if(!c) return;
  const ant = parseFloat(document.getElementById('ins-anticipo').value)||0;
  document.getElementById('ins-resto').value = fmtM((c.precio||0)-ant);
}

function buscarAlumnoInsc(q) {
  const cont = document.getElementById('ins-resultados');
  q = (q||'').trim().toLowerCase();
  if(q.length<2){cont.style.display='none';return;}
  const qNum = q.replace(/[^0-9]/g,'');
  const res = PACS.filter(p=>{
    const nom=(p.nombre||'').toLowerCase();
    const tel=(p.tel||'').replace(/[^0-9]/g,'');
    return nom.includes(q)||(qNum.length>=3&&tel.includes(qNum));
  }).slice(0,6);
  if(!res.length){cont.innerHTML='<div style="padding:10px 12px;font-size:12px;color:var(--text-ter)">Sin coincidencias — regístralo abajo</div>';cont.style.display='block';return;}
  cont.innerHTML = res.map(p=>`<div onclick="selAlumnoInsc('${p.id}')" style="padding:9px 12px;cursor:pointer;border-bottom:.5px solid var(--border);font-size:13px" onmouseover="this.style.background='var(--bg-sec)'" onmouseout="this.style.background='white'"><div style="font-weight:500">${p.nombre}</div><div style="font-size:11px;color:var(--text-ter)">${p.tel||'sin tel'}</div></div>`).join('');
  cont.style.display='block';
}

function selAlumnoInsc(pacId) {
  const p = PACS.find(x=>x.id===pacId); if(!p) return;
  insAlumnoSel = p;
  document.getElementById('ins-nombre').value = p.nombre||'';
  document.getElementById('ins-tel').value = p.tel||'';
  document.getElementById('ins-resultados').style.display='none';
  document.getElementById('ins-buscar').value='';
}

async function guardarInscripcion() {
  const cursoId = document.getElementById('ins-curso-id').value;
  const c = CURSOS.find(x=>x.id===cursoId); if(!c) return;
  const nombre = document.getElementById('ins-nombre').value.trim();
  const tel = document.getElementById('ins-tel').value.trim();
  if(!nombre){toast('⚠ El nombre es obligatorio');return;}
  const anticipo = parseFloat(document.getElementById('ins-anticipo').value)||0;
  const telNorm = tel.replace(/[^0-9]/g,'').slice(-10);

  // ---- Si es PAQUETE: usar la función que inscribe en los 4 cursos ----
  if (c.es_paquete) {
    try {
      const r = await sb('inscribir_paquete','POST',{
        p_paquete_id: cursoId,
        p_nombre: nombre,
        p_tel: telNorm,
        p_anticipo: anticipo,
        p_notas: document.getElementById('ins-notas').value
      },'');
      const res = Array.isArray(r) ? (r[0]?.inscribir_paquete || r[0]) : (r.inscribir_paquete || r);
      if (res && res.ok === false) { toast('⚠ '+res.mensaje); return; }
      // Recargar inscripciones para reflejar los 4 cursos + el paquete
      await cargarCursos();
      cm('inscribir'); renderCursos();
      toast('✓ '+(res?.mensaje || nombre+' inscrito en el paquete'));
    } catch(e){ toast('⚠ Error: '+e.message); }
    return;
  }

  // ---- Inscripción normal a un solo curso ----
  if(inscritosDe(cursoId).length >= c.cupo){toast('⚠ El curso ya está lleno');return;}

  // Buscar/crear alumno
  let pac = insAlumnoSel;
  if(!pac && telNorm) pac = PACS.find(p=>(p.tel||'').replace(/[^0-9]/g,'').slice(-10)===telNorm);
  if(!pac) pac = PACS.find(p=>p.nombre.toLowerCase().trim()===nombre.toLowerCase().trim());
  if(!pac){
    pac={id:uid(),nombre,tel:telNorm,fecha_reg:hoy(),doctor_id:doctorActual?.id};
    try{await sb('pacientes','POST',pac);PACS.unshift(pac);}catch(e){toast('⚠ Error: '+e.message);return;}
  }

  const insc = {
    id: uid(), curso_id: cursoId, curso_nombre: c.nombre,
    pac_id: pac.id, alumno_nombre: nombre, alumno_tel: telNorm,
    modalidad: c.modalidad, precio_total: c.precio||0,
    anticipo_pagado: anticipo, resto_pendiente: (c.precio||0)-anticipo,
    estado: anticipo>=(c.precio||0)?'Pagado':'Apartado',
    origen: 'manual', notas: document.getElementById('ins-notas').value,
    fecha_inscripcion: hoy(), doctor_id: doctorActual?.id
  };
  try {
    await sb('inscripciones','POST',insc);
    INSCRIPCIONES.unshift(insc);
    cm('inscribir'); renderCursos();
    toast('✓ '+nombre+' inscrito en '+c.nombre);
  } catch(e){toast('⚠ Error: '+e.message);}
}

/* ---- Ver inscritos ---- */
function verInscritos(cursoId) {
  const c = CURSOS.find(x=>x.id===cursoId); if(!c) return;
  window._inscCursoActual = cursoId;
  document.getElementById('insc-curso-tit').textContent = c.nombre;
  const lista = inscritosDe(cursoId);
  const cont = document.getElementById('insc-lista');
  if(!lista.length){
    cont.innerHTML='<div class="empty"><i class="ti ti-users-off"></i>Sin inscritos todavía</div>';
  } else {
    cont.innerHTML = lista.map(i=>{
      const estBg = i.estado==='Pagado'?'var(--gl)':i.estado==='Cursando'?'var(--gl)':i.estado==='Prospecto'?'var(--aul)':'var(--aul)';
      const estColor = i.estado==='Pagado'?'var(--g)':i.estado==='Cursando'?'var(--g)':'var(--aud)';
      const resto = Number(i.resto_pendiente||0);
      return `
      <div style="padding:12px 0;border-bottom:.5px solid var(--border)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">${i.alumno_nombre}</div>
            <div style="font-size:11px;color:var(--text-ter)">${i.alumno_tel||'sin tel'} · ${i.origen==='whatsapp'?'📱 WhatsApp':'✍️ Manual'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px"><span style="color:var(--g);font-weight:600">Pagó ${fmtM(i.anticipo_pagado||0)}</span>${resto>0?` <span style="color:var(--text-ter)">· falta ${fmtM(resto)}</span>`:''}</div>
            <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${estBg};color:${estColor}">${i.estado}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          ${resto>0?`<button class="btn btn-sm btn-g" onclick="cobrarInscrito('${i.id}')"><i class="ti ti-cash"></i> Cobrar</button>`:'<span style="font-size:11px;color:var(--g);align-self:center"><i class="ti ti-check"></i> Pagado completo</span>'}
          <button class="btn btn-sm" onclick="editarInscrito('${i.id}')"><i class="ti ti-edit"></i></button>
          <button class="btn btn-sm" onclick="eliminarInscrito('${i.id}')" style="color:#A32D2D"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  }
  om('inscritos');
}

async function cobrarInscrito(inscId) {
  const i = (INSCRIPCIONES||[]).find(x=>x.id===inscId); if(!i) return;
  const resto = Number(i.resto_pendiente||0);
  if(resto<=0){ toast('Esta inscripción ya está pagada'); return; }
  const abono = prompt(`${i.alumno_nombre}\nFalta por pagar: ${fmtM(resto)}\n\n¿Cuánto abona ahora?`, resto);
  if(abono===null) return;
  const monto = parseFloat(abono)||0;
  if(monto<=0) return;
  const nuevoAnticipo = Number(i.anticipo_pagado||0)+monto;
  const nuevoResto = Math.max(0, resto-monto);
  const nuevoEstado = nuevoResto<=0 ? 'Pagado' : 'Cursando';
  try {
    await sb('inscripciones','PATCH',{anticipo_pagado:nuevoAnticipo,resto_pendiente:nuevoResto,estado:nuevoEstado},`?id=eq.${inscId}`);
    i.anticipo_pagado=nuevoAnticipo; i.resto_pendiente=nuevoResto; i.estado=nuevoEstado;
    // Registrar el cobro en caja también
    try {
      await sb('cobros','POST',{id:uid(),pac_id:i.pac_id,pac_nombre:i.alumno_nombre,concepto:'Curso: '+i.curso_nombre,monto,metodo:'Efectivo',fecha:hoy(),doctor_id:doctorActual?.id,created_at:new Date().toISOString()});
    } catch(e){}
    verInscritos(window._inscCursoActual);
    renderCursos();
    toast('✓ Cobro registrado: '+fmtM(monto));
  } catch(e){ toast('⚠ Error: '+e.message); }
}

function editarInscrito(inscId) {
  const i = (INSCRIPCIONES||[]).find(x=>x.id===inscId); if(!i) return;
  const nuevoNombre = prompt('Nombre del alumno:', i.alumno_nombre);
  if(nuevoNombre===null) return;
  const nuevoTel = prompt('Teléfono:', i.alumno_tel||'');
  if(nuevoTel===null) return;
  sb('inscripciones','PATCH',{alumno_nombre:nuevoNombre.trim(),alumno_tel:nuevoTel.trim()},`?id=eq.${inscId}`)
    .then(()=>{
      i.alumno_nombre=nuevoNombre.trim(); i.alumno_tel=nuevoTel.trim();
      verInscritos(window._inscCursoActual);
      toast('✓ Datos actualizados');
    }).catch(e=>toast('⚠ Error: '+e.message));
}

async function eliminarInscrito(inscId) {
  const i = (INSCRIPCIONES||[]).find(x=>x.id===inscId); if(!i) return;
  if(!confirm(`¿Eliminar a ${i.alumno_nombre} de este curso?\n\nEsto libera su lugar. No se puede deshacer.`)) return;
  try {
    await sb('inscripciones','DELETE',null,`?id=eq.${inscId}`);
    INSCRIPCIONES = INSCRIPCIONES.filter(x=>x.id!==inscId);
    verInscritos(window._inscCursoActual);
    renderCursos();
    toast('✓ Inscrito eliminado, lugar liberado');
  } catch(e){ toast('⚠ Error: '+e.message); }
}

/* ============================================================
   PANEL DE ADMIN — Dashboard, CRM, Inscripciones,
   Comprobantes, Promociones, Config Agente
   ============================================================ */
let COMPROBANTES = [], PROMOS = [], DASHBOARD = {}, compContactoSel = null;

async function cargarPanelAdmin() {
  try {
    const [comps, promos] = await Promise.all([
      sb('comprobantes','GET',null,'?order=created_at.desc').catch(()=>[]),
      sb('promociones','GET',null,'?order=created_at.desc').catch(()=>[]),
    ]);
    COMPROBANTES = comps||[];
    PROMOS = promos||[];
    const nbcrm = document.getElementById('nb-crm');
    if (nbcrm) nbcrm.textContent = PACS.length;
  } catch(e){}
}

/* ---- DASHBOARD ---- */
async function renderDashboard() {
  try {
    const r = await sb('dashboard_resumen','POST',{},'');
    DASHBOARD = Array.isArray(r) ? r[0]?.dashboard_resumen || r[0] : r;
  } catch(e) {
    // Fallback: calcular local
    DASHBOARD = calcDashboardLocal();
  }
  if (!DASHBOARD || Object.keys(DASHBOARD).length===0) DASHBOARD = calcDashboardLocal();

  const d = DASHBOARD;
  document.getElementById('db-ing-mes').textContent = fmtM(d.ingresos_mes||0);
  document.getElementById('db-ing-hoy').textContent = 'hoy: '+fmtM(d.ingresos_hoy||0);
  document.getElementById('db-citas-mes').textContent = d.citas_mes||0;
  document.getElementById('db-citas-hoy').textContent = (d.citas_hoy||0)+' hoy';
  document.getElementById('db-pacientes').textContent = d.total_pacientes||0;
  document.getElementById('db-pac-wa').textContent = (d.pacientes_whatsapp||0)+' por WhatsApp';
  document.getElementById('db-anticipos').textContent = fmtM(d.anticipos_pendientes||0);
  document.getElementById('db-wa-mes').textContent = d.citas_whatsapp_mes||0;
  document.getElementById('db-manual-mes').textContent = d.citas_manual_mes||0;
  document.getElementById('db-cursos').textContent = d.cursos_activos||0;
  document.getElementById('db-insc-mes').textContent = (d.inscripciones_mes||0)+' inscripciones este mes';

  // Barra de efectividad WhatsApp vs manual
  const wa = d.citas_whatsapp_mes||0, man = d.citas_manual_mes||0, tot = wa+man;
  const pctWa = tot>0 ? Math.round(wa/tot*100) : 0;
  document.getElementById('db-agente-barra').innerHTML = tot===0
    ? '<div style="font-size:12px;color:var(--text-ter)">Sin citas este mes todavía</div>'
    : `<div style="display:flex;height:32px;border-radius:8px;overflow:hidden;font-size:11px;font-weight:600">
        <div style="background:#25D366;color:white;width:${pctWa}%;display:flex;align-items:center;justify-content:center;min-width:${pctWa>0?'40px':'0'}">${pctWa>0?pctWa+'%':''}</div>
        <div style="background:var(--g);color:white;width:${100-pctWa}%;display:flex;align-items:center;justify-content:center">${100-pctWa>0?(100-pctWa)+'%':''}</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-sec);margin-top:6px">
        <span>🟢 WhatsApp: ${wa} citas</span><span>Manual: ${man} citas</span>
      </div>`;
}

function calcDashboardLocal() {
  const h = hoy();
  const mesIni = h.slice(0,7)+'-01';
  const citasMes = CITAS.filter(c=>c.fecha>=mesIni && c.estado!=='Cancelada');
  return {
    citas_hoy: CITAS.filter(c=>c.fecha===h && c.estado!=='Cancelada').length,
    citas_mes: citasMes.length,
    citas_whatsapp_mes: citasMes.filter(c=>c.origen==='whatsapp').length,
    citas_manual_mes: citasMes.filter(c=>c.origen!=='whatsapp').length,
    ingresos_mes: COBROS.filter(c=>c.fecha>=mesIni).reduce((s,c)=>s+Number(c.monto||0),0),
    ingresos_hoy: COBROS.filter(c=>c.fecha===h).reduce((s,c)=>s+Number(c.monto||0),0),
    total_pacientes: PACS.length,
    pacientes_whatsapp: PACS.filter(p=>p.origen==='whatsapp').length,
    cursos_activos: (CURSOS||[]).filter(c=>c.activo).length,
    inscripciones_mes: (INSCRIPCIONES||[]).filter(i=>i.estado!=='Cancelado').length,
    anticipos_pendientes: (INSCRIPCIONES||[]).filter(i=>['Apartado','Cursando'].includes(i.estado)).reduce((s,i)=>s+Number(i.resto_pendiente||0),0),
  };
}

/* ---- CRM ---- */
function renderCRM() {
  const tipo = document.getElementById('crm-filtro')?.value||'';
  const origen = document.getElementById('crm-origen')?.value||'';
  let lista = PACS.slice();
  if (tipo) lista = lista.filter(p=>(p.tipo||'paciente')===tipo);
  if (origen) lista = lista.filter(p=>(p.origen||'manual')===origen);
  window._crmLista = lista;
  pintarCRM(lista);
}

function pintarCRM(lista) {
  const tb = document.getElementById('tb-crm');
  if (!lista.length){tb.innerHTML='<tr><td colspan="7"><div class="empty"><i class="ti ti-address-book"></i>Sin contactos</div></td></tr>';return;}
  tb.innerHTML = lista.map(p=>{
    const nCitas = CITAS.filter(c=>c.pac_id===p.id).length;
    const pagado = COBROS.filter(c=>c.pac_id===p.id).reduce((s,c)=>s+Number(c.monto||0),0);
    const tipo = p.tipo||'paciente';
    const tipoColor = tipo==='alumno'?'#185FA5':tipo==='prospecto'?'#A07812':'var(--g)';
    const tipoBg = tipo==='alumno'?'#E6F1FB':tipo==='prospecto'?'var(--aul)':'var(--gl)';
    const origen = p.origen||'manual';
    return `<tr>
      <td><div style="display:flex;align-items:center"><div class="av">${ini2(p.nombre)}</div>${p.nombre}</div></td>
      <td><span style="font-size:10px;padding:2px 7px;border-radius:8px;background:${tipoBg};color:${tipoColor};text-transform:capitalize">${tipo}</span></td>
      <td class="hide-sm">${origen==='whatsapp'?'<span style="color:#25D366">📱 WA</span>':'Manual'}</td>
      <td class="hide-sm">${p.tel||'—'}</td>
      <td>${nCitas}</td>
      <td class="hide-sm">${fmtM(pagado)}</td>
      <td><button class="ra" onclick="verContactoCRM('${p.id}')"><i class="ti ti-eye"></i></button></td>
    </tr>`;
  }).join('');
}

function filtrarCRM(q) {
  q=(q||'').toLowerCase();
  const base = window._crmLista||PACS;
  pintarCRM(base.filter(p=>p.nombre.toLowerCase().includes(q)||(p.tel||'').includes(q)));
}

function verContactoCRM(id) {
  const p = PACS.find(x=>x.id===id); if(!p) return;
  const nCitas = CITAS.filter(c=>c.pac_id===id).length;
  const nInsc = (INSCRIPCIONES||[]).filter(i=>i.pac_id===id).length;
  const pagado = COBROS.filter(c=>c.pac_id===id).reduce((s,c)=>s+Number(c.monto||0),0);
  toast(`${p.nombre}: ${nCitas} citas, ${nInsc} cursos, ${fmtM(pagado)} pagado`);
}

/* ---- INSCRIPCIONES (vista admin global) ---- */
function renderInscripciones() {
  const activas = (INSCRIPCIONES||[]).filter(i=>i.estado!=='Cancelado');
  document.getElementById('ins-total').textContent = activas.length;
  document.getElementById('ins-anticipos').textContent = fmtM(activas.reduce((s,i)=>s+Number(i.anticipo_pagado||0),0));
  document.getElementById('ins-pendiente').textContent = fmtM(activas.reduce((s,i)=>s+Number(i.resto_pendiente||0),0));
  document.getElementById('ins-cursos').textContent = new Set(activas.map(i=>i.curso_id)).size;

  const tb = document.getElementById('tb-inscripciones');
  if(!(INSCRIPCIONES||[]).length){tb.innerHTML='<tr><td colspan="7"><div class="empty"><i class="ti ti-clipboard-off"></i>Sin inscripciones</div></td></tr>';return;}
  tb.innerHTML = INSCRIPCIONES.map(i=>{
    const estBg = i.estado==='Pagado'?'var(--gl)':i.estado==='Cancelado'?'#FCEBEB':'var(--aul)';
    const estColor = i.estado==='Pagado'?'var(--g)':i.estado==='Cancelado'?'#A32D2D':'var(--aud)';
    return `<tr>
      <td>${i.alumno_nombre}</td>
      <td class="hide-sm">${i.curso_nombre||'—'}</td>
      <td class="hide-sm">${i.origen==='whatsapp'?'<span style="color:#25D366">📱 WA</span>':'Manual'}</td>
      <td>${fmtM(i.anticipo_pagado||0)}</td>
      <td>${Number(i.resto_pendiente)>0?fmtM(i.resto_pendiente):'✓'}</td>
      <td><span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${estBg};color:${estColor}">${i.estado}</span></td>
      <td><button class="ra" onclick="abonarInscripcion('${i.id}')" title="Registrar abono"><i class="ti ti-cash"></i></button></td>
    </tr>`;
  }).join('');
}

async function abonarInscripcion(id) {
  const i = (INSCRIPCIONES||[]).find(x=>x.id===id); if(!i) return;
  const resto = Number(i.resto_pendiente||0);
  if(resto<=0){toast('Esta inscripción ya está pagada');return;}
  const abono = prompt(`Resto pendiente: ${fmtM(resto)}\n¿Cuánto abona ahora?`, resto);
  if(abono===null) return;
  const monto = parseFloat(abono)||0;
  if(monto<=0) return;
  const nuevoAnticipo = Number(i.anticipo_pagado||0)+monto;
  const nuevoResto = Math.max(0, resto-monto);
  const nuevoEstado = nuevoResto<=0 ? 'Pagado' : i.estado;
  try {
    await sb('inscripciones','PATCH',{anticipo_pagado:nuevoAnticipo,resto_pendiente:nuevoResto,estado:nuevoEstado},`?id=eq.${id}`);
    i.anticipo_pagado=nuevoAnticipo; i.resto_pendiente=nuevoResto; i.estado=nuevoEstado;
    renderInscripciones();
    toast('✓ Abono registrado: '+fmtM(monto));
  } catch(e){toast('⚠ Error: '+e.message);}
}

/* ---- COMPROBANTES ---- */
function renderComprobantes() {
  const tb = document.getElementById('tb-comprobantes');
  if(!COMPROBANTES.length){tb.innerHTML='<tr><td colspan="7"><div class="empty"><i class="ti ti-receipt-off"></i>Sin comprobantes registrados</div></td></tr>';return;}
  tb.innerHTML = COMPROBANTES.map(c=>{
    const estBg=c.estado==='Verificado'?'var(--gl)':c.estado==='Rechazado'?'#FCEBEB':'var(--aul)';
    const estColor=c.estado==='Verificado'?'var(--g)':c.estado==='Rechazado'?'#A32D2D':'var(--aud)';
    return `<tr>
      <td>${fmtF(c.fecha_pago)}</td>
      <td>${c.pac_nombre||'—'}</td>
      <td>${fmtM(c.monto||0)}</td>
      <td class="hide-sm">${c.referencia||'—'}</td>
      <td class="hide-sm">${c.banco||'—'}</td>
      <td><span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${estBg};color:${estColor}">${c.estado}</span></td>
      <td style="white-space:nowrap">
        ${c.estado!=='Verificado'?`<button class="ra" onclick="verificarComprobante('${c.id}',true)" title="Verificar" style="color:var(--g)"><i class="ti ti-check"></i></button>`:''}
        ${c.imagen_url?`<button class="ra" onclick="verImagenComp('${c.id}')" title="Ver imagen"><i class="ti ti-photo"></i></button>`:''}
      </td>
    </tr>`;
  }).join('');
}

function abrirNuevoComprobante() {
  compContactoSel=null;
  ['comp-buscar','comp-nombre','comp-monto','comp-ref','comp-banco','comp-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('comp-fecha').value=hoy();
  document.getElementById('comp-resultados').style.display='none';
  om('comprobante');
}

function buscarContactoComp(q){
  const cont=document.getElementById('comp-resultados');
  q=(q||'').trim().toLowerCase();
  if(q.length<2){cont.style.display='none';return;}
  const res=PACS.filter(p=>p.nombre.toLowerCase().includes(q)||(p.tel||'').includes(q)).slice(0,6);
  if(!res.length){cont.style.display='none';return;}
  cont.innerHTML=res.map(p=>`<div onclick="selContactoComp('${p.id}')" style="padding:9px 12px;cursor:pointer;border-bottom:.5px solid var(--border);font-size:13px" onmouseover="this.style.background='var(--bg-sec)'" onmouseout="this.style.background='white'">${p.nombre}<div style="font-size:11px;color:var(--text-ter)">${p.tel||''}</div></div>`).join('');
  cont.style.display='block';
}
function selContactoComp(id){
  const p=PACS.find(x=>x.id===id);if(!p)return;
  compContactoSel=p;
  document.getElementById('comp-nombre').value=p.nombre;
  document.getElementById('comp-resultados').style.display='none';
  document.getElementById('comp-buscar').value='';
}

async function guardarComprobante() {
  const nombre=document.getElementById('comp-nombre').value.trim();
  const monto=parseFloat(document.getElementById('comp-monto').value)||0;
  if(!nombre){toast('⚠ Indica el contacto');return;}
  if(monto<=0){toast('⚠ El monto debe ser mayor a 0');return;}

  const comp={
    id:uid(),
    pac_id:compContactoSel?.id||null,
    pac_nombre:nombre,
    tipo_registro:document.getElementById('comp-tipo').value,
    monto,
    fecha_pago:document.getElementById('comp-fecha').value,
    referencia:document.getElementById('comp-ref').value,
    banco:document.getElementById('comp-banco').value,
    metodo:document.getElementById('comp-metodo').value,
    estado:'Registrado',
    notas:document.getElementById('comp-notas').value,
    registrado_por:doctorActual?.nombre||''
  };

  // Imagen: convertir a base64 si hay
  const fileInput=document.getElementById('comp-img');
  if(fileInput && fileInput.files && fileInput.files[0]){
    try {
      comp.imagen_url = await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=()=>res(r.result);
        r.onerror=rej;
        r.readAsDataURL(fileInput.files[0]);
      });
    } catch(e){}
  }

  try {
    await sb('comprobantes','POST',comp);
    COMPROBANTES.unshift(comp);
    cm('comprobante'); renderComprobantes();
    toast('✓ Comprobante registrado');
  } catch(e){toast('⚠ Error: '+e.message);}
}

async function verificarComprobante(id,ok){
  try {
    await sb('comprobantes','PATCH',{estado:ok?'Verificado':'Rechazado'},`?id=eq.${id}`);
    const c=COMPROBANTES.find(x=>x.id===id); if(c) c.estado=ok?'Verificado':'Rechazado';
    renderComprobantes();
    toast(ok?'✓ Comprobante verificado':'Comprobante rechazado');
  } catch(e){toast('⚠ Error: '+e.message);}
}

function verImagenComp(id){
  const c=COMPROBANTES.find(x=>x.id===id);
  if(c&&c.imagen_url){
    const w=window.open('');
    w.document.write(`<img src="${c.imagen_url}" style="max-width:100%">`);
  }
}

/* ---- PROMOCIONES ---- */
function renderPromos() {
  const cont=document.getElementById('promos-lista');
  if(!PROMOS.length){cont.innerHTML='<div class="empty"><i class="ti ti-discount-off"></i>Sin promociones. Crea la primera.</div>';return;}
  cont.innerHTML=PROMOS.map(p=>`
    <div style="background:white;border:.5px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;${!p.vigente?'opacity:.6;':''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:14px;font-weight:600">${p.titulo}</span>
            ${p.vigente?'<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:var(--gl);color:var(--g)">Vigente</span>':'<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:#FCEBEB;color:#A32D2D">Inactiva</span>'}
            <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:var(--bg-sec);color:var(--text-ter);text-transform:capitalize">${p.aplica_a}</span>
          </div>
          ${p.descripcion?`<div style="font-size:12px;color:var(--text-sec);margin-top:4px">${p.descripcion}</div>`:''}
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:600;color:var(--g)">${fmtM(p.precio_promo||0)}</div>
          ${p.precio_regular?`<div style="font-size:11px;color:var(--text-ter);text-decoration:line-through">${fmtM(p.precio_regular)}</div>`:''}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:10px;padding-top:10px;border-top:.5px solid var(--border)">
        <button class="btn btn-sm" onclick="editarPromo('${p.id}')"><i class="ti ti-edit"></i> Editar</button>
        <button class="btn btn-sm" onclick="togglePromo('${p.id}',${p.vigente})"><i class="ti ti-power"></i> ${p.vigente?'Desactivar':'Activar'}</button>
      </div>
    </div>`).join('');
}

function abrirNuevaPromo(){
  document.getElementById('promo-modal-tit').textContent='Nueva promoción';
  ['promo-id','promo-titulo','promo-desc','promo-precio','promo-regular','promo-fin'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('promo-aplica').value='consulta';
  document.getElementById('promo-vigente').checked=true;
  om('promo');
}
function editarPromo(id){
  const p=PROMOS.find(x=>x.id===id);if(!p)return;
  document.getElementById('promo-modal-tit').textContent='Editar promoción';
  document.getElementById('promo-id').value=p.id;
  document.getElementById('promo-titulo').value=p.titulo||'';
  document.getElementById('promo-desc').value=p.descripcion||'';
  document.getElementById('promo-precio').value=p.precio_promo||'';
  document.getElementById('promo-regular').value=p.precio_regular||'';
  document.getElementById('promo-aplica').value=p.aplica_a||'consulta';
  document.getElementById('promo-fin').value=p.fecha_fin||'';
  document.getElementById('promo-vigente').checked=p.vigente!==false;
  om('promo');
}
async function guardarPromo(){
  const titulo=document.getElementById('promo-titulo').value.trim();
  if(!titulo){toast('⚠ El título es obligatorio');return;}
  const id=document.getElementById('promo-id').value;
  const datos={
    titulo,
    descripcion:document.getElementById('promo-desc').value,
    precio_promo:parseFloat(document.getElementById('promo-precio').value)||0,
    precio_regular:parseFloat(document.getElementById('promo-regular').value)||0,
    aplica_a:document.getElementById('promo-aplica').value,
    fecha_fin:document.getElementById('promo-fin').value||null,
    vigente:document.getElementById('promo-vigente').checked
  };
  try {
    if(id){
      await sb('promociones','PATCH',datos,`?id=eq.${id}`);
      const idx=PROMOS.findIndex(x=>x.id===id);if(idx>=0)PROMOS[idx]={...PROMOS[idx],...datos};
      toast('✓ Promoción actualizada');
    } else {
      datos.id=uid();
      await sb('promociones','POST',datos);
      PROMOS.unshift(datos);
      toast('✓ Promoción creada');
    }
    cm('promo'); renderPromos();
  } catch(e){toast('⚠ Error: '+e.message);}
}
async function togglePromo(id,vigente){
  try {
    await sb('promociones','PATCH',{vigente:!vigente},`?id=eq.${id}`);
    const p=PROMOS.find(x=>x.id===id);if(p)p.vigente=!vigente;
    renderPromos();
  } catch(e){toast('⚠ Error: '+e.message);}
}

/* ---- CONFIG AGENTE ---- */
async function renderConfigAgente() {
  try {
    const r = await sb('config_agente','GET',null,'?id=eq.baoqi-agente');
    const cfg = r&&r[0] ? r[0] : null;
    if(cfg){
      document.getElementById('agente-system').value = cfg.system_message||'';
      document.getElementById('agente-modelo').value = cfg.modelo||'gpt-4o-mini';
      document.getElementById('agente-updated').value = cfg.updated_at ? new Date(cfg.updated_at).toLocaleString('es-MX') : '—';
    }
  } catch(e){
    document.getElementById('agente-system').value='';
    document.getElementById('agente-updated').value='(tabla config_agente no encontrada)';
  }
}
async function guardarConfigAgente() {
  const datos={
    system_message:document.getElementById('agente-system').value,
    modelo:document.getElementById('agente-modelo').value,
    actualizado_por:doctorActual?.nombre||'',
    updated_at:new Date().toISOString()
  };
  try {
    await sb('config_agente','PATCH',datos,'?id=eq.baoqi-agente');
    document.getElementById('agente-updated').value=new Date().toLocaleString('es-MX');
    toast('✓ Configuración del agente guardada');
  } catch(e){toast('⚠ Error: '+e.message);}
}

/* ---- HISTÓRICO DE VERSIONES DEL SYSTEM ---- */
let HIST_SYSTEM = [];

async function verHistoricoSystem() {
  const panel = document.getElementById('agente-historico');
  const cont = document.getElementById('historico-lista');
  panel.style.display = 'block';
  cont.innerHTML = '<div style="font-size:12px;color:var(--text-ter)">Cargando...</div>';
  try {
    const r = await sb('historico_system','POST',{},'');
    HIST_SYSTEM = Array.isArray(r) ? (r[0]?.historico_system || r[0] || []) : (r.historico_system || r || []);
    if (!Array.isArray(HIST_SYSTEM)) HIST_SYSTEM = [];
  } catch(e) {
    // fallback: leer tabla directo
    try {
      HIST_SYSTEM = await sb('config_agente_historico','GET',null,'?order=created_at.desc&select=id,guardado_por,caracteres,modelo,created_at,system_message');
      HIST_SYSTEM = HIST_SYSTEM.map(h=>({...h, fecha:new Date(h.created_at).toLocaleString('es-MX'), preview:(h.system_message||'').slice(0,100)}));
    } catch(e2){ HIST_SYSTEM=[]; }
  }
  if (!HIST_SYSTEM.length) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--text-ter)">Aún no hay versiones anteriores. Se archivan automáticamente cada vez que guardas un cambio.</div>';
    return;
  }
  cont.innerHTML = HIST_SYSTEM.map((h,i)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:.5px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500">${h.fecha||'—'} <span style="color:var(--text-ter);font-weight:400">· ${h.guardado_por||'—'}</span></div>
        <div style="font-size:11px;color:var(--text-ter)">${h.caracteres||0} caracteres · ${h.modelo||'—'}</div>
      </div>
      <button class="btn btn-sm" onclick="restaurarVersion('${h.id}')"><i class="ti ti-arrow-back-up"></i> Restaurar</button>
    </div>`).join('');
}

async function restaurarVersion(id) {
  if(!confirm('¿Restaurar esta versión? La versión actual se archivará y el agente usará la restaurada.')) return;
  try {
    // Traer el system completo de esa versión
    const r = await sb('config_agente_historico','GET',null,`?id=eq.${id}&select=system_message,modelo`);
    if(!r || !r[0]) { toast('⚠ No se encontró la versión'); return; }
    const sysMsg = r[0].system_message;
    const modelo = r[0].modelo || 'gpt-4o-mini';
    // Guardar como versión actual (esto archivará la actual por el trigger)
    await sb('config_agente','PATCH',{
      system_message: sysMsg, modelo,
      actualizado_por: (doctorActual?.nombre||'')+' (restauró versión)',
      updated_at: new Date().toISOString()
    },'?id=eq.baoqi-agente');
    // Reflejar en el editor
    document.getElementById('agente-system').value = sysMsg;
    document.getElementById('agente-modelo').value = modelo;
    document.getElementById('agente-updated').value = new Date().toLocaleString('es-MX');
    toast('✓ Versión restaurada');
    verHistoricoSystem();
  } catch(e){ toast('⚠ Error: '+e.message); }
}

/* ---- CANCELAR / ELIMINAR CITAS ---- */
async function cancelarCita(citaId) {
  const cita = CITAS.find(c=>c.id===citaId); if(!cita) return;
  if(!confirm(`¿Cancelar la cita de ${cita.pac_nombre} del ${fmtF(cita.fecha)} a las ${cita.hora}?\n\nLa cita se marca como cancelada pero queda en el registro.`)) return;
  try {
    await sb('citas','PATCH',{estado:'Cancelada'},`?id=eq.${citaId}`);
    cita.estado = 'Cancelada';
    renderAgenda(); actualizarBadges();
    toast('✓ Cita cancelada');
  } catch(e){ toast('⚠ Error: '+e.message); }
}

async function eliminarCita(citaId) {
  const cita = CITAS.find(c=>c.id===citaId); if(!cita) return;
  if(!confirm(`¿ELIMINAR permanentemente la cita de ${cita.pac_nombre} del ${fmtF(cita.fecha)} a las ${cita.hora}?\n\nEsta acción no se puede deshacer. El paciente NO se elimina, solo esta cita.`)) return;
  try {
    await sb('citas','DELETE',null,`?id=eq.${citaId}`);
    CITAS = CITAS.filter(c=>c.id!==citaId);
    renderAgenda(); actualizarBadges();
    toast('✓ Cita eliminada');
  } catch(e){ toast('⚠ Error: '+e.message); }
}

function menuCita(citaId, ev) {
  ev.stopPropagation();
  // Cerrar cualquier menú abierto
  document.querySelectorAll('.cita-menu-pop').forEach(m=>m.remove());
  const cita = CITAS.find(c=>c.id===citaId); if(!cita) return;
  const pop = document.createElement('div');
  pop.className = 'cita-menu-pop';
  pop.style.cssText = 'position:absolute;right:0;top:100%;background:white;border:.5px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:50;min-width:160px;overflow:hidden';
  pop.innerHTML = `
    ${cita.estado!=='Cancelada'?`<button onclick="cancelarCita('${citaId}');this.closest('.cita-menu-pop').remove()" style="width:100%;text-align:left;padding:10px 14px;background:none;border:none;font-size:13px;cursor:pointer;color:var(--aud);display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--bg-sec)'" onmouseout="this.style.background='none'"><i class="ti ti-ban"></i> Cancelar cita</button>`:''}
    <button onclick="eliminarCita('${citaId}');this.closest('.cita-menu-pop').remove()" style="width:100%;text-align:left;padding:10px 14px;background:none;border:none;font-size:13px;cursor:pointer;color:#A32D2D;display:flex;align-items:center;gap:8px" onmouseover="this.style.background='#FCEBEB'" onmouseout="this.style.background='none'"><i class="ti ti-trash"></i> Eliminar</button>`;
  ev.currentTarget.parentElement.style.position='relative';
  ev.currentTarget.parentElement.appendChild(pop);
  // Cerrar al hacer clic fuera
  setTimeout(()=>{
    document.addEventListener('click', function cerrar(e){
      if(!pop.contains(e.target)){ pop.remove(); document.removeEventListener('click',cerrar); }
    });
  },10);
}

/* ============================================================
   RECORDATORIOS por WhatsApp vía Evolution API
   Envía uno cada 3 minutos, mensaje personalizado por cita
   ============================================================ */
let REC_CITAS = [], REC_ENVIANDO = false, REC_TIMER = null, REC_INDICE = 0;
const REC_INTERVALO_MS = 3 * 60 * 1000; // 3 minutos

function cargarRecordatorios() {
  const fecha = document.getElementById('rec-fecha').value;
  if (!fecha) return;
  // Citas de ese día que no estén canceladas
  REC_CITAS = CITAS.filter(c => c.fecha === fecha && c.estado !== 'Cancelada')
                   .sort((a,b) => a.hora.localeCompare(b.hora))
                   .map(c => ({...c, _rec_estado: 'pendiente'}));
  renderRecordatorios();
}

function renderRecordatorios() {
  const tb = document.getElementById('tb-recordatorios');
  if (!REC_CITAS.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><i class="ti ti-bell-off"></i>Sin citas para recordar en esta fecha</div></td></tr>';
    return;
  }
  tb.innerHTML = REC_CITAS.map((c,i) => {
    const pac = PACS.find(p=>p.id===c.pac_id) || {};
    const tel = c.tel_contacto || pac.tel || '';
    const sinTel = !tel;
    let pill;
    if (c._rec_estado === 'enviado') pill = '<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:var(--gl);color:var(--g)"><i class="ti ti-check"></i> Enviado</span>';
    else if (c._rec_estado === 'error') pill = '<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:#FCEBEB;color:#A32D2D">Error</span>';
    else if (c._rec_estado === 'enviando') pill = '<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:var(--aul);color:var(--aud)">Enviando...</span>';
    else if (sinTel) pill = '<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:#FCEBEB;color:#A32D2D">Sin teléfono</span>';
    else pill = '<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:var(--bg-sec);color:var(--text-ter)">Pendiente</span>';
    return `<tr>
      <td style="font-weight:600">${c.hora}</td>
      <td>${c.pac_nombre||pac.nombre||'—'}</td>
      <td class="hide-sm">${tel||'—'}</td>
      <td>${pill}</td>
      <td>${!sinTel && c._rec_estado!=='enviado' ? `<button class="ra" onclick="enviarUnoManual(${i})" title="Enviar solo este"><i class="ti ti-send"></i></button>`:''}</td>
    </tr>`;
  }).join('');
}

// Construye el mensaje personalizado para cada cita
function armarMensajeRecordatorio(cita) {
  const pac = PACS.find(p=>p.id===cita.pac_id) || {};
  const nombre = (cita.pac_nombre||pac.nombre||'').split(' ')[0] || 'Hola';
  const fechaNat = fmtFechaNatural(cita.fecha);
  return `¡Hola ${nombre}! 🌿 Le recordamos su cita en BAOQI Centro de Bienestar Integral.\n\n📅 ${fechaNat}\n🕐 ${cita.hora} hrs\n📍 Playa Bonita 20, Jardines de Morelos, Ecatepec\n\nLe pedimos llegar puntual y con ropa cómoda. Si necesita reagendar, respóndanos por aquí. ¡Le esperamos! 😊`;
}

function fmtFechaNatural(iso) {
  const dias=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const d=new Date(iso+'T12:00:00');
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`;
}

// Normaliza teléfono a formato Evolution (52 + 10 dígitos)
function telParaEvolution(tel) {
  let t = (tel||'').replace(/[^0-9]/g,'');
  t = t.slice(-10); // últimos 10 dígitos
  return '52' + t;  // código de México
}

// Envío individual a Evolution API
async function enviarWhatsApp(numero, mensaje) {
  const url = `${EVO_URL}/message/sendText/${EVO_INSTANCIA}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVO_APIKEY
    },
    body: JSON.stringify({
      number: numero,
      text: mensaje
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

// Enviar UNO manualmente (botón individual, sin cola)
async function enviarUnoManual(i) {
  const cita = REC_CITAS[i];
  const pac = PACS.find(p=>p.id===cita.pac_id) || {};
  const tel = cita.tel_contacto || pac.tel || '';
  if (!tel) { toast('⚠ Este paciente no tiene teléfono'); return; }
  cita._rec_estado = 'enviando'; renderRecordatorios();
  try {
    await enviarWhatsApp(telParaEvolution(tel), armarMensajeRecordatorio(cita));
    cita._rec_estado = 'enviado';
    toast('✓ Recordatorio enviado a '+(cita.pac_nombre||pac.nombre));
  } catch(e) {
    cita._rec_estado = 'error';
    toast('⚠ Error al enviar: '+e.message);
  }
  renderRecordatorios();
}

// Iniciar la COLA de envíos cada 3 minutos
function iniciarEnvioRecordatorios() {
  const pendientes = REC_CITAS.filter(c => {
    const pac = PACS.find(p=>p.id===c.pac_id)||{};
    const tel = c.tel_contacto || pac.tel || '';
    return tel && c._rec_estado !== 'enviado';
  });
  if (!pendientes.length) { toast('No hay recordatorios pendientes por enviar'); return; }
  if (!confirm(`Se enviarán ${pendientes.length} recordatorios, uno cada 3 minutos.\n\nTiempo estimado: ${(pendientes.length-1)*3} minutos.\nMantén esta pestaña abierta. ¿Continuar?`)) return;

  REC_ENVIANDO = true;
  REC_INDICE = 0;
  document.getElementById('rec-btn-enviar').style.display = 'none';
  document.getElementById('rec-btn-detener').style.display = 'inline-flex';
  document.getElementById('rec-progreso').style.display = 'block';
  enviarSiguienteEnCola();
}

async function enviarSiguienteEnCola() {
  if (!REC_ENVIANDO) return;
  // Buscar la siguiente cita pendiente con teléfono
  const cola = REC_CITAS.filter(c => {
    const pac = PACS.find(p=>p.id===c.pac_id)||{};
    const tel = c.tel_contacto || pac.tel || '';
    return tel && c._rec_estado !== 'enviado' && c._rec_estado !== 'error';
  });
  const total = REC_CITAS.filter(c=>{
    const pac=PACS.find(p=>p.id===c.pac_id)||{};
    return (c.tel_contacto||pac.tel);
  }).length;
  const enviados = REC_CITAS.filter(c=>c._rec_estado==='enviado').length;

  if (!cola.length) {
    // Terminó
    finalizarEnvio();
    document.getElementById('rec-progreso-txt').textContent = '✓ Todos los recordatorios enviados';
    document.getElementById('rec-progreso-cont').textContent = `${enviados}/${total}`;
    document.getElementById('rec-progreso-barra').style.width = '100%';
    document.getElementById('rec-siguiente').textContent = '';
    toast('✓ Envío completado: '+enviados+' recordatorios');
    return;
  }

  const cita = cola[0];
  const pac = PACS.find(p=>p.id===cita.pac_id) || {};
  const tel = cita.tel_contacto || pac.tel || '';

  cita._rec_estado = 'enviando';
  renderRecordatorios();
  document.getElementById('rec-progreso-txt').textContent = `Enviando a ${cita.pac_nombre||pac.nombre}...`;
  document.getElementById('rec-progreso-cont').textContent = `${enviados}/${total}`;
  document.getElementById('rec-progreso-barra').style.width = Math.round(enviados/total*100)+'%';

  try {
    await enviarWhatsApp(telParaEvolution(tel), armarMensajeRecordatorio(cita));
    cita._rec_estado = 'enviado';
  } catch(e) {
    cita._rec_estado = 'error';
    toast('⚠ Error con '+(cita.pac_nombre||pac.nombre)+': '+e.message);
  }
  renderRecordatorios();

  // ¿Quedan más? Programar el siguiente en 3 minutos
  const restantes = REC_CITAS.filter(c => {
    const p = PACS.find(x=>x.id===c.pac_id)||{};
    const t = c.tel_contacto || p.tel || '';
    return t && c._rec_estado !== 'enviado' && c._rec_estado !== 'error';
  });

  if (restantes.length && REC_ENVIANDO) {
    // Cuenta regresiva visual
    let seg = REC_INTERVALO_MS/1000;
    document.getElementById('rec-siguiente').textContent = `Siguiente envío en ${Math.floor(seg/60)}:${String(seg%60).padStart(2,'0')} min...`;
    const cuenta = setInterval(()=>{
      seg--;
      const el = document.getElementById('rec-siguiente');
      if(el) el.textContent = `Siguiente envío en ${Math.floor(seg/60)}:${String(seg%60).padStart(2,'0')} min...`;
      if(seg<=0) clearInterval(cuenta);
    },1000);
    REC_TIMER = setTimeout(()=>{ clearInterval(cuenta); enviarSiguienteEnCola(); }, REC_INTERVALO_MS);
  } else {
    finalizarEnvio();
    const en = REC_CITAS.filter(c=>c._rec_estado==='enviado').length;
    document.getElementById('rec-progreso-txt').textContent = '✓ Envío finalizado';
    document.getElementById('rec-progreso-barra').style.width = '100%';
    document.getElementById('rec-siguiente').textContent = '';
    toast('✓ Envío completado: '+en+' recordatorios');
  }
}

function detenerEnvio() {
  if (REC_TIMER) clearTimeout(REC_TIMER);
  finalizarEnvio();
  toast('Envío detenido');
  document.getElementById('rec-progreso-txt').textContent = 'Envío detenido';
  document.getElementById('rec-siguiente').textContent = '';
}

function finalizarEnvio() {
  REC_ENVIANDO = false;
  if (REC_TIMER) { clearTimeout(REC_TIMER); REC_TIMER = null; }
  document.getElementById('rec-btn-enviar').style.display = 'inline-flex';
  document.getElementById('rec-btn-detener').style.display = 'none';
}

/* ============================================================
   ATENCIÓN WHATSAPP — contactos pausados
   ============================================================ */
let PAUSADOS = [];

async function cargarPausados() {
  try {
    PAUSADOS = await sb('contactos_pausados','GET',null,'?pausado=eq.true&order=pausado_desde.desc') || [];
    const nb = document.getElementById('nb-atencion');
    if (nb) nb.textContent = PAUSADOS.length;
  } catch(e) { PAUSADOS = []; }
}

function telLegible(t) {
  // Quitar el @s.whatsapp.net y dejar solo dígitos legibles
  const num = (t||'').replace('@s.whatsapp.net','').replace('@c.us','').replace(/[^0-9]/g,'');
  return num.slice(-10); // últimos 10 dígitos
}

function renderPausados() {
  const tb = document.getElementById('tb-atencion');
  if (!tb) return;
  if (!PAUSADOS.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><i class="ti ti-robot"></i>El agente está activo con todos los contactos. Ninguno en atención humana.</div></td></tr>';
    return;
  }
  tb.innerHTML = PAUSADOS.map(p => {
    const desde = p.pausado_desde ? new Date(p.pausado_desde).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
    return `<tr>
      <td><div style="display:flex;align-items:center"><div class="av" style="background:var(--aud)"><i class="ti ti-user"></i></div>${p.contacto_nombre||telLegible(p.telefono)}</div></td>
      <td class="hide-sm">${telLegible(p.telefono)}</td>
      <td style="font-size:12px;color:var(--text-sec)">${desde}</td>
      <td><span style="font-size:10px;padding:2px 8px;border-radius:8px;background:var(--aul);color:var(--aud)"><i class="ti ti-hand-stop"></i> Pausado</span></td>
      <td><button class="btn btn-sm btn-g" onclick="reactivarContacto('${p.telefono}')"><i class="ti ti-robot"></i> Reactivar</button></td>
    </tr>`;
  }).join('');
}

async function reactivarContacto(telefono) {
  if (!confirm('¿Reactivar el agente para este contacto? El bot volverá a responderle automáticamente.')) return;
  try {
    // Llamar la función RPC reactivar_agente
    await sb('reactivar_agente','POST',{p_telefono:telefono},'');
    PAUSADOS = PAUSADOS.filter(p => p.telefono !== telefono);
    renderPausados();
    const nb = document.getElementById('nb-atencion');
    if (nb) nb.textContent = PAUSADOS.length;
    toast('✓ Agente reactivado para este contacto');
  } catch(e) {
    // Fallback: update directo
    try {
      await sb('contactos_pausados','PATCH',{pausado:false},`?telefono=eq.${encodeURIComponent(telefono)}`);
      PAUSADOS = PAUSADOS.filter(p => p.telefono !== telefono);
      renderPausados();
      toast('✓ Agente reactivado');
    } catch(e2){ toast('⚠ Error: '+e2.message); }
  }
}

/* ============================================================
   INTERESADOS — preguntaron por cursos, para seguimiento manual
   ============================================================ */
let INTERESADOS = [];

async function cargarInteresados() {
  try {
    INTERESADOS = await sb('interesados','GET',null,'?order=ultimo_contacto.desc') || [];
    const nb = document.getElementById('nb-interesados');
    if (nb) nb.textContent = INTERESADOS.filter(i=>i.estado==='Nuevo').length;
  } catch(e) { INTERESADOS = []; }
}

function telLegibleInt(t) {
  return (t||'').replace('@s.whatsapp.net','').replace('@c.us','').replace(/[^0-9]/g,'').slice(-10);
}

function renderInteresados() {
  const filtro = document.getElementById('int-filtro')?.value || '';
  const clasif = document.getElementById('int-clasif')?.value || '';
  let lista = INTERESADOS.slice();
  if (filtro) lista = lista.filter(i=>i.estado===filtro);
  if (clasif) lista = lista.filter(i=>i.clasificacion===clasif);

  // Métricas
  document.getElementById('int-nuevos').textContent = INTERESADOS.filter(i=>i.estado==='Nuevo').length;
  document.getElementById('int-contactados').textContent = INTERESADOS.filter(i=>i.estado==='Contactado').length;
  document.getElementById('int-convertidos').textContent = INTERESADOS.filter(i=>i.estado==='Convertido').length;
  document.getElementById('int-total').textContent = INTERESADOS.length;

  const tb = document.getElementById('tb-interesados');
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><i class="ti ti-user-search"></i>Sin interesados en esta vista</div></td></tr>';
    return;
  }

  // Agrupar por tipo de interés y ordenar: herbolaria, jueves dorados, consulta, otros
  const grupos = {
    'curso_herbolaria': {label:'🌿 Cursos de herbolaria', items:[]},
    'jueves_dorados': {label:'☀️ Jueves Dorados', items:[]},
    'consulta': {label:'🩺 Consultas', items:[]},
    'otro': {label:'📋 Otros', items:[]}
  };
  lista.forEach(i=>{
    let k = i.interes;
    if (k==='curso') k='curso_herbolaria';
    if (!grupos[k]) k='otro';
    grupos[k].items.push(i);
  });

  // Dentro de cada grupo, ordenar por: interés real primero, luego nuevos
  const ordenClasif = {'interes_real':0,'solo_pregunto':1,'no_interesado':2,'':3};
  Object.values(grupos).forEach(g=>{
    g.items.sort((a,b)=>(ordenClasif[a.clasificacion||'']??3)-(ordenClasif[b.clasificacion||'']??3));
  });

  let html = '';
  for (const key of ['curso_herbolaria','jueves_dorados','consulta','otro']) {
    const g = grupos[key];
    if (!g.items.length) continue;
    // Encabezado de grupo
    html += `<tr style="background:var(--bg-sec)"><td colspan="5" style="padding:8px 12px;font-size:12px;font-weight:600;color:var(--text-sec)">${g.label} <span style="color:var(--text-ter);font-weight:400">(${g.items.length})</span></td></tr>`;
    html += g.items.map(filaInteresado).join('');
  }
  tb.innerHTML = html;
}

function filaInteresado(i) {
  const tel = telLegibleInt(i.telefono);
  const estBg = i.estado==='Nuevo'?'var(--aul)':i.estado==='Convertido'?'var(--gl)':i.estado==='Descartado'?'#FCEBEB':'var(--bg-sec)';
  const estColor = i.estado==='Nuevo'?'var(--aud)':i.estado==='Convertido'?'var(--g)':i.estado==='Descartado'?'#A32D2D':'var(--text-ter)';
  let clasBadge = '';
  if (i.clasificacion==='interes_real') clasBadge = '<span style="font-size:9px;padding:1px 6px;border-radius:6px;background:var(--gl);color:var(--g);font-weight:600">🔥 Interés real</span>';
  else if (i.clasificacion==='solo_pregunto') clasBadge = '<span style="font-size:9px;padding:1px 6px;border-radius:6px;background:var(--aul);color:var(--aud)">Solo preguntó</span>';
  else if (i.clasificacion==='no_interesado') clasBadge = '<span style="font-size:9px;padding:1px 6px;border-radius:6px;background:#FCEBEB;color:#A32D2D">No interesado</span>';
  const fecha = i.primer_contacto ? new Date(i.primer_contacto).toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) : '—';
  const waLink = `https://wa.me/52${tel}`;
  const yaContactado = i.estado==='Contactado' || i.estado==='Convertido';
  return `<tr>
    <td style="font-family:monospace;font-size:12px">${tel}</td>
    <td>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:500">${i.nombre||'<span style="color:var(--text-ter)">Sin nombre</span>'}</span>
        ${clasBadge}
      </div>
      ${i.donde_quedo?`<div style="font-size:11px;color:var(--text-sec);margin-top:2px"><i class="ti ti-message-dots" style="vertical-align:-1px"></i> ${i.donde_quedo}</div>`:''}
      ${i.accion_sugerida?`<div style="font-size:11px;color:var(--g);margin-top:2px"><i class="ti ti-arrow-right" style="vertical-align:-1px"></i> ${i.accion_sugerida}</div>`:''}
    </td>
    <td class="hide-sm" style="font-size:12px;color:var(--text-sec)">${fecha}</td>
    <td><span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${estBg};color:${estColor}">${i.estado}</span></td>
    <td style="white-space:nowrap">
      <a href="${waLink}" target="_blank" class="btn btn-sm btn-g" style="text-decoration:none" title="Contactar por WhatsApp"><i class="ti ti-brand-whatsapp"></i></a>
      <button class="btn btn-sm" onclick="marcarContactado('${i.id}')" title="${yaContactado?'Ya contactado':'Marcar como contactado'}" ${yaContactado?'style="opacity:.5"':''}><i class="ti ti-user-check"></i></button>
      <button class="btn btn-sm" onclick="eliminarInteresado('${i.id}')" title="Eliminar" style="color:#A32D2D"><i class="ti ti-trash"></i></button>
    </td>
  </tr>`;
}

async function marcarContactado(id) {
  const i = INTERESADOS.find(x=>x.id===id); if(!i) return;
  const nuevo = i.estado==='Contactado' ? 'Nuevo' : 'Contactado';
  try {
    await sb('interesados','PATCH',{estado:nuevo,contactado:nuevo==='Contactado'},`?id=eq.${id}`);
    i.estado = nuevo; i.contactado = nuevo==='Contactado';
    renderInteresados();
    const nb = document.getElementById('nb-interesados');
    if (nb) nb.textContent = INTERESADOS.filter(x=>x.estado==='Nuevo').length;
    toast(nuevo==='Contactado'?'✓ Marcado como contactado':'Regresado a nuevo');
  } catch(e){ toast('⚠ Error: '+e.message); }
}

async function eliminarInteresado(id) {
  const i = INTERESADOS.find(x=>x.id===id); if(!i) return;
  if(!confirm(`¿Eliminar a ${i.nombre||telLegibleInt(i.telefono)} de la lista de interesados?\n\nEsto no se puede deshacer.`)) return;
  try {
    await sb('interesados','DELETE',null,`?id=eq.${id}`);
    INTERESADOS = INTERESADOS.filter(x=>x.id!==id);
    renderInteresados();
    const nb = document.getElementById('nb-interesados');
    if (nb) nb.textContent = INTERESADOS.filter(x=>x.estado==='Nuevo').length;
    toast('✓ Interesado eliminado');
  } catch(e){ toast('⚠ Error: '+e.message); }
}

async function cambiarEstadoInteresado(id) {
  const i = INTERESADOS.find(x=>x.id===id); if(!i) return;
  const estados = ['Nuevo','Contactado','Convertido','Descartado'];
  const actual = estados.indexOf(i.estado);
  const siguiente = estados[(actual+1)%estados.length];
  try {
    await sb('interesados','PATCH',{estado:siguiente,contactado:siguiente!=='Nuevo'},`?id=eq.${id}`);
    i.estado = siguiente; i.contactado = siguiente!=='Nuevo';
    renderInteresados();
    const nb = document.getElementById('nb-interesados');
    if (nb) nb.textContent = INTERESADOS.filter(x=>x.estado==='Nuevo').length;
    toast('Estado: '+siguiente);
  } catch(e){ toast('⚠ Error: '+e.message); }
}

async function editarInteresado(id) {
  const i = INTERESADOS.find(x=>x.id===id); if(!i) return;
  const nombre = prompt('Nombre del interesado:', i.nombre||'');
  if(nombre===null) return;
  const notas = prompt('Notas de seguimiento:', i.notas||'');
  if(notas===null) return;
  try {
    await sb('interesados','PATCH',{nombre:nombre.trim(),notas:notas.trim()},`?id=eq.${id}`);
    i.nombre=nombre.trim(); i.notas=notas.trim();
    renderInteresados();
    toast('✓ Actualizado');
  } catch(e){ toast('⚠ Error: '+e.message); }
}
