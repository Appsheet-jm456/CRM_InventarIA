-- 0074 · Instructivo del comprobante después de las cuentas (F4·68, docs/AGENTE.md RAG-81 a RAG-84).
--
-- Pedido del dueño (11 nov 2026): después de las cuentas el cliente no sabía que tenía que mandar el comprobante. Tercer mensaje,
-- editable en Agente → Compra; vacío = no se envía. agente_config da permisos columna por columna (0031): sin el grant la pantalla no lo ve.

alter table public.agente_config add column texto_instructivo_pago text not null
  default '📎 *Último paso:* envíanos por aquí el *comprobante de pago* en foto (JPG) o PDF y un asesor validará tu pago. ✍️ Puedes escribir *Envío comprobante de pago* junto con el archivo.'
  check (length(texto_instructivo_pago) <= 1024);
grant select (texto_instructivo_pago), update (texto_instructivo_pago) on public.agente_config to authenticated;
