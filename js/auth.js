/* =============================================
   BaoQi v4 — auth.js
   PIN login seguro — sin lista visible de doctores
   Carga doctores al inicio, espera antes de validar
   ============================================= */

let DOCS = [];
let doctorActual = null;
let pinBuffer = '';
let pinBloqueado = false;
let docsListos = false;

/* ============ CARGA DOCTORES ============ */
async function cargarDoctores() {
  setHint('Cargando...');
  try {
    DOCS = await sb('doctores', 'GET', null, '?activo=eq.true&order=id.asc');
    docsListos = true;
    setHint('Ingresa tu PIN para continuar');
  } catch (e) {
    setHint('Sin conexión — verifica tu red');
    // Reintentar en 3 segundos
    setTimeout(cargarDoctores, 3000);
  }
}

/* ============ TECLADO ============ */
function pinTecla(d) {
  if (pinBloqueado) return;
  if (!docsListos) { setHint('Cargando sistema...'); return; }
  if (pinBuffer.length >= 4) return;
  pinBuffer += d;
  actualizarDots();
  if (pinBuffer.length === 4) {
    pinBloqueado = true;
    setTimeout(verificarPIN, 200);
  }
}

function pinBorrar() {
  if (pinBloqueado) return;
  pinBuffer = pinBuffer.slice(0, -1);
  actualizarDots();
  setError('');
}

function actualizarDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('pd' + i);
    if (dot) dot.classList.toggle('on', i < pinBuffer.length);
  }
}

function setHint(msg) {
  const el = document.getElementById('pin-hint');
  if (el) el.textContent = msg;
}

function setError(msg) {
  const el = document.getElementById('pin-error');
  if (el) el.textContent = msg;
}

/* ============ VERIFICACIÓN ============ */
function verificarPIN() {
  const doctor = DOCS.find(d => d.pin === pinBuffer);

  if (doctor) {
    // Correcto — saluda y entra
    setHint('Bienvenido, ' + doctor.nombre.split(' ')[0] + ' 👋');
    setError('');
    doctorActual = doctor;
    setTimeout(() => entrarSistema(), 600);
  } else {
    // Incorrecto — shake y limpiar
    const dots = document.getElementById('pin-dots');
    if (dots) {
      dots.classList.add('shake');
      setTimeout(() => dots.classList.remove('shake'), 450);
    }
    setError('PIN incorrecto');
    setHint('Ingresa tu PIN para continuar');
    pinBuffer = '';
    actualizarDots();
    // Desbloquear después del shake
    setTimeout(() => {
      pinBloqueado = false;
      setError('');
    }, 1200);
  }
}

/* ============ ENTRAR ============ */
async function entrarSistema() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('app').classList.add('on');

  // Sidebar
  document.getElementById('sb-av').textContent = ini2(doctorActual.nombre);
  document.getElementById('sb-nombre').textContent = doctorActual.nombre;
  document.getElementById('sb-rol').textContent =
    doctorActual.rol === 'admin' ? 'Administrador' : (doctorActual.especialidad || 'Doctor');

  // Menú operativo (Cursos, Inscripciones, Comprobantes, Promociones): admin Y doctor
  const navOperativo = document.getElementById('nav-operativo');
  if (navOperativo) navOperativo.style.display = 'block';
  // Menú admin (Dashboard, CRM, Agente IA, Configuración): solo admin
  const navAdmin = document.getElementById('nav-admin');
  if (navAdmin) navAdmin.style.display = doctorActual.rol === 'admin' ? 'block' : 'none';

  // Fecha
  const d = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  document.getElementById('pfecha').textContent =
    `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} ${d.getFullYear()}`;

  // Cargar datos filtrados por rol
  await cargarTodo();
  pinBloqueado = false;
}

/* ============ CERRAR SESIÓN ============ */
function cerrarSesion() {
  doctorActual = null;
  pinBuffer = '';
  pinBloqueado = false;
  PACS = []; CITAS = []; COBROS = []; NOTAS = [];

  document.getElementById('app').classList.remove('on');
  document.getElementById('login-wrap').style.display = 'flex';
  document.getElementById('nav-admin').style.display = 'none';

  actualizarDots();
  setError('');
  setHint('Ingresa tu PIN para continuar');
}

/* ============ HELPERS DE ROL ============ */
function esAdmin() {
  return doctorActual?.rol === 'admin';
}

function qDoctor() {
  return esAdmin() ? '' : `&doctor_id=eq.${doctorActual.id}`;
}

function qPacientes() {
  return esAdmin() ? '' : `&doctor_id=eq.${doctorActual.id}`;
}

/* ============ GESTIÓN DOCTORES (admin) ============ */
async function guardarDoctor() {
  const nombre = document.getElementById('d-nombre').value.trim();
  const pin    = document.getElementById('d-pin').value.trim();

  if (!nombre)            { toast('⚠ El nombre es obligatorio'); return; }
  if (!/^\d{4}$/.test(pin)) { toast('⚠ El PIN debe ser exactamente 4 dígitos numéricos'); return; }
  if (DOCS.find(d => d.pin === pin)) { toast('⚠ Ese PIN ya está en uso, elige otro'); return; }

  const doc = {
    id: uid(),
    nombre,
    especialidad: document.getElementById('d-esp').value,
    cedula:       document.getElementById('d-ced').value,
    email:        document.getElementById('d-email').value,
    rol:          document.getElementById('d-rol').value,
    pin,
    activo: true
  };

  try {
    await sb('doctores', 'POST', doc);
    DOCS.push(doc);
    cm('ndoc');
    renderAdmin();
    toast('✓ Doctor registrado');
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

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', cargarDoctores);
