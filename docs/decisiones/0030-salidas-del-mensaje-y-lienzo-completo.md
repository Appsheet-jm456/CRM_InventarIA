# 0030 · Salidas del Mensaje (estilo Kommo) y lienzo a pantalla completa

**Estado:** Aceptada · 3 oct 2026 · Amplía la 0027 y la 0028 · Diseño de F4·17 y F4·18

## Contexto

El dueño estudió los Salesbots de Kommo y pidió dos mejoras al lienzo de Bot y horario: que el cuadro **Mensaje** tenga tres salidas
más abajo de sus opciones (**Otra respuesta**, **Sin respuesta** y **Error al enviar el mensaje**) y que el lienzo ocupe **toda la
pantalla** con botones Guardar y Cancelar.

## Decisión (dueño, 3 oct 2026)

- Las tres salidas son **opcionales**: sin conectar, el bot se comporta como hoy. Un Mensaje con botones muestra las tres; sin botones muestra
  «Sin respuesta» y «Error al enviar» (ya tiene «Cuando el cliente responda»). Reglas RF-20, RF-21 y RF-22 en [FLUJO-DEL-BOT.md](../FLUJO-DEL-BOT.md).
- **Otra respuesta** gana a la búsqueda con IA solo en el cuadro donde el dueño la conectó; las reglas globales siguen primero (RF-11). Es una
  excepción acotada a la 0016 (híbrido): la decide el dueño cuadro por cuadro, y la respuesta sigue saliendo de la base.
- **Sin respuesta** lleva su tiempo por cuadro (por defecto 15 min) y usa el reloj de la Pausa y sus reglas (RF-15).
- **Error al enviar** cuenta el rechazo inmediato de Meta y el estado `failed` que llega después por el webhook. Cada mensaje del bot guarda
  en qué cuadro salió para poder ligar el `failed`.
- **Pantalla completa:** el lienzo se abre sobre toda la pantalla, con barra superior (← Cancelar, Probar, Publicar…, Guardar). Se **mantiene el
  borrador**: cada cuadro se guarda en el borrador y se publica aparte; «Cancelar» sale sin descartar el borrador.

## Alternativas descartadas

- **Guardado en bloque estilo Kommo** (nada se escribe hasta Guardar, Cancelar descarta todo): obliga a rehacer cómo se guardan cuadros, flechas y
  posiciones, y duplica lo que ya hacen el borrador y las versiones.
- **Tiempo fijo de «Sin respuesta» para todos los bots:** menos flexible; el dueño puede querer 10 min en un mensaje y 2 h en otro.
- **Contar solo el rechazo inmediato como error:** se perderían los fallos que Meta avisa después, que son los más comunes.

## Consecuencias

- Migración `0021`: `salidas_opcionales`, validación al guardar y al publicar, y columnas `cuadro`, `desde_error` y `error_atendido` en `mensajes`.
  La de F4·14 (arranques por palabra y etapa) pasa a la `0022`.
- Un `failed` por la ventana de 24 h suele repetirse con el siguiente mensaje: el dueño decide a dónde lleva «Error al enviar».
- Hay que evitar bucles: «Sin respuesta» no puede apuntar a su propio cuadro y una respuesta sigue encadenando como máximo 10 cuadros.
