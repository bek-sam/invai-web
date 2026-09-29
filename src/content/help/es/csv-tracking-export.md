---
title: Sube números de rastreo a un marketplace que no está conectado
slug: csv-tracking-export
lang: es
roles: [owner, office]
device: desktop
screens: [Shipping]
updated: 2026-09-28
checked_against: invai-web d092a4b el 2026-09-28
---

# Sube números de rastreo a un marketplace que no está conectado

**Lo que ves:** Etiquetas compradas y envíos en marcha, pero el marketplace todavía muestra el
pedido como no enviado, porque ese canal (Etsy, Amazon, TikTok Shop o Walmart importado por CSV) no
tiene una conexión API en vivo para enviar el rastreo automáticamente.

**Por qué:** Por ahora solo Shopify envía el rastreo por su cuenta. Para un canal importado por CSV,
InvAI arma un archivo en el formato que espera la herramienta de carga masiva de cada marketplace,
para que se lo entregues en un par de clics.

## Cómo arreglarlo
1. Ve a **Envíos**, busca **Exportar rastreo de {{channel}}** para el canal que necesitas.
2. Haz clic. Si no hay nada nuevo, verás "Nada nuevo para exportar de {{channel}}" — ya se exportó
   todo.
3. Guarda el archivo descargado y súbelo donde ese marketplace lo espera:
   - **Amazon:** en Seller Central → Orders → Upload Order Related Files → Shipping Confirmation,
     sube este archivo.
   - **Etsy:** Shop Manager → Orders & Shipping — agrega el rastreo a cada pedido, o usa una app de
     carga masiva basada en la API de rastreo de Etsy con este archivo.
   - **TikTok Shop:** en Seller Center → Orders → Manage orders → Upload → Add Tracking No., sube
     este archivo.
   - **Walmart:** Seller Center → Order Management → Bulk Order Update, y luego sube este archivo.

![Botón Exportar rastreo en la página de Envíos](../img/csv-tracking-export/01-export-tracking.png)

## Cómo comprobar que funcionó
La exportación muestra "N envíos exportados para {{channel}}". Después de subir el archivo en el
propio sitio del marketplace, el pedido del comprador debería mostrar el rastreo ahí — InvAI no
puede confirmar ese último paso, porque el canal no tiene conexión en vivo.

## ¿Sigue con el problema?
- Detente y contacta a soporte si el mismo envío sigue apareciendo en cada exportación (debería
  aparecer solo una vez, la primera que se exporta), o si pedidos cercanos a su fecha límite no
  están en el archivo.
- Envía: el nombre del canal, el número de pedido, y el nombre del archivo exportado. No envíes la
  dirección del comprador.

Relacionado: [Etiquetas de envío y rastreo](shipping-labels-and-tracking.md), [Primeros pasos](getting-started.md).
