-- 0046 · Acción «Pregunta por un equipo» (F4·42, docs/AGENTE.md RAG-43 a RAG-48). Pedido del cliente Ventas Tech (6 nov 2026).
-- Cuando: {"forma": "equipo", "texto": "…", "exigir": bool, "palabras": [...], "marca": bool} = el mensaje nombra un equipo del inventario
-- (código o modelo, sin IA). Hacer: {"tipo": "ficha_equipo", "encabezado", "plantilla", "cierre", "varios", "cierre_varios", "agotado",
-- "si_agotado": "parecidos"|"asesor"|"nada", "foto": bool}. El motor está en herramientas/meta-webhook-prueba/acciones.py.
-- Nace apagada, como todas (F4·24), y después de las de frases: «Quiero comprar», «Cotización» y «Asesor» ganan antes (RAG-48).
insert into public.acciones (nombre, prioridad, activa, cuando, hacer)
select 'Pregunta por un equipo', coalesce((select max(prioridad) from public.acciones where prioridad <= 70), 70) + 5, false,
  '[{"forma": "equipo", "texto": "un equipo del inventario", "exigir": false, "palabras": ["cuanto", "vale", "precio", "valor", "info", "informacion", "tienen", "disponible", "caracteristicas"], "marca": false}]',
  jsonb_build_array(jsonb_build_object(
    'tipo', 'ficha_equipo',
    'encabezado', E'¡Hola {nombre}! 👋🔥\nGracias por tu interés en nuestro *{equipo}*.',
    'plantilla', E'🎮 {procesador}\n🚀 {grafica}\n🧠 {ram}\n💾 {disco}\n🌈 {teclado}\n✨ Estado estético {estado_estetico}\n💰 *{precio}*',
    'cierre', '¿Te lo separo? Escribe *quiero comprar {codigo}* o pregúntame lo que necesites.',
    'varios', 'Tenemos estas opciones de *{modelo}* 👇',
    'cierre_varios', '¿Cuál te interesa? Escríbeme su *código*.',
    'agotado', '😕 El *{modelo}* no está disponible en este momento.',
    'si_agotado', 'parecidos',
    'foto', true))
where not exists (select 1 from public.acciones where nombre = 'Pregunta por un equipo');
