---
title: Arma un gang sheet y envíalo a tu proveedor
slug: gang-sheets-and-vendors
lang: es
roles: [owner, office]
device: desktop
screens: [Gang sheets, Vendors]
updated: 2026-09-28
checked_against: invai-web d092a4b el 2026-09-28
---

# Arma un gang sheet y envíalo a tu proveedor

**Lo que ves:** Artículos "listos" sin dónde imprimirse, o un proveedor que necesita la hoja de hoy y
todavía no la tiene.

**Por qué:** InvAI acomoda los artículos listos en una hoja DTF de 22 pulgadas automáticamente (los
pedidos urgentes primero), e imprime un código QR más el texto de pedido/artículo/talla/color/diseño
debajo de cada ubicación — eso es lo que se escanea en la plancha. Una vez armada la hoja, se la
envías al proveedor DTF que la imprime.

## Cómo arreglarlo
1. Ve a **Producción → Hojas de prensado**, haz clic en **Armar gang sheets**.
2. Elige una **Fecha límite de envío** (incluye artículos que vencen hasta el final de ese día);
   activa **Pedidos urgentes primero** o **Incluir reimpresiones** si quieres. Haz clic en **Armar**.
3. Abre la hoja armada y haz clic en **Vista previa** para ver cuántos artículos caben y cuánto
   costará el film, o en **Regenerar** si cambiaste algo.
4. Haz clic en **Enviar al proveedor**. El proveedor recibe el archivo en su portal (si usa InvAI) o
   por correo — elige tu proveedor predeterminado primero en **Configuración → Proveedores → Usar
   como proveedor predeterminado**.
5. Si imprimes en el taller en lugar de enviarlo, haz clic en **Imprimir en el taller**, y luego en
   **Marcar impresa** cuando salga de la impresora.
6. Cuando el proveedor devuelva la hoja, haz clic en **Marcar recibida** — sus transferencias quedan
   listas para planchar.

![Vista previa del gang sheet con el botón Enviar al proveedor](../img/gang-sheets-and-vendors/01-build-sheet.png)

## Cómo comprobar que funcionó
El estado de la hoja pasa de **Impresa** a **Recibida**, y sus transferencias aparecen en la estación
**Plancha** de la tableta del taller, listos para escanear.

## ¿Sigue con el problema?
- Detente y contacta a soporte si una hoja dice **Recibida** pero el taller no encuentra sus
  transferencias para planchar, o si el costo de film o el tamaño de la hoja se ve mal físicamente.
- Envía: el nombre de la hoja, los números de pedido que trae, y una captura de la vista previa. No
  envíes la dirección del comprador.

Relacionado: [Mapeo de SKU](sku-mapping.md), [Configurar la tableta del taller](floor-tablet-setup.md).
