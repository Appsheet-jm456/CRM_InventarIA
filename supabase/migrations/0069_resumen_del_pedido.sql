-- 0069 · Resumen del pedido después del cierre de la compra (F4·64, docs/FLUJO-DEL-BOT.md, RF-46 a RF-51).
-- · agente_config.resumen_pedido_activo y texto_resumen_pedido: el interruptor y el texto editable en Agente → Compra.
-- · alistamientos.resumen_enviado_en: el resumen se envía una sola vez por pedido (RF-50).
-- El resumen lo arma el receptor con datos de la base (pedido, pagos validados y ficha del cliente); no hay que republicar el bot.

alter table public.agente_config
  add column resumen_pedido_activo boolean not null default true,
  add column texto_resumen_pedido text not null default E'🧾 *Resumen de tu pedido* {pedido}\n\n💻 *Equipos*\n{equipos}\n\n💰 Total: *{total}*\n✅ Pagado: *{pagado}*{saldo}\n\n📦 *Entrega:* {entrega}\n{datos}\n\nSi algo no está correcto, escríbelo por aquí y un asesor te ayuda. 🙌'
    check (length(texto_resumen_pedido) <= 1500);
grant select (resumen_pedido_activo, texto_resumen_pedido), update (resumen_pedido_activo, texto_resumen_pedido) on public.agente_config to authenticated;

alter table public.alistamientos add column resumen_enviado_en timestamptz;
