/* =============================================
   BaoQi v2 — soap.js
   Nota de evolución por pasos con EVA, evolución
   y campos del formato NOM-004
   ============================================= */

let soapPaso = 0;
const SOAP_TOTAL = 4; // S, O, A, P

function soapReset() {
  soapPaso = 0;
  // Limpiar campos
  ['soap-s-ref','soap-s-sint','soap-s-obs','soap-o-sign','soap-o-expl',
   'soap-o-len','soap-o-pul','soap-o-pts','soap-a-dxb','soap-a-dxm',
   'soap-a-obs','soap-p-ptos','soap-p-ret','soap-p-ind'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Reset EVA
  const eva = document.getElementById('eva-slider');
  if (eva) { eva.value = 5; document.getElementById('eva-num').textContent = '5'; }
  // Reset opciones
  document.querySelectorAll('.opt3').forEach(o => o.classList.remove('on-g','on-a','on-r'));
  const primeraEvol = document.querySelector('#soap-s-sec .opt-row3 .opt3');
  if (primeraEvol) primeraEvol.classList.add('on-g');
  const primerEvolTto = document.querySelector('#soap-a-sec .opt-row3 .opt3');
  if (primerEvolTto) primerEvolTto.classList.add('on-g');
  // Reset técnicas
  document.querySelectorAll('.tec').forEach(t => t.classList.remove('on'));
  const primTec = document.querySelector('.tec');
  if (primTec) primTec.classList.add('on');
  soapRenderStep();
}

function soapRenderStep() {
  // Secciones
  const secs = ['soap-s-sec','soap-o-sec','soap-a-sec','soap-p-sec'];
  secs.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', i === soapPaso);
  });
  // Dots
  const items = document.querySelectorAll('.ss-item');
  items.forEach((item, i) => {
    item.classList.remove('active','done');
    if (i < soapPaso) item.classList.add('done');
    else if (i === soapPaso) item.classList.add('active');
  });
  // Botones nav
  const prev = document.getElementById('soap-prev');
  const next = document.getElementById('soap-next');
  const footer = document.getElementById('soap-footer');
  if (prev) prev.style.display = soapPaso > 0 ? 'inline-flex' : 'none';
  if (soapPaso === SOAP_TOTAL - 1) {
    if (next) next.style.display = 'none';
    if (footer) footer.style.display = 'flex';
  } else {
    if (next) { next.style.display = 'inline-flex'; next.innerHTML = 'Siguiente <i class="ti ti-arrow-right"></i>'; }
    if (footer) footer.style.display = 'none';
  }
}

function soapNav(dir) {
  soapPaso = Math.max(0, Math.min(SOAP_TOTAL - 1, soapPaso + dir));
  soapRenderStep();
  // Scroll al top del modal
  const body = document.querySelector('#m-soap .mb');
  if (body) body.scrollTop = 0;
}

function soapIr(paso) {
  soapPaso = paso;
  soapRenderStep();
}

function sel3(el, grupo) {
  el.closest('.opt-row3').querySelectorAll('.opt3').forEach(o => o.classList.remove('on-g','on-a','on-r'));
  const idx = Array.from(el.closest('.opt-row3').children).indexOf(el);
  const clases = ['on-g','on-a','on-r'];
  el.classList.add(clases[idx] || 'on-g');
}

async function guardarSOAP() {
  if (!citaActual) { toast('⚠ No hay cita activa'); return; }

  // Recoger evolución seleccionada
  const evolEl = document.querySelector('#soap-s-sec .opt-row3 .on-g, #soap-s-sec .opt-row3 .on-a, #soap-s-sec .opt-row3 .on-r');
  const evolTtoEl = document.querySelector('#soap-a-sec .opt-row3 .on-g, #soap-a-sec .opt-row3 .on-a, #soap-a-sec .opt-row3 .on-r');

  // Recoger técnicas seleccionadas
  const tecnicas = Array.from(document.querySelectorAll('.tec.on')).map(t => t.textContent.trim()).join(', ');

  const nota = {
    id: uid(),
    pac_id: citaActual.pac_id,
    fecha: hoy(),
    num: parseInt(document.getElementById('soap-num')?.value) || 1,
    // S
    s: document.getElementById('soap-s-ref')?.value || '',
    evolucion: evolEl?.textContent?.trim() || '',
    eva: parseInt(document.getElementById('eva-slider')?.value) || 0,
    sintomas: document.getElementById('soap-s-sint')?.value || '',
    s_obs: document.getElementById('soap-s-obs')?.value || '',
    // O
    o_signos: document.getElementById('soap-o-sign')?.value || '',
    o: document.getElementById('soap-o-expl')?.value || '',
    o_lengua: document.getElementById('soap-o-len')?.value || '',
    o_pulso: document.getElementById('soap-o-pul')?.value || '',
    o_puntos: document.getElementById('soap-o-pts')?.value || '',
    // A
    a_dxbio: document.getElementById('soap-a-dxb')?.value || '',
    a_dxmtch: document.getElementById('soap-a-dxm')?.value || '',
    evol_tto: evolTtoEl?.textContent?.trim() || '',
    a: document.getElementById('soap-a-obs')?.value || '',
    // P
    tecnicas,
    puntos_sesion: document.getElementById('soap-p-ptos')?.value || '',
    retencion: document.getElementById('soap-p-ret')?.value || '',
    p: document.getElementById('soap-p-ind')?.value || '',
    // Meta
    doctor_id: doctorActual.id,
    doctor_nombre: doctorActual.nombre
  };

  try {
    await sb('notas_soap', 'POST', nota);
    NOTAS.unshift(nota);
    // Marcar cita como atendida si no lo está
    if (citaActual.id && citaActual.estado !== 'Atendida' && citaActual.estado !== 'Pagado') {
      await marcarAtendida(citaActual.id);
    }
    cm('soap');
    toast('✓ Nota de evolución guardada — Sesión ' + nota.num);
    renderAgenda();
  } catch (e) { toast('⚠ Error al guardar: ' + e.message); }
}

// Init soap cuando se carga
document.addEventListener('DOMContentLoaded', () => {
  const evaSlider = document.getElementById('eva-slider');
  if (evaSlider) {
    evaSlider.addEventListener('input', function() {
      const num = document.getElementById('eva-num');
      if (num) num.textContent = this.value;
    });
  }
});
