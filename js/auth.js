/* =============================================
   BaoQi v3 — auth.js
   Login solo PIN — sin lista visible de doctores
   Filtrado interno por doctor_id según rol
   ============================================= */

let DOCS = [];
let doctorActual = null;
let pinBuffer = '';
let pinIntentando = false;

/* ============ CARGA INICIAL ============ */
async function cargarDoctores() {
  try {
    DOCS = await sb('doctores', 'GET', null, '?activo=eq.true&order=id.asc');
    // No mostramos la lista — solo verificamos que cargó
    actualizarIndicadorPin();
  } catch (e) {
    mostrarError('Error de conexión. Verifica tu red.');
  }
}

/* ============ TECLADO PIN ============ */
function pinTecla(d) {
  if (pinIntentando || pinBuffer.length >= 4) return;
  pinBuffer += d;
  actualizarDots();
  if (pinBuffer.length === 4) setTimeout(verificarPIN, 180);
}

function pinBorrar() {
  if (pinIntentando) return;
  pinBuffer = pinBuffer.slice(0, -1);
  actualizarDots();
  limpiarError();
}

function actualizarDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('pd' + i);
    if (dot) dot.classList.toggle('on', i < pinBuffer.length);
  }
}

function actualizarIndicadorPin() {
  // Pequeño indicador de que el sistema está listo, sin revelar nada
  const hint = document.getElementById('pin-hint');
  if (hint) hint.textContent = DOCS.length > 0 ? 'Ingresa tu PIN para continuar' : 'Cargando...';
}

/* ============ VERIFICACIÓN PIN ============ */
async function verificarPIN() {
  pinIntentando = true;
  const doctor = DOCS.find(d => d.pin === pinBuffer);

  if (doctor) {
    // PIN correcto — mostrar nombre brevemente y entrar
    const hint = document.getElementById('pin-hint');
    if (hint) hint.textContent = `Bienvenido, ${doctor.nombre.split(' ')[0]}`;
    doctorActual = doctor;
    setTimeout(() => entrarSistema(), 500);
  } else {
    // PIN incorrecto — shake animation y limpiar
    const dots = document.getElementById('pin-dots');
    if (dots) { dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 500); }
    mostrarError('PIN incorrecto');
    pinBuffer = '';
    actualizarDots();
    pinIntentando = false;
  }
}

function mostrarError(msg) {
  const el = document.getElementById('pin-error');
  if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 2500); }
}

function limpiarError() {
  const el = document.getElementById('pin-error');
  if (el) el.textContent = '';
}

/* ============ ENTRADA AL SISTEMA ============ */
async function entrarSistema() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('app').classList.add('on');

  // Sidebar — mostrar nombre e ícono de rol
  document.getElementById('sb-av').textContent = ini2(doctorActual.nombre);
  document.getElementById('sb-nombre').textContent = doctorActual.nombre;
  document.getElementById('sb-rol').textContent = doctorActual.rol === 'admin' ? 'Administrador' : (doctorActual.especialidad || 'Doctor');

  // Menú admin solo visible para admin
  const navAdmin = document.getElementById('nav-admin');
  if (navAdmin) navAdmin.style.display = doctorActual.rol === 'admin' ? 'block' : 'none';

  // Fecha en topbar
  const d = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const diasN = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  document.getElementById('pfecha').textContent = `${diasN[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} ${d.getFullYear()}`;

  await cargarTodo();
  pinIntentando = false;
}

/* ============ CERRAR SESIÓN ============ */
function cerrarSesion() {
  doctorActual = null;
  pinBuffer = '';
  pinIntentando = false;
  PACS = []; CITAS = []; COBROS = []; NOTAS = [];
  document.getElementById('app').classList.remove('on');
  document.getElementById('login-wrap').style.display = 'flex';
  // Limpiar dots
  actualizarDots();
  limpiarError();
  const hint = document.getElementById('pin-hint');
  if (hint) hint.textContent = 'Ingresa tu PIN para continuar';
  // Limpiar sidebar
  document.getElementById('nav-admin').style.display = 'none';
}

/* ============ REGISTRAR NUEVO DOCTOR (solo admin) ============ */
async function guardarDoctor() {
  const nombre = document.getElementById('d-nombre').value.trim();
  const pin = document.getElementById('d-pin').value.trim();
  if (!nombre) { toast('⚠ El nombre es obligatorio'); return; }
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { toast('⚠ El PIN debe ser exactamente 4 dígitos'); return; }
  // Verificar que el PIN no esté en uso
  if (DOCS.find(d => d.pin === pin)) { toast('⚠ Ese PIN ya está en uso, elige otro'); return; }

  const doc = {
    id: uid(),
    nombre,
    especialidad: document.getElementById('d-esp').value,
    cedula: document.getElementById('d-ced').value,
    email: document.getElementById('d-email').value,
    rol: document.getElementById('d-rol').value,
    pin,
    activo: true
  };
  try {
    await sb('doctores', 'POST', doc);
    DOCS.push(doc);
    cm('ndoc');
    renderAdmin();
    toast('✓ Doctor registrado correctamente');
    document.getElementById('d-nombre').value = '';
    document.getElementById('d-pin').value = '';
  } catch (e) {
    if (e.message.includes('unique')) toast('⚠ Ese PIN ya está en uso');
    else toast('⚠ Error: ' + e.message);
  }
}

async function toggleDoctor(id, activo) {
  if (id === 'admin-001') { toast('El admin principal no se puede desactivar'); return; }
  try {
    await sb('doctores', 'PATCH', { activo: !activo }, `?id=eq.${id}`);
    const d = DOCS.find(d => d.id === id);
    if (d) d.activo = !activo;
    renderAdmin();
    toast(activo ? 'Doctor desactivado' : 'Doctor activado');
  } catch (e) { toast('⚠ Error: ' + e.message); }
}

/* ============ FILTRO POR ROL ============ */
// Retorna el query string de filtro según el rol del doctor actual
function filtroDoctor() {
  if (!doctorActual) return '';
  if (doctorActual.rol === 'admin') return ''; // admin ve todo
  return `&doctor_id=eq.${doctorActual.id}`;
}

// Para pacientes: admin ve todos, doctor ve los suyos
function filtroPacientes() {
  if (!doctorActual) return '';
  if (doctorActual.rol === 'admin') return '';
  return `&doctor_id=eq.${doctorActual.id}`;
}

document.addEventListener('DOMContentLoaded', cargarDoctores);
