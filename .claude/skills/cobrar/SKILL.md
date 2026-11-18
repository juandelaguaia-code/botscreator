---

name: cobrar
description: Modo agencia — genera el cobro a un negocio cliente (instalación o mensualidad) con un link de pago de Stripe de la agencia y un comprobante, y registra el pago. Úsala con "cóbrale al cliente", "genera el cobro", "link de pago de la mensualidad", "factura del bot".
---

# Cobrar a un cliente de la agencia

1. Confirma (una pregunta por mensaje): cliente · concepto (instalación, mensualidad de <mes>, extra) · monto y
   moneda · si es recurrente.
2. La llave de Stripe es **de la agencia**, no del bot del cliente. Si no la tiene a mano, pídele que la
   exporte en su terminal (`export STRIPE_SECRET_KEY=…`); nunca la pegues en archivos.
3. Crea el link con la API de Stripe (Checkout Session de pago único, `metadata[cliente]=<nombre>`), mostrando
   el comando antes de correrlo. Para montos en CLP u otras monedas sin decimales, el monto va tal cual; en USD,
   MXN o EUR, en centavos.
4. Arma el comprobante en `.yunque/cobros/<cliente>-<AAAA-MM>.md`: datos de la agencia y del cliente, concepto,
   monto, fecha, link de pago y estado "pendiente".
5. Entrega el link y un mensaje corto para mandarle al cliente. Cuando confirme el pago, actualiza el estado del
   comprobante y, si llevas la mensualidad en el portafolio (Modo agencia), revisa que el monto coincida.
