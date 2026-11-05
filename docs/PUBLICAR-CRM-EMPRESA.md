# Poner el CRM a trabajar para la empresa desde el servidor (estudio)

`Para estudiar` · 5 nov 2026 · **Sin decisión del dueño todavía.** No se cambió nada en el servidor ni en el código.

> La pregunta del dueño: mientras se despliega en la nube, ¿se puede usar el CRM de la empresa desde este servidor, como se
> hizo con la Escuela de Música (Tailscale Funnel)? ¿Por el camino A o por el B? ¿Pueden conectarse otras cuentas de Tailscale?
> Este documento reúne lo que se verificó, las opciones, una recomendación y lo que falta decidir.
> Complementa [TUNEL-WEBHOOK.md](./TUNEL-WEBHOOK.md) (opciones A y B del webhook) y [PLAN-PRODUCCION-META.md](./PLAN-PRODUCCION-META.md).

---

## 1. Qué hay hoy (verificado el 5 nov 2026)

| Pieza | Estado |
|---|---|
| App del CRM | Servicio de usuario `crm-inventaria-app`, `next start` en el puerto **8096** |
| Receptor del webhook | `crm-meta-receptor`, puerto **8095**. `GET/POST /webhook` es lo que llama Meta; `/interno/*` exige un token propio |
| Túnel del webhook | `crm-meta-tunel`: túnel **rápido** de Cloudflare, de **prueba**. Su dirección cambia al reiniciarse y se registra sola en Meta. El 1 oct Cloudflare lo borró y el bot dejó de responder horas |
| Base del CRM | Supabase propio, puerto **8020** (el de la Escuela es otro, el 8030). Registro público apagado (`DISABLE_SIGNUP=true`) |
| Tailscale Funnel | **Ya está en uso** por la Escuela: `https://atlasjm.taile98044.ts.net`, puerto 443, con las rutas `/`, `/auth/v1`, `/rest/v1` y `/storage/v1` |
| Puertos que permite Funnel | Solo 443, 8443 y 10000. El 443 lo usa la Escuela; el 8443 lo ocupa otro servicio que no se identificó; el 10000 está libre |
| Cloudflare en el servidor | `~/.cloudflared` no existe: el servidor **no está autorizado** con ninguna cuenta de Cloudflare |
| Dominio de la empresa | PLAN-PRODUCCION-META dice que el dueño ya compró uno en Hostinger, pero **su nombre no está anotado** y no se sabe si ya está en Cloudflare |
| Operador de Tailscale | No configurado: los comandos de Tailscale piden `sudo`, así que los corre el dueño |
| Respaldos del CRM | **No hay.** El cron solo respalda la web de ventas virtuales |

## 2. Qué hay que publicar y qué no

| | ¿Pública? | Por qué |
|---|---|---|
| `/webhook` del receptor (8095) | **Sí, es obligatorio** | Meta necesita llamarlo. Valida la firma `X-Hub-Signature-256` y descarta lo demás |
| Pantalla del CRM (8096) | Solo si el equipo entra desde fuera | Es un login con clientes y conversaciones reales |
| API de Supabase del CRM (8020) | Solo si se publica la pantalla | La Bandeja y el embudo hablan con ella desde el navegador |
| Studio, n8n, Evolution API, Nextcloud, SSH | **Nunca** | Están en el mismo servidor y no tienen por qué verse |
| `/interno/*` del receptor | **Nunca** | Solo lo llama la propia app |

## 3. Lo que complica publicar la pantalla (hallazgo)

`crm/src/lib/supabase/navegador.ts` arma la dirección de la base así: **el mismo nombre del equipo por el que se abrió la app,
más el puerto 8020**. Sirve por la red local y por Tailscale. Por Funnel no: la dirección sería
`https://atlasjm.taile98044.ts.net:8020`, y ese puerto no se puede publicar.

Por eso publicar la pantalla **no es solo configuración**; hay que:

