/* =============================================
   BaoQi v2 — auth.js
   Login con PIN y gestión de sesión
   ============================================= */

let DOCS = [];
let doctorActual = null;
let pinBuffer = '';

async function cargarDoctores() {
  try {
    DOCS = await sb('doctores', 'GET', null, '?activo=eq.true&order=nombre.asc');
    renderDoctoresList();
  } catch (e) {
    document.getElementById('doctor-list').innerHTML =
      '<div style="color:#A32D2D;font-size:12px;text-align:center;padding:12px">Error al cargar doctores.<br>Verifica tu conexión.</div>';
  }
}

function renderDoctoresList() {
  const lista = document.getElementById('doctor-list');
  if (!DOCS.length) { lista.innerHTML = '<div class="loading">No hay doctores registrados.</div>'; return; }
  lista.innerHTML = DOCS.map(d => `
    <button class="doctor-btn" onclick="seleccionarDoctor('${d.id}')">
      <div class="doc-av ${d.rol === 'admin' ? 'admin' : ''}">${ini2(d.nombre)}</div>
      <div>
        <div class="doc-name">${d.nombre}</div>
        <div class="doc-rol">${d.rol === 'admin' ? 'Administrador' : (d.especialidad || 'Doctor')}</div>
      </div>
    </button>`).join('');
}

function seleccionarDoctor(id) {
  doctorActual = DOCS.find(d => d.id === id);
  if (!doctorActual) return;
  document.getElementById('pin-saludo').textContent = 'Hola, ' + doctorActual.nombre.split(' ')[0];
  pinBuffer = '';
  actualizarDots();
  document.getElementById('pin-error').textContent = '';
  document.getElementById('step-doctor').classList.remove('on');
  document.getElementById('step-pin').classList.add('on');
}

function volverDoctores() {
  document.getElementById('step-pin').classList.remove('on');
  document.getElementById('step-doctor').classList.add('on');
  pinBuffer = '';
  actualizarDots();
}

function pinTecla(d) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += d;
  actualizarDots();
  if (pinBuffer.length === 4) setTimeout(verificarPIN, 150);
}

function pinBorrar() {
  pinBuffer = pinBuffer.slice(0, -1);
  actualizarDots();
  document.getElementById('pin-error').textContent = '';
}

function actualizarDots() {
  for (let i = 0; i < 4; i++)
    document.getElementById('pd' + i).classList.toggle('on', i < pinBuffer.length);
}

function verificarPIN() {
  if (pinBuffer === doctorActual.pin) {
    entrarSistema();
  } else {
    document.getElementById('pin-error').textContent = 'PIN incorrecto, intenta de nuevo';
    pinBuffer = '';
    actualizarDots();
    setTimeout(() => { document.getElementById('pin-error').textContent = ''; }, 2000);
  }
}

async function entrarSistema() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('app').classList.add('on');
  document.getElementById('sb-av').textContent = ini2(doctorActual.nombre);
  document.getElementById('sb-nombre').textContent = doctorActual.nombre;
  document.getElementById('sb-rol').textContent = doctorActual.rol === 'admin' ? 'Administrador' : 'Doctor';
  if (doctorActual.rol === 'admin') document.getElementById('nav-admin').style.display = 'block';
  const d = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  document.getElementById('pfecha').textContent = `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} ${d.getFullYear()}`;
  await cargarTodo();
}

function cerrarSesion() {
  doctorActual = null; pinBuffer = '';
  document.getElementById('app').classList.remove('on');
  document.getElementById('login-wrap').style.display = 'flex';
  document.getElementById('step-pin').classList.remove('on');
  document.getElementById('step-doctor').classList.add('on');
  document.getElementById('nav-admin').style.display = 'none';
}

async function guardarDoctor() {
  const nombre = document.getElementById('d-nombre').value.trim();
  const pin = document.getElementById('d-pin').value.trim();
  if (!nombre || pin.length !== 4) { toast('⚠ Nombre y PIN de 4 dígitos son obligatorios'); return; }
  const doc = { id: uid(), nombre, especialidad: document.getElementById('d-esp').value, cedula: document.getElementById('d-ced').value, email: document.getElementById('d-email').value, rol: document.getElementById('d-rol').value, pin, activo: true };
  try {
    await sb('doctores', 'POST', doc);
    DOCS.push(doc); cm('ndoc'); renderAdmin(); renderDoctoresList();
    toast('✓ Doctor registrado');
    document.getElementById('d-nombre').value = ''; document.getElementById('d-pin').value = '';
  } catch (e) { toast('⚠ Error: ' + e.message); }
}

async function toggleDoctor(id, activo) {
  try {
    await sb('doctores', 'PATCH', { activo: !activo }, `?id=eq.${id}`);
    const d = DOCS.find(d => d.id === id); if (d) d.activo = !activo;
    renderAdmin(); toast(activo ? 'Doctor desactivado' : 'Doctor activado');
  } catch (e) { toast('⚠ Error: ' + e.message); }
}

document.addEventListener('DOMContentLoaded', cargarDoctores);
