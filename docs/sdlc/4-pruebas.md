# Fase 4 · Pruebas

**Estado:** ⚪ Pendiente

> Que lo que importa tenga una prueba que falle si se rompe.

## Criterio de cierre

- [ ] Reglas con prueba (pgTAP): un contacto por teléfono, el embudo no retrocede solo y
      Perdido exige motivo
- [ ] Permisos con prueba: el asesor solo ve lo suyo y lo sin asignar, incluidos los casos que
      deben fallar
- [ ] Motor del bot con prueba por nodo: cada opción lleva al nodo correcto, el código dentro de
      una frase devuelve la ficha y `9` pasa a asesor desde cualquier paso
- [ ] Webhook con prueba: un mensaje repetido del canal no se duplica
- [ ] Flujo completo probado con un número de prueba: cliente → bot → asesor → venta