1. Cambiar el código del navegador para que use una dirección configurable (por ejemplo por ruta, como en la Escuela).
2. Recompilar con la dirección pública (`.env.production.local`), como en la Escuela.
3. Ajustar la configuración del login de Supabase del CRM, que hoy apunta a `localhost`: `SITE_URL=http://localhost:3020`,
   `API_EXTERNAL_URL=http://localhost:8020/auth/v1` y `ADDITIONAL_REDIRECT_URLS` vacío.
4. Comprobar el **tiempo real** (websockets) por la ruta pública. La Bandeja depende de él y **no se ha verificado** que Funnel lo
   deje pasar.

## 4. Opciones

| | **A. Solo el webhook** | **B. Webhook y pantalla por Funnel** | **C. Cloudflare con dominio propio** |
|---|---|---|---|
| Qué se publica | `/webhook`, en el 443 | Además la pantalla y la API de Supabase, en el 10000 | `bot.<dominio>/webhook` y, si se quiere, `crm.<dominio>` |
| Dirección del webhook | Fija, sin dominio | Fija, sin dominio | Fija, con dominio |
| Cómo entra el equipo | Con **Tailscale** | Desde cualquier lugar | Desde cualquier lugar, con **Cloudflare Access** (un código al correo) |
| Costo | Cero | Cero | El dominio, que ya existe (ver §1) |
| Trabajo | Poco: pasos A1 a A9 de TUNEL-WEBHOOK | Alto: código, login, tiempo real y pruebas | Medio: pasos B1 a B11 de TUNEL-WEBHOOK |
| Riesgo | Bajo | Alto: login de un sistema con datos reales abierto a internet | Medio, controlado por Access |
| Cada persona necesita | Tailscale en su equipo | Nada | Su correo |
| Depende del plan de Tailscale | Sí (§6) | Sí (§6) | **No** |
| Estado en las tareas | F2·17, pendiente | No existe | F2·10, pendiente |

## 5. Recomendación

1. **Ahora: opción A**, para dejar el webhook en una dirección fija y apagar el túnel de prueba (F2·17, ya documentada). Es poco
   trabajo y no abre la pantalla.
2. **Cuando el dominio esté en Cloudflare: opción C** (F2·10). Es el destino que ya decidió la 0010 y, además, deja entrar al
   equipo sin instalar nada y sin depender de las condiciones de Tailscale.
3. **La opción B no se recomienda:** exige cambiar código y abre el login de la empresa, para resolver algo que la C resuelve mejor.

El webhook va en el 443, que Meta seguro acepta. La documentación de Meta consultada no confirma si acepta otros puertos.

## 6. Tailscale: cuentas de otras personas y plan gratuito

- **Cada persona usa su propia cuenta.** Nunca se comparte la del dueño (`appsheetjm`): además de no estar permitido, daría acceso a todo.
- **Dos formas de dar acceso:**
  - *Invitar a la red:* entra con su correo y cuenta como usuario del plan.
  - *Compartir solo el servidor:* acceso a ese equipo sin entrar a la red del dueño. **Cuidado:** por defecto podría llegar a todos
    los servicios del servidor (Studio, n8n, Evolution, Nextcloud, SSH). Hay que limitarlo con reglas de acceso (ACL); no se
    confirmó cómo se aplican los puertos en un equipo compartido.
- **Plan gratuito:** la documentación consultada lo da hasta **6 usuarios**. La página de precios lo describe como **para uso no
  comercial**. Para el CRM de una empresa probablemente haga falta un plan de pago. **Confirmarlo con Tailscale antes de depender
  de esto.** También aplica al webhook por Funnel.
- La opción C evita este punto. Que el plan gratuito de Cloudflare permita uso comercial es lo esperado, pero hay que confirmarlo.

## 7. Antes de usar el CRM con datos reales

