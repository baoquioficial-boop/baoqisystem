/* =============================================
   BaoQi — app.js
   Lógica principal: pacientes, citas, caja, reportes
   ============================================= */

let PACS = [], CITAS = [], COBROS = [], NOTAS = [];
let semOffset = 0;
let soapPacId = null;

/* ============ UTILIDADES ============ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function hoy() { return new Date().toISOString().slice(0, 10); }
function fmtF(iso) { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function fmtM(n) { return '$' + Number(n).toLocaleString('es-MX'); }
function ini2(n) { const p = n.trim().split(' '); return (p[0]?.[0] || '') + (p[1]?.[0] || p[0]?.[1] || ''); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ============ CARGA INICIAL ============ */
async function cargarTodo() {
  try {
    [PACS, CITAS, COBROS, NOTAS] = await Promise.all([
      sb('pacientes', 'GET', null, '?order=created_at.desc'),
      sb('citas', 'GET', null, '?order=fecha.asc,hora.asc'),
      sb('cobros', 'GET', null, '?order=created_at.desc'),
      sb('notas_soap', 'GET', null, '?order=created_at.desc'),
    ]);
    actualizarBadges();
    renderDash();
    poblarFiltroDoctor();
  } catch (e) {
    toast('⚠ Error al cargar datos: ' + e.message);
  }
}

function actualizarBadges() {
  document.getElementById('nb-pac').textContent = PACS.length;
  document.getElementById('nb-cal').textContent = CITAS.filter(c => c.fecha === hoy()).length;
  document.getElementById('nb-caja').textContent = CITAS.filter(c => c.fecha === hoy() && c.estado === 'Pendiente').length;
}

function poblarFiltroDoctor() {
  const sel = document.getElementById('rep-doctor-fil');
  sel.innerHTML = '<option value="">Todos los doctores</option>' +
    DOCS.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
  sel.addEventListener('change', renderReporte);
}

/* ============ NAVEGACIÓN ============ */
function gp(page, el) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  document.getElementById('pg-' + page).classList.add('on');
  el.classList.add('on');
  const titles = {
    dash: 'Dashboard', cal: 'Calendario semanal', pac: 'Pacientes',
    caja: 'Caja', rep: 'Reportes', exp: 'Expedientes', admin: 'Administración'
  };
  document.getElementById('ptit').textContent = titles[page];
  if (page === 'dash') renderDash();
  if (page === 'cal') renderCal();
  if (page === 'pac') renderPacs(PACS);
  if (page === 'caja') renderCaja();
  if (page === 'rep') renderReporte();
  if (page === 'exp') renderExp();
  if (page === 'admin') renderAdmin();
}

/* ============ MODALES ============ */
function om(id) {
  document.getElementById('m-' + id).classList.add('op');
  if (id === 'cobrar' || id === 'ncita') poblarSelects();
  if (id === 'ncita') document.getElementById('cita-fecha').value = hoy();
}
function cm(id) { document.getElementById('m-' + id).classList.remove('op'); }
function sm(el) {
  el.closest('.met-g').querySelectorAll('.met').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}
function st(btn, panel) {
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');
  btn.closest('.mb').querySelectorAll('.tp').forEach(p => p.classList.remove('on'));
  document.getElementById('t-' + panel).classList.add('on');
}
document.querySelectorAll('.mw').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('op'); })
);

