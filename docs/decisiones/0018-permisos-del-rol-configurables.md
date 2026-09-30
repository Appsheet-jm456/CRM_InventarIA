# 0018 · Usuarios propios, y los permisos son del rol que configura el administrador

**Estado:** Aceptada · 30 sep 2026 · Cierra F2·5

## Contexto

La v0 tiene una clave compartida para leer (`ACCESS_PASSWORD`) y otra para escribir
(`ACTION_PASSWORD`): no se sabe quién atendió a quién, no se pueden asignar chats y no se puede medir
a los asesores. El brief pide dos tipos de usuario (dueño/administrador y asesor), y Futur Green ya
resolvió roles y permisos (su decisión 0011).

## Decisión

- Cada persona entra con **su usuario y contraseña** (Supabase Auth, usuario guardado como
  `<usuario>@inventaria.local`).
- **Permisos** fijos que define el código; **roles** y sus permisos, editables desde la app.
- Las políticas de RLS y las funciones preguntan `tiene_permiso(...)`, **nunca el nombre del rol**.
- Se arranca con dos roles: **administrador** (del sistema, todos los permisos) y **asesor** (atender
  la bandeja y gestionar oportunidades). El asesor ve lo suyo y la cola sin asignar.
- El bot y los procesos del servidor usan la llave de servicio y no son usuarios.

El detalle (reglas RU-01 a RU-09, catálogo de permisos y políticas por tabla) está en
[USUARIOS-Y-PERMISOS.md](../USUARIOS-Y-PERMISOS.md).

## Salvaguarda

La base impide borrar el rol administrador, quitarle `administrar_usuarios` y desactivar al último
usuario activo que administra.

## Consecuencias

- Las claves `ACCESS_PASSWORD` y `ACTION_PASSWORD` quedan solo en la v0.
- Cada paso de la Fase 3 que cree una tabla agrega sus políticas con estos permisos.
