---
title: Mapea un SKU del canal a un diseño y una prenda
slug: sku-mapping
lang: es
roles: [owner, office]
device: desktop
screens: [SKU mapping]
updated: 2026-09-28
checked_against: invai-web d092a4b el 2026-09-28
---

# Mapea un SKU del canal a un diseño y una prenda

**Lo que ves:** Un pedido con artículos que necesitan mapeo de SKU — un aviso en **Hoy** ("Falta
mapear SKU") o una fila en **Catálogo → Mapeo de SKU** sin diseño ni prenda elegidos todavía.

**Por qué:** InvAI no sabe a qué diseño y prenda corresponde el SKU de un marketplace hasta que se lo
dices una vez. Después, una regla guardada mapea solo cada pedido futuro con ese SKU — mapear es un
costo único por SKU, no por pedido.

## Cómo arreglarlo
1. Ve a **Catálogo → Mapeo de SKU** (o haz clic en **Mapearlos ahora** desde un reporte de
   importación o desde Hoy).
2. Para resolver varios a la vez: haz clic en **Sugerir mapeos** para que la IA proponga un diseño y
   una prenda para un lote, luego **Aceptar N con ≥80%** para aceptar de golpe los más confiables.
3. Para mapear uno a mano: elige su fila, escoge **Se mapea a** (un diseño y una talla/color de
   prenda), y haz clic en **Mapear**.
4. Activa **Nueva regla** si quieres que ese SKU exacto (o un patrón como
   `{style}-{color}-{size}-{design}`) se mapee solo la próxima vez. Las reglas aparecen en
   **Reglas** y se pueden borrar después — los artículos ya mapeados conservan su mapeo.

![Página de mapeo de SKU con una sugerencia y el botón Mapear](../img/sku-mapping/01-map-sku.png)

## Cómo comprobar que funcionó
La fila sale de **SKU sin mapear**, y el total de la página ("N SKU · N artículos en espera") baja.
Los artículos del pedido pasan de "necesita mapeo de SKU" hacia listos para armar.

## ¿Sigue con el problema?
- Detente y contacta a soporte si un SKU sigue pidiendo mapeo aunque ya guardaste una regla para él,
  o si un pedido que vence hoy todavía tiene artículos sin mapear que no coinciden con nada de tu
  catálogo.
- Envía: el SKU del canal, el número de pedido, y una captura de la sugerencia (si hay). No envíes la
  dirección del comprador.

Relacionado: [Primeros pasos](getting-started.md), [Hojas y proveedores](gang-sheets-and-vendors.md).
