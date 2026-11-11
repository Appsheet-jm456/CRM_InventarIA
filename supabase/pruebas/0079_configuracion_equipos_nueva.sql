-- Pruebas de la migración 0079: «NUEVA» no paga configuración; «Semi nuevo» y usados sí. Con ROLLBACK.
begin;
select case when not carrito_lleva_configuracion('NUEVA') and not carrito_lleva_configuracion('Nuevo')
              and not carrito_lleva_configuracion(' nuevos ') then 'ok' else 'not ok' end || ' 1 - Nuevo, NUEVA y Nuevos no pagan configuración';
select case when carrito_lleva_configuracion('Semi nuevo') and carrito_lleva_configuracion('Usado · Grado A') and carrito_lleva_configuracion(null)
            then 'ok' else 'not ok' end || ' 2 - Semi nuevo, usados y sin estado sí pagan';
rollback;
