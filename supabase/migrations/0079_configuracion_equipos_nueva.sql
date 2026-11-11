-- 0079 · Configuración (F4·48 y F4·72): los equipos con estado «NUEVA» (o «Nuevos», «Nuevas») tampoco pagan la configuración.
-- La regla eximía solo lo que empieza por «nuevo», y los HP nuevos están cargados como «NUEVA»: pagaban $80.000 por error.
-- Ahora se exime todo lo que empieza por «nuev». «Semi nuevo» y los usados siguen pagando. La misma regla está en
-- flujo.lleva_configuracion (bot, compra y cotización) y en la pestaña Carrito de la Ficha.
create or replace function public.carrito_lleva_configuracion(p_estado text) returns boolean
language sql immutable
as $$ select not lower(btrim(coalesce(p_estado, ''))) like 'nuev%' $$;
