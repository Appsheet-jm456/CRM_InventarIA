# 0029 · Configuración Meta en la app, con los secretos en Vault

**Estado:** Propuesta · 3 oct 2026 · Diseño de F4·16 · Detalle en [CONFIGURACION-META.md](../CONFIGURACION-META.md)

## Contexto

La conexión con Meta (token, App ID, WABA, número, App Secret) está en `.env.meta` y `crm/.env.local`. Cambiarla pide
acceso al servidor y reiniciar servicios. El dueño pasa a una app y un número nuevos y quiere configurarlos desde la
interfaz, con los secretos siempre ocultos.

## Decisión (dueño, 3 oct 2026)

- Un módulo **Configuración → Meta** para agregar, modificar y eliminar la conexión.
- Los identificadores se ven; los secretos (**token, App Secret y token de verificación**) se guardan cifrados y solo se
  escriben, nunca se leen: se muestran como `••••••••`.
- Se guardan en **Supabase Vault** (ya disponible y probado en esta instancia), no en columnas de texto ni en archivos.
- Nuevo permiso `administrar_meta`, solo para el Administrador.
- Se prueba contra Meta antes de guardar; el receptor y la app releen la conexión cada 30 s, sin reiniciar.
- `.env.meta` queda como respaldo hasta migrar y después se retiran los secretos.

## Alternativas descartadas

- **Seguir con archivos `.env` y solo un formulario que los edite:** exige que la app escriba en el servidor, mezcla
  secretos con código y no deja historial.
- **Columna de texto cifrada con `pgcrypto`:** hay que inventar el manejo de la llave; Vault ya lo resuelve.
- **Mostrar el secreto con un botón «ver»:** si alguien lo puede ver, alguien lo puede robar; para cambiarlo basta escribir uno nuevo.

## Consecuencias

- Si se pierde `VAULT_ENC_KEY`, los secretos se vuelven a escribir: se respalda aparte (F5·2).
- La pantalla maneja secretos: solo por HTTPS o Tailscale.
- Cambiar de app arrastra el webhook y la suscripción de la WABA; la pantalla lo comprueba y lo avisa.
- Cada cambio queda en un historial sin valores.
