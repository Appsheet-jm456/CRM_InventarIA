# Fase 2 · Diseño

**Estado:** 🔵 En curso

> Define **cómo** se construye: arquitectura, modelo de datos y seguridad.

## Criterio de cierre

- [ ] Reglas del negocio escritas: `REGLAS_DEL_NEGOCIO.md`
- [ ] Modelo de datos: `MODELO_DE_DATOS.md`
- [x] Arquitectura del frontend: `Shell` con panel lateral plegable, `modulos.ts` y rutas por módulo (decisión 0009) → [ARQUITECTURA-FRONTEND.md](../ARQUITECTURA-FRONTEND.md), decisión 0017
- [x] Interfaz de canal con el adaptador de la **Cloud API de Meta** y firma del webhook (decisión 0010) → F3·3. El túnel con dominio propio sigue en F2·10
- [x] Bot de un mensaje por respuesta con botones y listas interactivas, y contador de consumo (decisión 0011) → F3·4, F3·8
- [x] Máquina de estados del bot sobre `bot_nodos`, con horario de atención y paso a asesor → F3·4, F3·7
- [x] Usuarios, roles y permisos (RLS) definidos → [USUARIOS-Y-PERMISOS.md](../USUARIOS-Y-PERMISOS.md), decisión 0018
- [x] Seguimientos y SLA: cómo se programan y quién los dispara → [SEGUIMIENTOS-Y-SLA.md](../SEGUIMIENTOS-Y-SLA.md), decisión 0021
- [ ] Maqueta de la bandeja, el kanban, el editor del bot y las métricas
- [ ] Esquema reproducible desde cero: migraciones 0001–0009 numeradas y con pruebas; falta correrlas contra una instancia vacía

---

## Arquitectura propuesta

```
Cliente WhatsApp
   │
Meta Cloud API ─webhook─►  /api/canal/meta       ──►  normalizar  ──►  mensajes (Supabase)
(túnel Cloudflare, firma verificada)                         │
                                                    ┌────────┴────────┐
                                             ¿bot activo?        bandeja en tiempo real
                                                    │            (Supabase Realtime)
                                          motor sobre bot_nodos        │
                                                    │                asesor responde
                                                    └──► canal.enviar() ◄┘
```

- **El webhook de Meta llega directo a la app** por el túnel, con la firma `X-Hub-Signature-256`
  verificada. n8n sale del camino del mensaje.
- **Frontend:** el `Shell` de Futur Green (panel lateral plegable y cajón en el celular) con
  una ruta por módulo (decisión 0009).
- **Todo mensaje entra y sale por la tabla `mensajes`.** El CRM es dueño del historial, y
  Evolution solo transporta.
- **Búsqueda por teléfono con índice único**: se acaba recorrer todos los leads por mensaje.
- **Tiempo real** con Supabase Realtime, sin sondeo cada 5 s.

## Modelo de datos (borrador)

| Tabla | Para qué |
|---|---|
| `contactos` | Una fila por teléfono (único): nombre, origen, etiquetas |
| `conversaciones` | Hilo por contacto y canal: estado (bot / en cola / asignada / cerrada), asesor asignado, estado del bot (`paso_menu`) |
| `mensajes` | Entrantes y salientes: tipo (texto, imagen, audio, documento, video o interactivo), media en Storage, id externo del canal, quién lo envió, **categoría de Meta (servicio, utilidad o marketing) y si fue cobrable** |
| `plantillas` | Plantillas de Meta aprobadas, con su categoría, para escribir fuera de la ventana de 24 h |
| `etapas` | Columnas del embudo con orden y color |
| `oportunidades` | Contacto, etapa, valor estimado, producto de interés y motivo de pérdida |
| `historial_etapas` | Cada cambio de etapa, con quién y cuándo (base de las métricas) |
| `tareas_seguimiento` | Qué hacer, con quién, cuándo y su estado |
| `respuestas_rapidas` | Atajos de texto del equipo |
| `bot_nodos` | Árbol del menú: texto, opciones y acción (ir a nodo, enviar catálogo, ficha, cotizar o asesor) |
| `horario_atencion` | Días y horas, con el mensaje fuera de horario |
| `usuarios`, `roles`, `rol_permisos`, `permisos` | Con Supabase Auth ([USUARIOS-Y-PERMISOS.md](../USUARIOS-Y-PERMISOS.md)) |
| `productos` | Inventario migrado de Baserow: código, specs, precio, stock, fotos y video |