| # | Qué | Por qué |
|---|---|---|
| 1 | **Respaldos automáticos** de la base y de los archivos (§8) | Hoy un fallo del disco perdería clientes y conversaciones |
| 2 | Contraseñas largas en todas las cuentas del CRM y de Meta | Es el acceso a clientes y a las llaves de Meta y DeepSeek |
| 3 | Revisar que ninguna cuenta de prueba quede activa | |
| 4 | Comprobar qué arranca solo tras un reinicio | La Escuela quedó verificada; **el CRM falta**: `crm-inventaria-app`, `crm-meta-receptor`, `crm-llama` y `crm-meta-tunel` |
| 5 | Saber qué pasa si el servidor cae | Un solo equipo, sin respaldo de luz ni de internet. Quién atiende a los clientes y cómo se avisa |
| 6 | Política de datos | Hay clientes reales; aplica la Ley 1581 (ver PLAN-PRODUCCION-META) |

## 8. Respaldos del CRM (propuesta)

- **Qué copiar:** la base (`crminventaria-supabase-db`, con `pg_dump`, que incluye las cuentas de acceso), los archivos de Storage,
  `crm/uploads/` (fotos de clientes) y los `.env`, estos últimos solo con permisos de lectura para el dueño y fuera de git.
- **Cómo:** una copia diaria y otra cada hora que solo actúe si falta la del día, igual que `supabase-diario.py` de la web de
  ventas virtuales, que sirve de modelo. Aquel script lee por la API y guarda JSON; para el CRM conviene `pg_dump`.
- **Dónde:** `~/respaldos/crm-inventaria/AAAA-MM-DD/`, con los últimos 14 días. **Es otra carpeta del mismo disco:** protege de
  borrados y errores, no de un fallo del equipo. Para eso hace falta una copia fuera (el dueño decide dónde).
- **Probar la restauración** al menos una vez, en una base aparte. Una copia que no se ha restaurado no se sabe si sirve.

## 9. Cuidados al compartir servidor con la Escuela

- `sudo tailscale funnel reset` **borra todo lo publicado**, también el webhook del CRM. Para apagar solo una parte, el comando debe
  ser por puerto o por ruta; se verifica al montarlo.
- La ruta `/webhook` en el 443 no choca con las rutas de la Escuela (`/`, `/auth/v1`, `/rest/v1`, `/storage/v1`), pero se comprueba
  al montarla.
- Un error en la demo de la Escuela no debería tumbar el CRM: son servicios y bases distintas.
- Cada cambio en la app compilada pide `npm run build` y reiniciar el servicio.

## 10. Lo que no se sabe

- Si el tiempo real (websockets) pasa por Funnel.
- Si Meta acepta el webhook en un puerto distinto del 443.
- Quién usa el 8443.
- El nombre del dominio de la empresa y si ya está en Cloudflare.
- Si el plan gratuito de Tailscale permite este uso, y cómo limitar un equipo compartido.
- Qué servicios del CRM arrancan solos tras un reinicio.
- Cuántas personas del equipo necesitan entrar, y desde qué dispositivos.

## 11. Decisiones del dueño

1. ¿Cuántas personas entran al CRM, y desde qué dispositivos (computador de oficina, celular)?
2. ¿Cómo se llama el dominio de la empresa y ya está en Cloudflare?
3. ¿Se acepta la opción A ahora y la C después?
4. ¿Dónde se guarda la copia de respaldo fuera del servidor?

## 12. Orden propuesto

1. Respaldos del CRM, con una restauración probada.
2. Opción A: pasos A1 a A9 de TUNEL-WEBHOOK (el dueño corre los comandos de Tailscale con `sudo`; el resto lo hace Claude).
3. Probar un reinicio del servidor y revisar el CRM (§7.4).
4. Opción C cuando el dominio esté en Cloudflare.
5. Pasar a la nube (F5), que reemplaza todo lo anterior.

Referencias: [TUNEL-WEBHOOK.md](./TUNEL-WEBHOOK.md) · [PLAN-PRODUCCION-META.md](./PLAN-PRODUCCION-META.md) ·
[decisión 0010](./decisiones/) · guía de la Escuela: `~/Mision-Bezer-Escuela_Musica/docs/PUBLICAR_PROTOTIPO.md`.
