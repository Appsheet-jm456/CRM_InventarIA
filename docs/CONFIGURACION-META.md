# Configuración Meta (F4·16, decisión 0029)

**Estado:** Borrador para aprobar · 3 oct 2026 · Mejora pedida por el dueño.

## Para qué

Hoy la conexión con Meta vive en `.env.meta` y en `crm/.env.local`. Cambiar de app, rotar el token o pasar al número real
exige entrar al servidor, editar archivos y reiniciar servicios. Esta mejora crea el módulo **Configuración → Meta**,
donde el dueño agrega, cambia o elimina la conexión desde la pantalla, **sin ver nunca los secretos**: una vez
guardados se muestran como `••••••••••••••••••••`.

Resuelve directamente el cambio pendiente de la app *Futur Green bot* a *CRM InventarIA* y del número de prueba al real
(F1·5 y F5·3): se hace una vez, desde la pantalla, y se prueba antes de activarlo.

## Qué se guarda

| Dato | Tipo | Cómo se guarda | Cómo se muestra |
|---|---|---|---|
| `META_APP_ID` | Identificador | Tabla `meta_conexion` | Visible |
| `META_WABA_ID` | Identificador | Tabla `meta_conexion` | Visible |
| `META_PHONE_NUMBER_ID` | Identificador | Tabla `meta_conexion` | Visible, con el número y el nombre verificado que devuelve Meta |
| `META_TOKEN` | **Secreto** | Supabase Vault (cifrado) | `••••••••` y la fecha en que se guardó |
| `META_APP_SECRET` | **Secreto** | Supabase Vault | `••••••••` |
| `META_VERIFY_TOKEN` | **Secreto** | Vault; el sistema lo **genera** | Se muestra **una sola vez** al crearlo, con botón Copiar, para pegarlo en Meta |

Los identificadores no son secretos: se ven y se editan. Los tres secretos **solo se escriben, nunca se leen**: ni la
pantalla, ni la API, ni el administrador pueden recuperarlos. Para cambiarlos se escribe uno nuevo.

`CRM_INTERNO_TOKEN` (llamada de la app al receptor) **no entra** en esta pantalla: es interno entre dos servicios del
servidor y no depende de Meta. Se queda en el entorno.

## Cómo se protege

- **Vault.** Los secretos van en `vault.secrets` (cifrado con la llave de la instancia, ya probado en esta base). La
  tabla `meta_conexion` guarda solo el id del secreto, nunca su valor.
- **Nadie lo lee desde el navegador.** Las funciones que devuelven el valor son `security definer` y solo las puede
  llamar el servidor (`service_role`): la app Next.js y el receptor. `anon` y `authenticated` no tienen acceso a
  `vault.decrypted_secrets` ni a esas funciones.
- **Permiso propio.** Nuevo permiso `administrar_meta`, solo para el rol Administrador. Es distinto de
  `administrar_canal` (plantillas y consumo), que un coordinador sí puede tener.
- **Historial sin valores.** `meta_conexion_historial` anota quién, cuándo y qué campo cambió (por ejemplo
  «cambió el token»), jamás el valor ni un fragmento de él.
- **Nada en registros.** Los secretos no se escriben en `eventos.log`, en la consola ni en mensajes de error.
- **Canal seguro.** Esta pantalla envía secretos al servidor: solo abre por HTTPS o por Tailscale (WireGuard); por la
  red local `http://192.168…` muestra un aviso y bloquea el guardado.
- **Respaldo.** El Vault depende de `VAULT_ENC_KEY` de `supabase/.env`. Si se pierde esa llave, los secretos no se
  recuperan (se vuelven a escribir). Se agrega a F5·2 (respaldos): la llave se respalda aparte de la base.

## Qué puede hacer el dueño

1. **Conectar o cambiar de app.** Escribe App ID, WABA ID, Phone Number ID, token y App Secret, y pulsa **Probar**.
2. **Probar sin guardar.** El servidor consulta a Meta y muestra una lista de comprobaciones:
   - el token es válido, no vence y trae `whatsapp_business_messaging` y `whatsapp_business_management`;
   - el App Secret corresponde a ese App ID;
   - el Phone Number ID pertenece a esa WABA y está `CONNECTED` (muestra número, nombre y calidad);
   - la app está suscrita a la WABA (si no, ofrece suscribirla);
   - el webhook de la app apunta a la dirección del receptor.
