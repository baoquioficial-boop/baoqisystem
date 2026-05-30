# BaoQi — Sistema Clínico de Acupuntura

Sistema de gestión clínica para **BaoQi Centro de Bienestar Integral**.  
Desarrollado con HTML/CSS/JS puro + Supabase como base de datos en la nube.

---

## Funcionalidades

- **Login con PIN por doctor** — cada doctor tiene su perfil y PIN de 4 dígitos
- **Dashboard** — agenda del día, caja en tiempo real, resumen de citas
- **Calendario semanal** — vista semanal de citas por color (primera vez / subsecuente)
- **Pacientes** — registro completo con historia clínica (NOM-004-SSA3-2012)
- **Historia clínica** — datos personales, antecedentes, exploración física, valoración MTCH, diagnóstico, plan de tratamiento y consentimiento informado
- **Notas SOAP** — formato subjetivo / objetivo / análisis / plan por sesión
- **Caja** — registro de cobros, métodos de pago, tickets imprimibles
- **Reportes** — ingresos por período, filtro por doctor, gráfica de barras, exportar CSV
- **Expedientes** — historial clínico por paciente con folio BQ-XXXX
- **Administración** — registro y gestión de doctores (solo rol admin)

---

## Estructura del proyecto

```
baoqi/
├── index.html          # Interfaz principal
├── css/
│   └── styles.css      # Estilos completos
├── js/
│   ├── config.js       # Credenciales Supabase
│   ├── supabase.js     # Helper API REST
│   ├── auth.js         # Login PIN y sesión
│   └── app.js          # Lógica principal
└── README.md
```

---

## Configuración

### 1. Supabase

Edita `js/config.js` con tus credenciales:

```js
const SB_URL = 'https://TU-PROYECTO.supabase.co';
const SB_KEY = 'tu-anon-key';
```

### 2. Tablas requeridas en Supabase

Ejecuta este SQL en el **SQL Editor** de tu proyecto:

```sql
create table pacientes (
  id text primary key,
  nombre text not null,
  tel text, email text, fnac text, sexo text,
  ecivil text, ocup text, dom text, resp text, telemer text,
  motivo text, padec text, padre text, madre text,
  alergias text, meds text, dxbio text, dxmtch text,
  puntos text, prog text, ta text, peso text, talla text,
  lcolor text, fecha_reg text,
  created_at timestamptz default now()
);

create table citas (
  id text primary key,
  pac_id text references pacientes(id),
  tipo text, fecha text, hora text, dur text,
  motivo text, estado text default 'Pendiente',
  fecha_reg text,
  doctor_id text references doctores(id),
  doctor_nombre text,
  created_at timestamptz default now()
);

create table cobros (
  id text primary key,
  pac_id text references pacientes(id),
  pac_nombre text, serv text,
  monto integer, met text, fecha text, hora text,
  folio text, estado text default 'Pagado',
  doctor_id text references doctores(id),
  doctor_nombre text,
  created_at timestamptz default now()
);

create table notas_soap (
  id text primary key,
  pac_id text references pacientes(id),
  fecha text, num integer,
  s text, o text, a text, p text,
  doctor_id text references doctores(id),
  doctor_nombre text,
  created_at timestamptz default now()
);

create table doctores (
  id text primary key,
  nombre text not null,
  cedula text, especialidad text, email text,
  pin text not null,
  rol text default 'doctor',
  activo boolean default true,
  created_at timestamptz default now()
);

-- Admin inicial (PIN: 0000 — cámbialo después)
insert into doctores (id, nombre, cedula, especialidad, rol, pin, activo)
values ('admin-001', 'Administrador BaoQi', '', 'Administración', 'admin', '0000', true);
```

### 3. Row Level Security

Activa RLS y crea políticas para usuarios autenticados en todas las tablas.

---

## Uso

1. Abre `index.html` en el navegador (o despliega en GitHub Pages / Netlify)
2. Selecciona tu perfil
3. Ingresa tu PIN de 4 dígitos
4. El admin inicial usa PIN `0000` — **cámbialo de inmediato**

---

## Despliegue en GitHub Pages

1. Sube el repositorio a GitHub
2. Ve a **Settings → Pages**
3. Selecciona rama `main` y carpeta `/ (root)`
4. Tu sistema estará disponible en `https://tu-usuario.github.io/baoqi`

---

## Tecnologías

- HTML5 / CSS3 / JavaScript (vanilla)
- [Supabase](https://supabase.com) — base de datos PostgreSQL en la nube
- [Tabler Icons](https://tabler.io/icons) — iconografía

---

## Cumplimiento normativo

- Historia clínica conforme a **NOM-004-SSA3-2012**
- Consentimiento informado según lineamientos **COFEPRIS**
- Protección de datos personales conforme a **LFPDPPP**

---

*BaoQi Centro de Bienestar Integral · 2025*
