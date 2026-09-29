---
title: Recibe prendas, transferencias del proveedor, o haz un conteo
slug: receiving
lang: es
roles: [receiver, office]
device: tablet
screens: [Receiving]
updated: 2026-09-28
checked_against: invai-floor 68b9cbb el 2026-09-28
---

# Recibe prendas, transferencias del proveedor, o haz un conteo

**Lo que ves:** Llegaron cajas de prendas o la hoja de un proveedor, o estás haciendo un conteo de
estante, y la estación **Recibir** de la tableta del taller tiene tres pestañas: **Órdenes de
compra**, **Transferencias del proveedor** y **Conteo de inventario**.

**Por qué:** Recibir actualiza tu inventario real en el momento en que llegan las prendas, y marca
que la hoja impresa de un proveedor llegó para que sus transferencias pasen a **Plancha**. Hacerlo desde
la tableta, junto al estante, mantiene el conteo correcto.

## Recibe prendas contra una orden de compra
1. En **Recibir**, pestaña **Órdenes de compra**. Escanea el número de la orden o tócala en la
   lista.
2. Escanea cada prenda conforme sale de la caja, o usa los botones **+**/**−** en su línea. Una
   prenda que no está en esta orden muestra "Esta prenda no está en {{poNo}}" — apártala y avísale a la
   oficina (las prendas de más no entran en la orden).
3. Si llegó todo, toca **Recibir N: orden completa**. Si solo llegó parte, toca **Recibir N
   (parcial)** — el resto queda como pendiente para después.

## Recibe una hoja impresa del proveedor
1. Pestaña **Transferencias del proveedor**. Escanea cualquier código QR de transferencia de la
   hoja, o toca la hoja en la lista de hojas en camino.
2. Confirma **¿Llegó la hoja {{name}}?**, luego toca **Marcar recibida**. Sus transferencias ya están
   listas para planchar.

## Haz un conteo de inventario
1. Pestaña **Conteo de inventario**. Escanea cada prenda del estante.
2. La pantalla muestra **Sistema** (lo que InvAI tiene registrado) junto a **Contadas** (lo que
   escaneaste) y cualquier **Diferencia**. Escanear una prenda que InvAI no conoce dice "Esta prenda
   no está en el inventario" — dásela a la oficina.
3. Toca **Guardar conteo** cuando termines.

![Pantalla de Recibir con las tres pestañas](../img/receiving/01-receiving-tabs.png)

## Cómo comprobar que funcionó
El estado de la orden de compra pasa hacia **Recibida** (o **Recibida en parte**), la hoja muestra
**Recibida** en **Producción → Hojas de prensado**, o el conteo muestra "Todo cuadró" (o lista lo que
cambió).

## ¿Sigue con el problema?
- Detente y contacta a soporte si la misma orden de compra sigue mostrando prendas como pendientes
  después de recibir toda la caja, o si una hoja del proveedor no se puede marcar recibida y su
  pedido vence hoy.
- Envía: el número de la orden o el nombre de la hoja, y lo que mostraba la pantalla. No envíes una
  foto de un albarán con la dirección de un comprador.

Relacionado: [Configurar la tableta del taller](floor-tablet-setup.md), [Hojas y proveedores](gang-sheets-and-vendors.md).