3. **Guardar.** Solo se puede guardar si las comprobaciones críticas pasan. Los cambios se activan en el receptor y en
   la app **en menos de 30 s, sin reiniciar** (el receptor la relee de la base, como hace con el flujo del bot).
4. **Cambiar un solo secreto.** Dejar el campo vacío conserva el actual (aparece `••••••••`). Rotar el token es pegar
   uno nuevo y probar; si falla, el anterior sigue activo.
5. **Registrar el webhook.** Muestra la URL de devolución y el token de verificación, y el botón **Registrar en Meta**
   hace lo que hoy hace `tunel.py` (`POST /{app}/subscriptions`).
6. **Eliminar la conexión («Desconectar»).** Borra los tres secretos y deja el módulo en «Sin conexión». El bot deja de
   enviar y recibir, y la app lo avisa en Inicio y en la Bandeja. Pide escribir **DESCONECTAR** para confirmar.
7. **Ver el historial** de cambios (quién y cuándo, sin valores).

## Reglas

- **RC-01 · Los secretos solo se escriben.** Ninguna pantalla, API ni consulta devuelve su valor; se muestran como `••••`.
- **RC-02 · Una sola conexión activa.** Hay una fila en `meta_conexion`; cambiarla reemplaza a la anterior.
- **RC-03 · Probar antes de guardar.** No se guarda una conexión cuyo token, App Secret o número no pasen la prueba.
- **RC-04 · Sin reinicios.** El receptor y la app leen la conexión de la base y la refrescan cada 30 s.
- **RC-05 · Solo el Administrador.** Requiere `administrar_meta`; cada cambio queda en el historial sin valores.
- **RC-06 · Cambiar de app avisa de sus efectos.** Antes de guardar muestra que el webhook y la suscripción de la WABA
  deben apuntar a la app nueva y que las plantillas pertenecen a la WABA, no a la app.
- **RC-07 · Transición con respaldo.** Mientras la base no tenga conexión, el receptor y la app usan `.env.meta` como
  hoy; en cuanto se guarda una, manda la base. Al terminar la migración se retiran las variables de `.env.meta` y
  `crm/.env.local`.

## Dónde va (diseño)

- **Migración 0020:** `meta_conexion` (una fila: ids, número, nombre verificado, estado, `token_id`, `app_secret_id`,
  `verify_token_id`, última prueba y su resultado, actualizado por y en), `meta_conexion_historial`, permiso
  `administrar_meta`, funciones `meta_guardar(...)`, `meta_desconectar()` y `meta_secreto(nombre)`; RLS en todo.
- **`crm/src/lib/meta.ts`:** deja de leer `process.env` y pide la conexión a la base (con caché de 30 s).
- **Receptor Python (`db.py` / `receptor.py`):** `ENV` pasa a ser una función que lee de la base con respaldo en `.env.meta`.
- **Pantalla `/meta`** (Configuración → Meta, junto a Canal WhatsApp): formulario, lista de comprobaciones, webhook e historial.
- **Pruebas:** `supabase/pruebas/` (el rol `authenticated` no puede leer el Vault ni las funciones de secretos; un
  asesor no puede guardar; el historial no contiene valores) y una prueba en navegador del flujo conectar → probar →
  guardar → desconectar con una app de prueba.

## Bloques de trabajo (commit por bloque)

| Bloque | Entrega |
|---|---|
| **A · Base** | Migración 0020, permiso, funciones y pruebas SQL |
| **B · Lectura** | `meta.ts` y el receptor leen la conexión de la base con respaldo en `.env.meta` |
| **C · Pantalla** | `/meta`: formulario, Probar, Guardar, Registrar webhook, Desconectar e historial |
| **D · Migración** | Cargar la conexión actual desde `.env.meta`, comprobar y retirar los secretos de los archivos |

## Fuera de alcance

- Varias conexiones o varios números a la vez (RC-02).
- Subir las plantillas a Meta (ya está en Canal WhatsApp).
- Otros secretos del sistema (clave de Gemini, etc.). Si el patrón sirve, se amplía en otra mejora.
