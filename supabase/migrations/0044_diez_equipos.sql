-- 0044 · Avi muestra hasta 10 equipos por respuesta (pedido del dueño, 3 nov 2026) y los catálogos de Avi Ventas usan la categoría que busca Avi.
-- El tope pasa de 5 a 10. El valor que eligió el dueño no se toca: lo cambia él en Configuración → Agente → Avi.

alter table agente_config drop constraint agente_config_max_equipos_check;
alter table agente_config add constraint agente_config_max_equipos_check check (max_equipos >= 1 and max_equipos <= 10);

-- Los catálogos de F4·39 se cargaron como «Portátiles usados»; el bot y Avi buscan «Portátiles» (se comparan sin tildes).
update catalogos set categoria = 'Portátiles' where categoria = 'Portátiles usados';
