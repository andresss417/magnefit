# Magnefit — Sitio + carrito + pago con Mercado Pago

## Estructura del proyecto

```
magnefit-web/
├── index.html                  → Tienda pública
├── admin.html                  → Panel de administración (productos y pedidos)
├── images/
│   └── magnefit-50ml.jpeg      → Foto real del envase de 50ml
├── netlify.toml
├── package.json
├── .gitignore
└── netlify/
    └── functions/
        ├── crear-pago.js       → Crea la preferencia de pago en Mercado Pago
        └── webhook-mp.js       → Recibe la confirmación de pago de Mercado Pago
```

## 1. Crear las tablas en Supabase

**SQL Editor** en tu proyecto de Supabase:

```sql
create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  precio integer not null,
  precio_anterior integer,
  badge text,
  imagen_url text,
  en_stock boolean default true,
  orden integer default 0,
  creado_en timestamptz default now()
);

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  nombre_cliente text,
  telefono text,
  items jsonb not null,
  total integer not null,
  estado text default 'pendiente_pago',
  creado_en timestamptz default now()
);

alter table productos enable row level security;
alter table pedidos enable row level security;

create policy "productos visibles para todos"
  on productos for select using (true);

create policy "productos editables por admins"
  on productos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "pedidos visibles para admins"
  on pedidos for select using (auth.role() = 'authenticated');
-- pedidos se escribe solo desde las funciones de Netlify (Service Role Key),
-- que se saltan RLS — no hace falta política de insert para el navegador.
```

## 2. Cargar tus 3 productos

Ejecuta esto en el **SQL Editor** (ajusta los precios si no son los definitivos):

```sql
insert into productos (nombre, descripcion, precio, precio_anterior, badge, imagen_url, en_stock, orden) values

('Magnefit 50ml — Agarre Máximo',
 'Formato clip, ideal para el bolso o la mochila de entrenamiento.',
 8990, 10990, 'NUEVO', 'https://TU-SITIO.netlify.app/images/magnefit-50ml.jpeg', true, 1),

('Magnefit Grande 250ml',
 'Rinde para semanas de entrenamiento constante.',
 19990, 22990, 'AHORRA 13%', null, true, 2),

('Pack Dúo (Grande 250ml + 50ml) + Envío gratis',
 'El grande para la casa o el gimnasio, el de 50ml para llevar siempre.',
 24990, 28980, 'AHORRA 14%', null, true, 3);
```

Cambia `TU-SITIO` por el dominio real una vez que despliegues, o sube la foto a
Supabase Storage y pega esa URL — cualquiera de las dos funciona, mientras sea
una URL pública.

> Nota: dejé afuera el "Portátil 75ml" y el "Bolso Químico Pro" porque me
> dijiste que solo vas a vender 50ml, 250ml y el pack de ambos. Si en algún
> momento quieres el bolso como accesorio aparte, se agrega con el mismo
> formato de `insert`.

## 3. Crear tu usuario de administrador

**Authentication → Users → Add user** en Supabase. Con ese correo y
contraseña entras a `admin.html`.

## 4. Conectar Supabase al sitio

En `index.html` y `admin.html`, reemplaza:

```js
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-CLAVE-ANONIMA-PUBLICA";
```

por los valores reales (**Project Settings → API**). La `anon key` es pública
por diseño — está protegida por las políticas RLS de arriba.

## 5. Mercado Pago

1. https://www.mercadopago.cl/developers → crea una aplicación.
2. Copia tu **Access Token** (usa el de prueba mientras testeas).

## 6. Variables de entorno en Netlify

**Nunca van en el HTML.** En **Site settings → Environment variables**:

| Variable | Dónde conseguirla |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (clave `service_role`, secreta) |
| `MP_ACCESS_TOKEN` | Mercado Pago → Tus integraciones → Credenciales |

## 7. Tu número de WhatsApp

En `index.html`:

```js
const WHATSAPP_NUMBER = "56912345678";
```

Cámbialo por tu número real, formato `56 9 XXXX XXXX` sin espacios ni `+`.

## 8. Desplegar en Netlify

1. Sube la carpeta a un repositorio de GitHub (incluida la carpeta `images/`).
2. Netlify → **Add new site → Import an existing project** → conecta el repo.
3. Netlify detecta `netlify.toml` solo (publish `.`, functions `netlify/functions`).
4. Agrega las 3 variables de entorno del paso 6.
5. Deploy. Sitio en `https://tu-sitio.netlify.app`, panel en `/admin.html`.

## Cómo funciona el flujo de pago

1. El cliente arma el carrito en `index.html` (guardado en `localStorage`).
2. Al hacer clic en **"Pagar con Mercado Pago"**, el navegador llama a
   `crear-pago`, mandando solo `id` y `cantidad` de cada producto.
3. `crear-pago.js` vuelve a buscar el precio real en Supabase (nunca confía
   en el precio que venía del navegador), crea un registro en `pedidos` con
   estado `pendiente_pago`, y pide a Mercado Pago el link de cobro.
4. El cliente paga y vuelve al sitio con `?pago=exitoso`, `?pago=pendiente`
   o `?pago=fallido` en la URL — el banner en la parte superior se lo muestra.
5. En paralelo, Mercado Pago notifica a `webhook-mp.js`, que actualiza el
   pedido en Supabase a `confirmado` o `rechazado` — esa es la fuente de
   verdad real (el parámetro en la URL es solo para la experiencia visual).
6. El botón **"Comprar por WhatsApp"** sigue funcionando igual que antes,
   como alternativa si el cliente prefiere coordinar directo contigo.

## Pendiente antes de publicar

- [ ] Correr el SQL de las secciones 1 y 2 en Supabase
- [ ] Reemplazar `SUPABASE_URL` / `SUPABASE_ANON_KEY` en `index.html` y `admin.html`
- [ ] Subir la foto real a una URL pública y actualizarla en el producto de 50ml
- [ ] Configurar las 3 variables de entorno en Netlify
- [ ] Crear tu usuario admin en Supabase Auth
- [ ] Reemplazar `WHATSAPP_NUMBER` por tu número real
- [ ] Confirmar que los precios del pack (`$24.990` / antes `$28.980`) son los que quieres — los dejé como referencia
