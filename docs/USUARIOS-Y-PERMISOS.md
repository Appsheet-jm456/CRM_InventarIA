# Usuarios, roles y permisos (F2·5)

> Quién entra a CRM InventarIA, qué puede hacer y cómo lo hace cumplir la base (RLS).
> Mismo modelo de Futur Green (su decisión 0011), adaptado al CRM. Decisión 0018.
> Lo construye F3·1 (migración `0003_usuarios_y_permisos.sql`).

---

## Reglas

**RU-01 · Cada persona entra con su usuario y contraseña.** Nada se hace de forma anónima: cada
mensaje de asesor, cambio de etapa y seguimiento queda con quién lo hizo. La clave compartida de
la v0 (`ACCESS_PASSWORD`) no existe en la app nueva.

**RU-02 · Se entra con un usuario, no con un correo.** Supabase Auth pide correo, así que el usuario
se guarda como `<usuario>@inventaria.local` (no recibe correos). El usuario lleva de 3 a 30 letras
minúsculas, números, punto, guion o guion bajo. Si alguien escribe un correo real, también sirve.

**RU-03 · Lo que puede hacer cada quien depende de su rol, y los roles los configura el
administrador.** Los **permisos** son un catálogo fijo que define el código (cada uno lo revisa una
política o una función de la base). Los **roles** y qué permisos tiene cada uno se editan desde la
app (Configuración → Usuarios y roles).

**RU-04 · La base pregunta por el permiso, nunca por el nombre del rol.** Las políticas usan
`tiene_permiso('atender_bandeja')`; cambiar un rol no exige cambiar código.

**RU-05 · Siempre queda alguien que administre.** El rol *administrador* es del sistema: no se borra
y no pierde `administrar_usuarios`. No se puede desactivar al último usuario activo que administra.

**RU-06 · Un usuario no se borra: se desactiva.** Sus mensajes y cambios de etapa lo siguen
nombrando. Un usuario inactivo no entra y el RLS no le deja ver nada.

**RU-07 · Esconder un módulo es comodidad; quien protege es la base.** El panel solo muestra los
módulos que el usuario puede usar, pero aunque escriba la ruta a mano, la base no le entrega datos.

**RU-08 · El asesor ve lo suyo y la cola.** Sin el permiso `ver_todas_conversaciones`, un asesor solo
ve las conversaciones asignadas a él y las que están sin asignar (la cola compartida, decisión 0012).

**RU-09 · El bot y los procesos del servidor no son usuarios.** El receptor del webhook, el bot, la
copia del inventario y la carga por Excel usan la `SERVICE_ROLE_KEY` en el servidor, que salta el
RLS. Esa clave nunca llega al navegador. Lo que el bot escribe queda con `lado = 'bot'`.

---

## Catálogo de permisos

| Permiso | Qué deja hacer |
|---|---|
| `atender_bandeja` | Ver la cola y sus conversaciones, tomar una, responder, pausar y reanudar el bot |
| `ver_todas_conversaciones` | Ver y reasignar las conversaciones de todos los asesores |
| `gestionar_oportunidades` | Mover oportunidades en el embudo, marcar vendido o perdido (con motivo) y agendar seguimientos |
| `administrar_inventario` | Productos, precios, stock, fotos, catálogos PDF y carga por Excel |
| `administrar_bot` | Árbol del bot, horario de atención y respuestas rápidas |
| `administrar_embudo` | Etapas del embudo y motivos de pérdida |
| `administrar_canal` | Conexión con WhatsApp (Meta), plantillas y contador de consumo |
| `ver_metricas` | Métricas de todo el equipo (sin él, solo las propias) |
| `administrar_usuarios` | Usuarios, roles y permisos |

Leer el inventario (`productos`, `catalogos`) y las etapas lo puede cualquier usuario activo: el
asesor los necesita para responder.

## Roles de arranque

| Permiso | Administrador (sistema) | Asesor |
|---|:-:|:-:|
| `atender_bandeja` | ✅ | ✅ |
| `ver_todas_conversaciones` | ✅ | — |
| `gestionar_oportunidades` | ✅ | ✅ |
| `administrar_inventario` | ✅ | — |
| `administrar_bot` | ✅ | — |
| `administrar_embudo` | ✅ | — |
| `administrar_canal` | ✅ | — |
| `ver_metricas` | ✅ | — |
| `administrar_usuarios` | ✅ | — |

Si más adelante hace falta un *supervisor* (ve todo, no configura), se crea desde la app sin tocar
código.

---

## Cómo lo hace cumplir la base

**Tablas** (migración 0003):

| Tabla | Qué guarda |
|---|---|
| `permisos` | El catálogo de arriba (código y descripción). Solo lo cambia una migración |
| `roles` | Nombre y si es del sistema |
| `rol_permisos` | Qué permisos tiene cada rol |
| `usuarios` | Perfil de cada cuenta de Supabase Auth: `id` (= `auth.users.id`), nombre, rol y activo |

**Funciones** (`security definer`, iguales a Futur Green): `es_usuario_activo()`,
`tiene_permiso(permiso)` y `exigir_permiso(permiso)`, que corta con error `42501`.

**Salvaguardas** (triggers): el rol del sistema no se borra ni deja de serlo; no pierde
`administrar_usuarios`; y después de cada cambio en `usuarios` o `rol_permisos` tiene que quedar al
menos un usuario activo que administre.

**Privilegios:** `anon` no ve nada, tampoco en las tablas que creen las migraciones siguientes. A
`usuarios`, `roles` y `rol_permisos` no se les hace `delete` desde la app (salvo quitar un permiso a
un rol o borrar un rol que no es del sistema).

**Políticas por tabla:**

| Tabla | Leer | Escribir | Cuándo |
|---|---|---|---|
| `permisos`, `roles`, `rol_permisos`, `usuarios` | usuario activo | `administrar_usuarios` | F3·1 |
| `productos`, `catalogos` | usuario activo | `administrar_inventario` | F3·1 (leer) · F3·9 (escribir) |
| `etapas` | usuario activo | `administrar_embudo` | F3·1 (leer) · F3·5 (escribir) |
| `leads` / `conversaciones` | `ver_todas_conversaciones`, o `atender_bandeja` si está asignada a él o sin asignar | ídem, más `gestionar_oportunidades` para la etapa | F3·5, con el modelo de F2·2 |
| `mensajes` | como su conversación | `atender_bandeja` (lado `asesor`) | F3·5 |
| `bot_nodos`, `horario_atencion`, `respuestas_rapidas` | usuario activo | `administrar_bot` | F3·7 ✅ (`bot_nodos` solo se lee y actualiza; `respuestas_rapidas` también se crea y borra) |

Mientras llega cada paso, las tablas del bot (`leads`, `mensajes`) siguen como están hoy: RLS
encendido y sin políticas, solo el servidor entra.

## Primer administrador

`supabase/crear-admin.sh <usuario> "<Nombre completo>"` crea la cuenta en Supabase Auth y su perfil
con el rol administrador. Pide la contraseña sin mostrarla (mínimo 8) y no corre si ya hay un
administrador activo. Los demás usuarios se crean desde la app.
