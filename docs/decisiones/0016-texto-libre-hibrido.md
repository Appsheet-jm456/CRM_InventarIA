# 0016 · Texto libre: reglas, Gemini y qwen3 local, con respuesta siempre desde la base

**Estado:** Aceptada · 30 sep 2026 · Confirmada por el dueño el 1 oct 2026 (brief v1.2) · Modifica la 0005 · Cierra P-11 (F1·9)

## Contexto

En la prueba el cliente escribió cosas como "1.5" o "quiero comprar", y el dueño pregunta qué pasa con
"¿qué equipos tienes i5 10 en Dell?". El bot guiado no las entiende. La 0005 prohibía la IA para no
inventar precios.

## Decisión

El bot sigue **guiado por el árbol**, y cuando el cliente escribe algo que no es una opción:

1. **Reglas** (instantáneas, gratis): marca, i3/i5/i7/i9, generación, RAM, montos ("1.5", "1.500.000",
   "millón y medio"), uso y frases de compra ("lo quiero", "quiero comprar").
2. Si las reglas no alcanzan, **Gemini** (clave de AI Studio) extrae los filtros; si Gemini falla o no
   hay clave, **qwen3 local** (llama.cpp en el servidor, 10–12 s, el bot avisa "Estoy buscando…").
3. **La IA solo devuelve filtros en JSON.** La búsqueda se hace en `productos` y la respuesta la arma
   una plantilla con los datos de la base: la IA nunca escribe precios ni condiciones.
4. Si no hay filtros entendibles, sigue el manejo de error del árbol (B-ERR, a asesor a las 3).

## Consecuencias

- La clave de Gemini que tiene la v0 no es válida para la API (empieza por "AQ.", las de AI Studio por
  "AIza"): hasta tener una nueva, la capa de IA es qwen3 local.
- Lo que el cliente escribe viaja a Google solo cuando las reglas no lo entienden.
