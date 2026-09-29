# Fase 2 · Diseño

**Estado:** ⚪ Pendiente

> Define **cómo** se construye: arquitectura, modelo de datos y seguridad.

## Criterio de cierre

- [ ] Reglas del negocio escritas: `REGLAS_DEL_NEGOCIO.md`
- [ ] Modelo de datos: `MODELO_DE_DATOS.md`
- [ ] Interfaz de canal definida (entrada normalizada y envío) con el adaptador de Evolution
- [ ] Máquina de estados del bot sobre `bot_nodos`, con horario de atención y paso a asesor
- [ ] Usuarios, roles y permisos (RLS) definidos
- [ ] Seguimientos y SLA: cómo se programan y quién los dispara
- [ ] Maqueta de la bandeja, el kanban, el editor del bot y las métricas
- [ ] Esquema reproducible desde cero: migraciones numeradas y probadas contra una instancia vacía

---

## Arquitectura propuesta

```
Cliente WhatsApp
   │
Evolution API ──webhook──►  /api/canal/evolution  ──►  normalizar  ──►  mensajes (Supabase)
(Meta Cloud API después)                                     │
                                                    ┌────────┴────────┐
                                             ¿bot activo?        bandeja en tiempo real
                                                    │            (Supabase Realtime)
                                          motor sobre bot_nodos        │
                                                    │                asesor responde
                                                    └──► canal.enviar() ◄┘
```

- **El webhook llega directo a la app.** n8n sale del camino del mensaje.
- **Todo mensaje entra y sale por la tabla `mensajes`.** El CRM es dueño del historial, y
  Evolution solo transporta.
- **Búsqueda por teléfono con índice único**: se acaba recorrer todos los leads por mensaje.
- **Tiempo real** con Supabase Realtime, sin sondeo cada 5 s.

## Modelo de datos (borrador)

| Tabla | Para qué |
|---|---|
| `contactos` | Una fila por teléfono (único): nombre, origen, etiquetas |
| `conversaciones` | Hilo por contacto y canal: estado (bot / en cola / asignada / cerrada), asesor asignado, estado del bot (`paso_menu`) |
| `mensajes` | Entrantes y salientes: tipo (texto, imagen, audio, documento, video), media en Storage, id externo del canal y quién lo envió |
| `etapas` | Columnas del embudo con orden y color |
| `oportunidades` | Contacto, etapa, valor estimado, producto de interés y motivo de pérdida |
| `historial_etapas` | Cada cambio de etapa, con quién y cuándo (base de las métricas) |
| `tareas_seguimiento` | Qué hacer, con quién, cuándo y su estado |
| `respuestas_rapidas` | Atajos de texto del equipo |
| `bot_nodos` | Árbol del menú: texto, opciones y acción (ir a nodo, enviar catálogo, ficha, cotizar o asesor) |
| `horario_atencion` | Días y horas, con el mensaje fuera de horario |
| `usuarios`, `roles` | Con Supabase Auth |
| `productos` | Inventario migrado de Baserow: código, specs, precio, stock, fotos y video |
