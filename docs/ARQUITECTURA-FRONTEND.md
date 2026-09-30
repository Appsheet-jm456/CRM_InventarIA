# Arquitectura del frontend (F2·9)

> Cómo se arma la app nueva **CRM InventarIA**: dónde vive, cómo corre y cómo se organizan sus
> módulos. Copia la arquitectura de Futur Green (decisión 0009). Dónde y en qué puerto: decisión 0017.
> Lo construye F3·1.

---

## Dónde vive y cómo corre

| | |
|---|---|
| **Código** | Carpeta `crm/` del repo, con su propio `package.json`. La v0 (`app/` en la raíz) y los scripts de prueba (`herramientas/`) no se tocan |
| **Mientras se construye (F3·1 a F3·4)** | `next start -p 3020` → `http://100.114.72.43:3020` (Tailscale) y `http://192.168.20.50:3020` (red local) |
| **Desde F3·5** | Pasa al **8096**: su Bandeja reemplaza al visor de Python de la demo, que se apaga |
| **Servicio** | Unidad de usuario `crm-inventaria-app` (systemd, arranca con el servidor, `Linger=yes`), igual que los servicios del bot. Copia en `crm/systemd/` |
| **Base** | Supabase del CRM (`http://192.168.20.50:8020`). La app habla con ella desde el servidor |
| **Secretos** | `crm/.env.local` (fuera de git): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

## Stack

Next.js 14 (App Router) con **TypeScript** estricto, `@supabase/ssr` para la sesión en cookies y
`@supabase/supabase-js`. Sin librerías de estilos: `globals.css` con variables y modo claro/oscuro,
como Futur Green.

## Estructura

```
crm/
├── package.json · tsconfig.json · next.config.js · .env.local (fuera de git)
├── systemd/crm-inventaria-app.service
└── src/
    ├── middleware.ts            refresca la sesión; sin sesión → /login
    ├── app/
    │   ├── layout.tsx           html, título "CRM InventarIA", globals.css
    │   ├── globals.css
    │   ├── login/               page.tsx · FormLogin.tsx · acciones.ts (entrar y salir)
    │   └── (app)/
    │       ├── layout.tsx       valida la sesión y filtra los módulos por permiso → <Shell>
    │       ├── page.tsx         Inicio
    │       ├── usuarios/        Usuarios (F3·1)
    │       ├── roles/           Roles y permisos (F3·1)
    │       └── [modulo]/        "En construcción · lo construye F3·x" para lo que aún no existe
    ├── components/              Shell · Iconos · MenuAcciones · SinPermiso · Aviso
    └── lib/
        ├── modulos.ts           la lista de módulos (abajo)
        ├── sesion.ts            obtenerSesion() y puede()
        ├── usuario.ts           usuario ↔ <usuario>@inventaria.local (RU-02)
        └── supabase/            server.ts (sesión del usuario) · admin.ts (llave de servicio, solo servidor)
```

Qué se copia de Futur Green casi igual: `Shell`, `Iconos` (con iconos nuevos), `MenuAcciones`,
`SinPermiso`, `Aviso`, `middleware.ts`, `sesion.ts`, `usuario.ts`, `supabase/`, el login y los
módulos de Usuarios y Roles. Cambian el nombre, la marca y la lista de módulos.

## El panel lateral (`Shell`)

- A la izquierda: logo y **CRM InventarIA** arriba, módulos agrupados con icono en el medio, y
  abajo el usuario (iniciales, nombre y rol) con el botón de salir.
- El botón del encabezado lo **pliega** (solo iconos) y lo despliega; la preferencia queda en el
  navegador (`crm-plegado`).
- En el celular se abre como **cajón** con fondo oscuro y se cierra al cambiar de módulo.
- El encabezado muestra el título y subtítulo del módulo actual.

## Módulos (`src/lib/modulos.ts`)

Cada módulo tiene clave, título, subtítulo, grupo, ruta, icono, los permisos que lo muestran
(basta uno; vacío = cualquier usuario activo) y el paso de la Fase 3 que lo construye. Un módulo con
paso pendiente aparece en el panel y abre la página "en construcción".

| Grupo | Módulo | Ruta | Permisos (basta uno) | Paso |
|---|---|---|---|---|
| — | Inicio | `/` | — | F3·1 |
| Atención | Bandeja | `/bandeja` | `atender_bandeja` | F3·5 |
| Atención | Embudo | `/embudo` | `gestionar_oportunidades` | F3·5 |
| Atención | Seguimientos | `/seguimientos` | `gestionar_oportunidades` | F3·6 |
| Ventas | Inventario | `/inventario` | — | F3·9 |
| Ventas | Chat InventarIA | `/chat` | — | F3·9 |
| Análisis | Métricas | `/metricas` | `ver_metricas`, `atender_bandeja` | F3·8 |
| Configuración | Bot y horario | `/bot` | `administrar_bot` | F3·7 |
| Configuración | Etapas | `/etapas` | `administrar_embudo` | F3·5 |
| Configuración | Respuestas rápidas | `/respuestas-rapidas` | `administrar_bot` | F3·7 |
| Configuración | Canal WhatsApp | `/canal` | `administrar_canal` | F3·3 |
| Configuración | Usuarios | `/usuarios` | `administrar_usuarios` | F3·1 |
| Configuración | Roles y permisos | `/roles` | `administrar_usuarios` | F3·1 |

Futur Green junta "Usuarios y roles" en dos módulos; aquí se hace igual. La 0009 los nombraba juntos.

## Cómo se lee y se escribe

- **Server Components** leen con `crearCliente()` (la sesión del usuario): la base aplica su RLS.
- **Server Actions** escriben con la misma sesión. Solo crear cuentas y cambiar contraseñas usan
  `crearClienteAdmin()`, y siempre después de verificar `administrar_usuarios`.
- La llave de servicio vive solo en el servidor (`import 'server-only'`).
- **Tiempo real (F3·5):** la Bandeja y el embudo se suscriben a Supabase Realtime desde el navegador,
  así que desde ese paso el navegador necesita llegar a la API de Supabase (8020) por la misma red.
