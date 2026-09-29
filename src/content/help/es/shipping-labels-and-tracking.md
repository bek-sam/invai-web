---
title: Compra una etiqueta de envío y llévale el rastreo al comprador
slug: shipping-labels-and-tracking
lang: es
roles: [owner, office]
device: desktop
screens: [Shipping]
updated: 2026-09-28
checked_against: invai-web d092a4b el 2026-09-28
---

# Compra una etiqueta de envío y llévale el rastreo al comprador

**Lo que ves:** Un pedido empacado en **Listos para enviar**, en la página **Envíos**, sin etiqueta
comprada todavía.

**Por qué:** Un pedido no puede tener etiqueta hasta que todas sus unidades estén empacadas en el
taller. Una vez en la lista **Listos para enviar** de **Envíos**, InvAI compara tarifas de paquetería, compra la etiqueta, y
(cuando el canal lo permite) envía el número de rastreo al marketplace automáticamente.

## Cómo arreglarlo
1. Ve a **Envíos**. La lista **Listos para enviar** muestra los pedidos empacados.
2. Haz clic en **Obtener tarifas** para un pedido (o usa una **Estrategia por lote** — **Más
   barato**, **Más rápido**, o **Más barato a tiempo** — y **Comprar e imprimir todo** para varios a
   la vez).
3. Elige una tarifa, haz clic en **Comprar e imprimir** (o **Comprar e imprimir N** para un lote). Se
   genera un PDF de etiqueta de 4×6.
4. Si el rastreo debe llegar al marketplace y **Enviar el rastreo a los canales automáticamente**
   está activado, se envía de inmediato. Si no, usa la exportación CSV — mira [Exportar
   rastreo por CSV](csv-tracking-export.md).
5. ¿Te equivocaste en una etiqueta que aún no se envió? Haz clic en **Anular**, confirma **Anular
   etiqueta**. Una etiqueta que la paquetería ya escaneó, o cuyo rastreo ya se envió al canal del
   comprador, no se puede anular aquí — cancela o reembolsa el pedido en el canal.

![Lista Listos para enviar con el botón Comprar e imprimir](../img/shipping-labels-and-tracking/01-buy-label.png)

## Cómo comprobar que funcionó
El pedido pasa de **Listos para enviar** a **Envíos**, mostrando **Etiquetado** y, ya enviado,
**Enviado al canal**. Del lado del marketplace, el pedido del comprador debería mostrar el número de
rastreo en unos minutos, en los canales con conexión en vivo.

## ¿Sigue con el problema?
- Detente y contacta a soporte si un pedido que vence hoy no consigue tarifa, se compró una etiqueta
  dos veces para el mismo pedido, o el rastreo sigue sin poder enviarse y el pedido está cerca de su
  fecha límite.
- Envía: el número de pedido y el mensaje de error junto a **Envío de rastreo**. No envíes la
  dirección del comprador.

Relacionado: [Exportar rastreo por CSV](csv-tracking-export.md), [Ganancias y gasto publicitario](profit-and-ad-spend.md).