function poblarSelects() {
  const opts = PACS.length
    ? PACS.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')
    : '<option value="">Sin pacientes registrados</option>';
  ['cob-pac', 'cita-pac'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

function actualizarMonto() {
  const v = document.getElementById('cob-serv').value;
  document.getElementById('cob-monto').value = fmtM(v);
  document.getElementById('cob-total').textContent = fmtM(v);
}

/* ============ PACIENTES ============ */
async function guardarPaciente() {
  const nombre = document.getElementById('p-nombre').value.trim();
  if (!nombre) { toast('⚠ El nombre es obligatorio'); return; }
  const pac = {
    id: uid(), nombre,
    tel: document.getElementById('p-tel').value,
    email: document.getElementById('p-email').value,
    fnac: document.getElementById('p-fnac').value,
    sexo: document.getElementById('p-sexo').value,
    ecivil: document.getElementById('p-ecivil').value,
    ocup: document.getElementById('p-ocup').value,
    dom: document.getElementById('p-dom').value,
    resp: document.getElementById('p-resp').value,
    telemer: document.getElementById('p-telemer').value,
    motivo: document.getElementById('p-motivo').value,
    padec: document.getElementById('p-padec').value,
    padre: document.getElementById('p-padre').value,
    madre: document.getElementById('p-madre').value,
    alergias: document.getElementById('p-alerg').value,
    meds: document.getElementById('p-meds').value,
    dxbio: document.getElementById('p-dxbio').value,
    dxmtch: document.getElementById('p-dxmtch').value,
    puntos: document.getElementById('p-puntos').value,
    ta: document.getElementById('p-ta').value,
    peso: document.getElementById('p-peso').value,
    talla: document.getElementById('p-talla').value,
    lcolor: document.getElementById('p-lcolor').value,
    fecha_reg: hoy()
  };
  try {
    await sb('pacientes', 'POST', pac);
    PACS.unshift(pac);
    cm('npac');
    renderPacs(PACS);
    renderDash();
    actualizarBadges();
    toast('✓ Paciente guardado correctamente');
    document.getElementById('p-nombre').value = '';
  } catch (e) { toast('⚠ Error al guardar: ' + e.message); }
}

function renderPacs(lista) {
  const tb = document.getElementById('tb-pac');
  if (!lista.length) {
    tb.innerHTML = `<tr><td colspan="7"><div class="empty"><i class="ti ti-users-off"></i>Sin pacientes registrados aún</div></td></tr>`;
    return;
  }
  tb.innerHTML = lista.map(p => {
    const citas = CITAS.filter(c => c.pac_id === p.id);
    const ult = citas.sort((a, b) => b.fecha > a.fecha ? 1 : -1)[0];
    const edad = p.fnac ? Math.floor((new Date() - new Date(p.fnac)) / 31557600000) : '—';
    return `<tr>
      <td><div style="display:flex;align-items:center"><div class="av">${ini2(p.nombre)}</div>${p.nombre}</div></td>
      <td>${edad}/${p.sexo?.[0] || '—'}</td>
      <td>${p.tel || '—'}</td>
      <td style="white-space:normal">${p.motivo || p.dxbio || '—'}</td>
      <td>${citas.length}</td>
      <td>${ult ? fmtF(ult.fecha) : '—'}</td>
      <td><button class="ra" onclick="abrirSOAP('${p.id}','${p.nombre}')"><i class="ti ti-file-text"></i></button></td>
    </tr>`;
  }).join('');
}

function filtrarPacs(q) {
  renderPacs(PACS.filter(p =>
    p.nombre.toLowerCase().includes(q.toLowerCase()) ||
    ((p.motivo || '').toLowerCase().includes(q.toLowerCase()))
  ));
}

/* ============ CITAS ============ */
async function guardarCita() {
  const pacId = document.getElementById('cita-pac').value;
  const fecha = document.getElementById('cita-fecha').value;
  if (!pacId || !fecha) { toast('⚠ Paciente y fecha son obligatorios'); return; }
  const cita = {
    id: uid(), pac_id: pacId,
    tipo: document.getElementById('cita-tipo').value,
    fecha, hora: document.getElementById('cita-hora').value,
    motivo: document.getElementById('cita-motivo').value,
    estado: 'Pendiente', fecha_reg: hoy(),
    doctor_id: doctorActual.id,
    doctor_nombre: doctorActual.nombre
  };
  try {
    await sb('citas', 'POST', cita);
    CITAS.push(cita);
    cm('ncita');
    renderDash();
    renderCal();
    actualizarBadges();
    toast('✓ Cita guardada');
    document.getElementById('cita-motivo').value = '';
  } catch (e) { toast('⚠ Error: ' + e.message); }
}

/* ============ COBROS ============ */
async function confirmarCobro() {
  const pacId = document.getElementById('cob-pac').value;
  if (!pacId) { toast('⚠ Selecciona un paciente'); return; }
  const metEl = document.querySelector('.met.on');
  const met = metEl ? metEl.dataset.met : 'Efectivo';
  const monto = parseInt(document.getElementById('cob-serv').value) || 0;
  const serv = document.getElementById('cob-serv').options[document.getElementById('cob-serv').selectedIndex].text.split(' — ')[0];
  const pac = PACS.find(p => p.id === pacId) || { nombre: 'Paciente' };
  const folio = 'BQ-' + new Date().getFullYear() + '-' + String(COBROS.length + 1).padStart(4, '0');
  const cobro = {
    id: uid(), pac_id: pacId, pac_nombre: pac.nombre,
    serv, monto, met, fecha: hoy(),
    hora: new Date().toTimeString().slice(0, 5),
    folio, estado: 'Pagado',
    doctor_id: doctorActual.id,
    doctor_nombre: doctorActual.nombre
  };
  try {
    await sb('cobros', 'POST', cobro);
    COBROS.unshift(cobro);
    const cp = CITAS.find(c => c.pac_id === pacId && c.fecha === hoy() && c.estado === 'Pendiente');
    if (cp) {
      cp.estado = 'Pagado';
      await sb('citas', 'PATCH', { estado: 'Pagado' }, `?id=eq.${cp.id}`);
    }
    cm('cobrar');
    if (document.getElementById('gent').checked) { generarTicket(cobro); om('ticket'); }
    renderDash();
    renderCaja();
    actualizarBadges();
    toast('✓ Cobro registrado — ' + folio);
  } catch (e) { toast('⚠ Error: ' + e.message); }
}

function generarTicket(c) {
  const sig = CITAS.find(ct => ct.pac_id === c.pac_id && ct.fecha > hoy());
  document.getElementById('tk-contenido').innerHTML = `
    <div class="tk-lg">保气 · BaoQi<br>
      <span style="font-size:10px;font-weight:400;color:#666">Centro de Bienestar Integral</span>
    </div>
    <div class="tk-r"><span>Folio:</span><span>${c.folio}</span></div>
    <div class="tk-r"><span>Fecha:</span><span>${fmtF(c.fecha)} ${c.hora}</span></div>
    <div class="tk-r"><span>Paciente:</span><span>${c.pac_nombre}</span></div>
    <div class="tk-r"><span>Servicio:</span><span>${c.serv}</span></div>
    <div class="tk-r"><span>Atendió:</span><span>${c.doctor_nombre}</span></div>
    <div class="tk-r"><span>Método:</span><span>${c.met}</span></div>
    <div style="border-top:1px dashed #ccc;margin:5px 0"></div>
    <div class="tk-t"><span>Total:</span><span>${fmtM(c.monto)}</span></div>
    ${sig ? `<div class="tk-f">Próxima cita: ${fmtF(sig.fecha)} ${sig.hora || ''}</div>` : ''}
    <div class="tk-f">Gracias por su preferencia · NOM-004-SSA3-2012</div>`;
}

/* ============ NOTAS SOAP ============ */
async function guardarSOAP() {
  const nota = {
    id: uid(), pac_id: soapPacId,
    fecha: document.getElementById('soap-fecha').value,
    num: parseInt(document.getElementById('soap-num').value) || 1,
    s: document.getElementById('soap-s').value,
    o: document.getElementById('soap-o').value,
    a: document.getElementById('soap-a').value,
    p: document.getElementById('soap-p').value,
    doctor_id: doctorActual.id,
    doctor_nombre: doctorActual.nombre
  };
  try {
    await sb('notas_soap', 'POST', nota);
    NOTAS.unshift(nota);
    cm('soap');
    toast('✓ Nota SOAP guardada');
  } catch (e) { toast('⚠ Error: ' + e.message); }
}

function abrirSOAP(pacId, nombre) {
  soapPacId = pacId;
  document.getElementById('soap-titulo').textContent = 'Nota SOAP — ' + nombre;
  document.getElementById('soap-fecha').value = hoy();
  document.getElementById('soap-num').value = NOTAS.filter(n => n.pac_id === pacId).length + 1;
  ['soap-s', 'soap-o', 'soap-a', 'soap-p'].forEach(id => document.getElementById(id).value = '');
  om('soap');
}

/* ============ DASHBOARD ============ */
function renderDash() {
  const h = hoy();
  const citasH = CITAS.filter(c => c.fecha === h);
  const cobH = COBROS.filter(c => c.fecha === h);
  const pendH = citasH.filter(c => c.estado === 'Pendiente');

  document.getElementById('d-citas').textContent = citasH.length;
  document.getElementById('d-citas-sub').textContent = citasH.filter(c => c.tipo === 'Primera vez').length + ' primera vez';
  document.getElementById('d-pacs').textContent = PACS.length;
  document.getElementById('d-cobrado').textContent = fmtM(cobH.reduce((s, c) => s + c.monto, 0));
  document.getElementById('d-cobrado-sub').textContent = cobH.length + ' cobros';
  document.getElementById('d-porcobrar').textContent = fmtM(pendH.length * 400);
  document.getElementById('d-porcobrar-sub').textContent = pendH.length + ' pendientes';

  const ag = document.getElementById('agenda-hoy');
  ag.innerHTML = citasH.length
    ? citasH.sort((a, b) => a.hora > b.hora ? 1 : -1).map(c => {
        const pac = PACS.find(p => p.id === c.pac_id) || { nombre: 'Paciente' };
        const pgd = COBROS.some(cb => cb.pac_id === c.pac_id && cb.fecha === h);
        return `<div class="ai">
          <div class="at">${c.hora}</div>
          <div style="flex:1">
            <div class="an">${pac.nombre}</div>
            <div class="aty">
              <span class="tg ${c.tipo === 'Primera vez' ? 't1' : 'ts'}">${c.tipo}</span>
              · ${c.motivo || '—'}
              <span style="color:var(--text-ter)"> · ${c.doctor_nombre || ''}</span>
            </div>
          </div>
          <span class="tg ${pgd ? 'tpg' : 'tp'}">${pgd ? 'Pagado' : 'Pendiente'}</span>
        </div>`;
      }).join('')
    : '<div class="empty"><i class="ti ti-calendar-off"></i>Sin citas hoy</div>';

  const cjl = document.getElementById('caja-hoy-lista');
  cjl.innerHTML = cobH.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:11px">
        <tr>
          <th style="background:var(--bg-sec);padding:5px 8px;text-align:left;color:var(--text-sec);font-weight:500">Paciente</th>
          <th style="background:var(--bg-sec);padding:5px 8px;color:var(--text-sec);font-weight:500">Monto</th>
          <th style="background:var(--bg-sec);padding:5px 8px;color:var(--text-sec);font-weight:500">Doctor</th>
        </tr>
        ${cobH.map(c => `<tr>
          <td style="padding:5px 8px;border-top:0.5px solid var(--border)">${c.pac_nombre}</td>
          <td style="padding:5px 8px;border-top:0.5px solid var(--border)">${fmtM(c.monto)}</td>
          <td style="padding:5px 8px;border-top:0.5px solid var(--border);font-size:10px;color:var(--text-ter)">${c.doctor_nombre || '—'}</td>
        </tr>`).join('')}
      </table>`
    : '<div class="empty"><i class="ti ti-receipt-off"></i>Sin movimientos</div>';
}

/* ============ CALENDARIO ============ */
function semanaISO(off) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 + off * 7);
  return Array.from({ length: 6 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd;
  });
}

function renderCal() {
  const dias = semanaISO(semOffset);
  const h = hoy();
  const nombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const isos = dias.map(d => d.toISOString().slice(0, 10));
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  document.getElementById('cal-titulo').textContent =
    `${dias[0].getDate()} — ${dias[5].getDate()} de ${meses[dias[0].getMonth()]} ${dias[0].getFullYear()}`;

  document.getElementById('cal-head').innerHTML = '<div></div>' +
    isos.map((iso, i) => `
      <div class="cal-dh${iso === h ? ' hoy' : ''}">
        <div class="dd">${nombres[i]}</div>
        <div class="dn">${dias[i].getDate()}</div>
      </div>`).join('');

  const horas = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'];
  let body = '<div style="display:flex;flex-direction:column">' +
    horas.map(hr => `<div class="cal-slot">${hr}</div>`).join('') + '</div>';

  isos.forEach(iso => {
    const citasD = CITAS.filter(c => c.fecha === iso).sort((a, b) => a.hora > b.hora ? 1 : -1);
    let evs = ''; let top = 4;
    citasD.forEach(c => {
      const pac = PACS.find(p => p.id === c.pac_id) || { nombre: 'Paciente' };
      const pgd = COBROS.some(cb => cb.pac_id === c.pac_id && cb.fecha === iso);
      evs += `<div class="ev ${c.tipo === 'Primera vez' ? 'ev-a' : 'ev-g'}"
        style="top:${top}px;height:38px"
        onclick="abrirSOAP('${c.pac_id}','${pac.nombre}')"
        title="${pac.nombre} · ${c.doctor_nombre || ''}">
        ${pac.nombre.split(' ').slice(0, 2).join(' ')} ${pgd ? '✓' : ''}
      </div>`;
      top += 46;
    });
    body += `<div class="cal-col">${horas.map(() => '<div class="cal-cell"></div>').join('')}${evs}</div>`;
  });

  document.getElementById('cal-body').innerHTML = body;
}

function cambiarSemana(d) { semOffset += d; renderCal(); }

/* ============ CAJA ============ */
function renderCaja() {
  const h = hoy();
  const cobH = COBROS.filter(c => c.fecha === h);
  const totalH = cobH.reduce((s, c) => s + c.monto, 0);
  const pendH = CITAS.filter(c => c.fecha === h && c.estado === 'Pendiente').length;

  document.getElementById('cj-hoy').textContent = fmtM(totalH);
  document.getElementById('cj-hoy-n').textContent = cobH.length + ' cobros';
  document.getElementById('cj-pend').textContent = fmtM(pendH * 400);
  document.getElementById('cj-pend-n').textContent = pendH + ' pendientes';

  const d = new Date();
  const lun = new Date(d);
  lun.setDate(d.getDate() - d.getDay() + 1);
  document.getElementById('cj-sem').textContent = fmtM(
    COBROS.filter(c => c.fecha >= lun.toISOString().slice(0, 10)).reduce((s, c) => s + c.monto, 0)
  );
  document.getElementById('cj-mes').textContent = fmtM(
    COBROS.filter(c => c.fecha.startsWith(h.slice(0, 7))).reduce((s, c) => s + c.monto, 0)
  );

  const tb = document.getElementById('tb-caja');
  tb.innerHTML = cobH.length
    ? cobH.map(c => `<tr>
        <td>${c.hora}</td>
        <td>${c.pac_nombre}</td>
        <td>${c.serv}</td>
        <td>${fmtM(c.monto)}</td>
        <td><span class="pl pl-g">${c.met}</span></td>
        <td style="font-size:11px;color:var(--text-sec)">${c.doctor_nombre || '—'}</td>
        <td><button class="ra" onclick='generarTicket(${JSON.stringify(c)});om("ticket")'><i class="ti ti-printer"></i></button></td>
      </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty"><i class="ti ti-receipt-off"></i>Sin cobros hoy</div></td></tr>`;
}

/* ============ REPORTES ============ */
function toggleRango() {
  document.getElementById('rep-rango').style.display =
    document.getElementById('rep-periodo').value === 'rango' ? 'flex' : 'none';
}

function getRangoDates() {
  const per = document.getElementById('rep-periodo').value;
  const h = hoy();
  const d = new Date();
  let desde = h, hasta = h;
  if (per === 'semana') {
    const l = new Date(d);
    l.setDate(d.getDate() - d.getDay() + 1);
    desde = l.toISOString().slice(0, 10);
  } else if (per === 'mes') {
    desde = h.slice(0, 7) + '-01';
  } else if (per === 'rango') {
    desde = document.getElementById('rep-desde').value || h;
    hasta = document.getElementById('rep-hasta').value || h;
  }
  return { desde, hasta };
}

function renderReporte() {
  const { desde, hasta } = getRangoDates();
  const docFil = document.getElementById('rep-doctor-fil').value;
  let cobros = COBROS.filter(c => c.fecha >= desde && c.fecha <= hasta);
  if (docFil) cobros = cobros.filter(c => c.doctor_id === docFil);

  const total = cobros.reduce((s, c) => s + c.monto, 0);
  const prom = cobros.length ? Math.round(total / cobros.length) : 0;

  document.getElementById('r-total').textContent = fmtM(total);
  document.getElementById('r-sub').textContent = cobros.length + ' pagos en el período';
  document.getElementById('r-n').textContent = cobros.length;
  document.getElementById('r-prom').textContent = fmtM(prom);
  document.getElementById('r-ef').textContent = fmtM(cobros.filter(c => c.met === 'Efectivo').reduce((s, c) => s + c.monto, 0));
  document.getElementById('r-tj').textContent = fmtM(cobros.filter(c => c.met === 'Tarjeta').reduce((s, c) => s + c.monto, 0));
  document.getElementById('r-tr').textContent = fmtM(cobros.filter(c => c.met === 'Transferencia').reduce((s, c) => s + c.monto, 0));

  const ag = {};
  cobros.forEach(c => { ag[c.fecha] = (ag[c.fecha] || 0) + c.monto; });
  const claves = Object.keys(ag).sort();
  const maxV = Math.max(...Object.values(ag), 1);

  document.getElementById('bars').innerHTML = claves.length
    ? claves.map(f => {
        const v = ag[f];
        const hh = Math.round((v / maxV) * 100);
        const [y, m, dd] = f.split('-');
        return `<div class="bar-col">
          <div class="bar-val">${fmtM(v)}</div>
          <div class="bar" style="height:${hh}px"></div>
          <div class="bar-lbl">${dd}/${m}</div>
        </div>`;
      }).join('')
    : '<div style="font-size:12px;color:var(--text-ter);margin:auto">Sin cobros en el período</div>';

  document.getElementById('tb-rep').innerHTML = cobros.length
    ? cobros.sort((a, b) => b.fecha > a.fecha ? 1 : -1).map(c => `<tr>
        <td>${fmtF(c.fecha)}</td>
        <td>${c.pac_nombre}</td>
        <td>${c.serv}</td>
        <td>${fmtM(c.monto)}</td>
        <td><span class="pl pl-g">${c.met}</span></td>
        <td style="font-size:11px;color:var(--text-sec)">${c.doctor_nombre || '—'}</td>
      </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty"><i class="ti ti-receipt-off"></i>Sin cobros en el período</div></td></tr>`;
}

function exportarCSV() {
  const { desde, hasta } = getRangoDates();
  const cobros = COBROS.filter(c => c.fecha >= desde && c.fecha <= hasta);
  const csv = [
    'Fecha,Folio,Paciente,Servicio,Monto,Método,Doctor',
    ...cobros.map(c => `${c.fecha},${c.folio},${c.pac_nombre},${c.serv},${c.monto},${c.met},${c.doctor_nombre || ''}`)
  ].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `BaoQi_reporte_${desde}_${hasta}.csv`;
  a.click();
  toast('✓ CSV exportado');
}

/* ============ EXPEDIENTES ============ */
function renderExp() {
  const tb = document.getElementById('tb-exp');
  if (!PACS.length) {
    tb.innerHTML = `<tr><td colspan="7"><div class="empty"><i class="ti ti-clipboard-off"></i>Sin expedientes aún</div></td></tr>`;
    return;
  }
  tb.innerHTML = PACS.map((p, i) => {
    const citas = CITAS.filter(c => c.pac_id === p.id).length;
    return `<tr>
      <td><div style="display:flex;align-items:center"><div class="av">${ini2(p.nombre)}</div>${p.nombre}</div></td>
      <td style="color:var(--text-ter);font-size:11px">BQ-${String(i + 1).padStart(4, '0')}</td>
      <td>${p.dxbio || '—'}</td>
      <td>${p.dxmtch || '—'}</td>
      <td>${citas}</td>
      <td><span class="pl pl-b">Activo</span></td>
      <td><button class="ra" onclick="abrirSOAP('${p.id}','${p.nombre}')"><i class="ti ti-file-text"></i></button></td>
    </tr>`;
  }).join('');
}

/* ============ ADMINISTRACIÓN ============ */
function renderAdmin() {
  document.getElementById('doc-grid').innerHTML = DOCS.map(d => `
    <div class="doc-card">
      <div class="doc-card-av ${d.rol === 'admin' ? 'admin' : ''}">${ini2(d.nombre)}</div>
      <div class="doc-card-name">${d.nombre}</div>
      <div class="doc-card-esp">${d.especialidad || '—'}</div>
      <div class="doc-card-ced">Cédula: ${d.cedula || '—'}</div>
      <div class="doc-card-foot">
        <span class="doc-activo ${d.activo ? 'si' : 'no'}">${d.activo ? 'Activo' : 'Inactivo'}</span>
        <div style="display:flex;gap:5px;align-items:center">
          <span style="font-size:10px;background:var(--bg-sec);padding:2px 8px;border-radius:8px;color:var(--text-ter)">
            ${d.rol === 'admin' ? 'Admin' : 'Doctor'}
          </span>
          ${d.id !== 'admin-001' ? `
            <button class="ra" onclick="toggleDoctor('${d.id}',${d.activo})" title="${d.activo ? 'Desactivar' : 'Activar'}">
              <i class="ti ti-power"></i>
            </button>` : ''}
        </div>
      </div>
    </div>`).join('');
}
