# Capacidad: ¿aguanta 100 clientes a la vez? (F4·31, F5·8)

> Análisis y mejoras del 7 nov 2026 (noche). Antecedente: [LEADS.md § Capacidad](LEADS.md#capacidad-1000-clientes-al-día-f431) (31 oct).
> **Respuesta corta: sí se puede usar para la empresa desde el servidor**, con la IA en la nube (OpenRouter) y las mejoras de abajo.
> El servidor y la base sobran; lo que no aguantaba era la IA local (una respuesta a la vez) y la Bandeja (recargaba todo).

## Cómo viaja un mensaje

```
Cliente → Meta → Cloudflare (bot.ventasvirtualcolombia.shop) → Receptor Python (8095, un hilo por mensaje, candado por cliente)
            ├─ Menú del bot (reglas, sin IA) ............. instantáneo
            ├─ Buscador de texto libre ................... IA: Gemini AI Studio → Cerebro en la nube → local (último recurso)
            ├─ Avi ....................................... Cerebro: principal y respaldo (nube)
            └─ Base Supabase (8020) → tiempo real → Bandeja de los asesores (crm.ventasvirtualcolombia.shop)
```

## Mediciones (7 nov 2026, en el servidor)

| Pieza | Medición | Veredicto |
|---|---|---|
| Servidor | Xeon E5-2689 de 16 hilos, 31 GB de RAM (20 GB libres), tarjeta AMD RX 580 | Sobra |
| Base de datos | 100 clientes a la vez (2 consultas c/u): mediana 38 ms, peor 69 ms | Sobra |
| Receptor | `ThreadingHTTPServer`: un hilo por mensaje y candado por cliente | Aguanta |
| Avi (DeepSeek, nube) | 1,9 s promedio, 7 s el peor (Registro de IA, 10 días) | Aguanta |
| IA local (llama.cpp, `RANURAS=1`) | 1 sola: 3 s; 5 a la vez: la última 11,6 s (~2,3 s cada una, en fila) | **No aguanta picos**: 100 a la vez = ~4 min; el buscador corta a los 40 s |
| Bandeja | Recargaba 300 clientes + oportunidades con cada cambio, en cada navegador | **Se ponía lenta** con muchos chats |
| Presupuesto de Avi | US$ 5/mes; ~US$ 0,0013 por respuesta → ~3.900 respuestas/mes | **Corto** cuando Avi salga de la lista blanca |
| Prueba de carga (3 clientes, `prueba_carga.py`) | 9/9 mensajes guardados, 0 sin respuesta, 3,3 s (casi todo es la pausa «humana» del bot) | Funciona; falta la de 100 |

## Qué se hizo (7 nov 2026)

1. **OpenRouter en el Cerebro** (migración 0055, 3 pruebas SQL): proveedor nuevo en Configuración → Agente → Cerebro. Con **una sola llave**:
   principal `deepseek/deepseek-v4-flash` (US$ 0,091 / 0,182 por millón) y respaldo de **otra empresa** `google/gemini-2.5-flash-lite`
   (0,10 / 0,40), los dos en la nube y en paralelo. Precios de `openrouter.ai/api/v1/models` del 8 nov 2026: confirmarlos al configurar.
   La IA local queda solo como último recurso hasta tener un equipo con mejor tarjeta de video.
2. **El buscador usa el Cerebro en la nube** (`interprete._con_cerebro`): Gemini de AI Studio si hay llave, si no el principal y el respaldo del
   Cerebro (nunca el local por esta vía), y al final el local. Respeta el tope del mes y queda en el Registro de IA. `prueba_interprete_ia.py` 15/15.
3. **Bandeja**: cada cambio trae **solo los chats que cambiaron** (en un lote cada 250 ms) en vez de los 300; la lista completa se recarga cada 30 s
   como respaldo. Bandeja, aviso de cola y Embudo ya no posponen la recarga sin fin con mensajes seguidos (como mucho una cada 250 ms, 400 ms y 1 s).
4. **F5·8 · El receptor espera a la base al arrancar** (`receptor.esperar_base`, hasta 5 min) en vez de salir y reiniciarse 22 veces. `prueba_arranque.py` 4/4.
5. **Prueba de carga** `prueba_carga.py`: N clientes falsos (`5799955…`) con el receptor, la base y la IA reales, **sin enviar a Meta**; mide
   tiempos, mensajes perdidos y sin respuesta, y borra los clientes al final.

## Prueba de 100 y ajustes de rendimiento (11 nov 2026)

- **Prueba de 100 clientes a la vez** (`prueba_carga.py --ejecutar`, sin enviar a Meta): **300 de 300 mensajes guardados, 0 sin respuesta**,
  respuesta del bot en mediana 3,3 s y la más lenta 3,4 s (casi todo es la pausa «humana»), 20 s en total. ✅ aguanta.
- **Postgres ajustado al servidor** con `supabase/ajustar-postgres.sh` (corría con los valores de fábrica, 128 MB): `shared_buffers` 2 GB,
  `effective_cache_size` 8 GB, `work_mem` 16 MB, SSD. Quedan en `postgresql.auto.conf`; **tras restaurar en otro servidor, correr el script**
  (`--deshacer` vuelve atrás).
- **Migración 0075**: 19 índices en claves foráneas (oportunidades, historial, leads, mensajes, pagos, alistamientos…).
- **Sesión en un solo viaje**: perfil, rol y permisos en una consulta, y el layout la pide en paralelo con la apariencia.
- Revisado: no hay sondeo constante sobre `leads` (0 escaneos por minuto en vivo); los contadores altos eran históricos.

## Lo que hace el dueño

1. Crear la llave en openrouter.ai (con saldo, p. ej. US$ 10) y en **Configuración → Agente → Cerebro**: principal **OpenRouter** con
   `deepseek/deepseek-v4-flash`, respaldo **OpenRouter** con `google/gemini-2.5-flash-lite`, pegar la **misma llave en los dos**, «Probar conexión».
   La llave va a Vault: no se pega en el chat ni en archivos.
2. Subir el **presupuesto del mes** antes de abrir Avi a todos los clientes (hoy US$ 5 y lista blanca de 2 números).
3. Probar la Bandeja con mensajes de prueba (que el chat suba solo, sin recargar).
4. Avisar al equipo y correr la prueba de 100 clientes: `python3 herramientas/meta-webhook-prueba/prueba_carga.py --ejecutar` (unos 2 minutos;
   los clientes falsos se ven en la Bandeja mientras corre).

## Lo que sigue (no hecho)

- Embudo: columnas paginadas por etapa (hoy corta en 1.000 oportunidades).
- Tiempo real filtrado por lo que ve cada asesor (hoy cada navegador recibe todos los eventos; con 3 o 4 personas no pesa).
- Índices de búsqueda por texto en nombre, teléfono y mensajes.
- Costo de Meta y medio de pago (F1·6), luz y UPS (F5·6).
- IA local: más ranuras (`RANURAS`) solo con una tarjeta de video con más memoria.
