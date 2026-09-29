# Términos de Servicio de InvAI

*Traducción completa al español de `../terms.md` (versión en inglés). Si hay alguna diferencia entre las dos
versiones, la versión en inglés es la que cuenta hasta que el asesor legal indique lo contrario.*

> **BORRADOR para revisión del asesor legal. No está en vigor.** Versión 1, 28-09-2026, compliance-officer.
> Esto no es asesoría legal, no ha sido revisado por un abogado, y no ha sido publicado, enviado ni aceptado
> por nadie.
>
> **Decisiones que debe tomar el dueño antes de enviar esto al asesor legal o publicarlo** (los espacios
> abajo son marcadores; no se ha inventado ningún valor):
> - `[[OWNER: nombre legal exacto de la empresa InvAI, tipo de entidad y estado/país donde se constituyó]]`
> - `[[OWNER: dirección registrada de la empresa]]`
> - `[[OWNER: ley aplicable y jurisdicción para disputas]]`
> - `[[OWNER: correo de contacto para avisos legales]]`
> - `[[OWNER: nombres de los planes, precios, duración de la prueba gratuita y tarifa por etiqueta — la
>   facturación todavía no está activa, no existe ningún cobro real; ver Evidencia]]`
> - `[[OWNER: monto del límite de responsabilidad y términos de indemnización — decisión del asesor legal,
>   ver §11]]`

## 1. Las partes y la aceptación

Estos Términos son un acuerdo entre `[[OWNER: nombre legal de InvAI]]` ("InvAI", "nosotros") y la empresa que
crea una cuenta en InvAI ("Taller", "usted"). La persona que acepta estos Términos en nombre del Taller debe
estar autorizada para comprometerlo. `[COUNSEL: mecánica de aceptación tipo "click-wrap", edad mínima]`

## 2. El servicio

InvAI es una plataforma para talleres de camisetas DTF (impresión directa en film) que venden en Etsy,
Amazon, Shopify, TikTok Shop y Walmart. El servicio:
- recibe los pedidos de los canales de venta y los convierte en artículos de producción con etiqueta de
  pedido,
- arma las hojas de impresión (gang sheets) y verifica la producción contra ellas con escaneos de código de
  barras,
- compra y rastrea etiquetas de envío,
- calcula la ganancia real por pedido y por artículo,
- redacta borradores de publicaciones con IA con una revisión de riesgo de marca registrada, y
- da a los talleres externos (proveedores DTF) un portal para recibir y cumplir trabajos.

Las funciones descritas como en desarrollo, beta o solo para pilotos en el producto o en el plan de un Taller
se ofrecen "tal cual" y pueden cambiar o retirarse con aviso previo. `[COUNSEL: ¿se necesita un descargo de
responsabilidad para beta aquí o en el §11?]`

## 3. Cuentas y usuarios

El dueño de la cuenta del Taller es responsable de todas las personas que invita: el personal con acceso al
panel (roles: dueño, administrador, oficina, diseñador), el personal de piso de producción que ingresa con un
PIN de 4 dígitos o escanea en una estación compartida, y cualquier proveedor externo con acceso al portal de
proveedores para los trabajos de ese Taller. El acceso a cada estación usa un token revocable emitido por
estación física; el Taller puede revocar un token o desactivar a un miembro del personal en cualquier
momento, lo que termina de inmediato las sesiones activas de esa persona o estación.

*Evidencia:* modelo de personal solo-PIN y de roles (`invai-backend/src/modules/tenancy/service.ts:483`
`addPinOnlyStaff`, `:520` `changeRole`); emisión y revocación de tokens de estación
(`invai-backend/src/modules/tenancy/service.ts:798` `issueToken`, `:813` `revokeToken`); la desactivación de
personal termina las sesiones de piso (`invai-backend/src/modules/tenancy/service.ts:571` `setMemberStatus`).

## 4. Conexiones con canales de venta

El Taller conecta sus propias cuentas de canales de venta (Etsy, Amazon, Shopify, TikTok Shop, Walmart) a
InvAI y autoriza a InvAI a leer sus pedidos y, cuando el Taller lo habilite, enviar de vuelta el número de
rastreo y (para Shopify, de forma opcional) actualizaciones de inventario. El Taller sigue sujeto a los
propios términos de cada canal de venta y a sus términos de API; InvAI no controla ni puede garantizar el
funcionamiento, la disponibilidad de la API ni la aprobación de InvAI como aplicación conectada de ningún
canal de venta.

A la fecha de este borrador: el canal de Shopify es una integración en vivo por webhooks y API; los pedidos
de Etsy, Amazon, TikTok Shop y Walmart se importan por archivo CSV mientras el acceso directo de InvAI a la
API de esos canales está pendiente de la revisión de cada uno
(`invai-docs/decisions/0006-v1-cuts.md`). Esta sección se actualizará conforme cada integración directa entre
en funcionamiento.

## 5. Funciones de IA

InvAI puede redactar textos para publicaciones y revisar un diseño o publicación en busca de riesgo de marca
registrada usando un modelo de IA de un tercero. Un borrador nunca se publica en un canal de venta sin que
una persona del Taller lo revise y apruebe
(`invai-backend/src/modules/ai/service.ts:58` "nada se publica sin aprobación humana",
`:633` registra al usuario que aprueba). La revisión de marca registrada es una puntuación de riesgo
automatizada, no es asesoría legal ni garantía de que no haya infracción; el Taller es responsable de tener
los derechos de cualquier diseño, imagen o texto que publique. Ningún dato personal del comprador se envía al
proveedor de IA (`invai-backend/src/ai/pii.ts`; ver la Política de Privacidad).

## 6. Etiquetas y franqueo

Cuando el Taller compra etiquetas de envío a través de InvAI, InvAI las compra a través de la API de un
transportista externo (EasyPost) según las instrucciones del Taller; el franqueo y cualquier tarifa por
etiqueta se cobran al Taller. Los reembolsos y etiquetas anuladas siguen las propias reglas y plazos del
transportista emisor. `[COUNSEL: confirmar el modelo de facturación/reembolso de EasyPost y si InvAI cobra un
margen sobre el franqueo — no está decidido en el código hoy]`

## 7. Tarifas y planes

`[[OWNER: nombres de los planes, precios mensuales/anuales, condiciones de prueba gratuita, tarifas por
etiqueta o por pedido, manejo de impuestos]]`. A la fecha de este borrador, la facturación de suscripción no
está en funcionamiento: el módulo de facturación aplica los límites del plan pero no cobra a una tarjeta real
(la integración con Stripe está simulada, `invai-backend/src/env.ts` `mocks.billing`; ver
`invai-docs/decisions/0006-v1-cuts.md` "Stripe checkout: stubbed"). A ningún Taller se le cobra antes de que
esta sección se complete y el flujo de pago esté en funcionamiento.

## 8. Uso aceptable

El Taller no usará InvAI para vender o publicar productos falsificados, que infrinjan derechos o sean
ilegales, para extraer datos (scraping) o hacer ingeniería inversa de InvAI, para intentar acceder a los datos
de otro Taller, ni para enviar a las funciones de IA de InvAI contenido sobre el cual no tenga los derechos
de uso. `[COUNSEL: texto estándar de uso aceptable]`

## 9. Protección de datos

InvAI actúa como encargado del tratamiento (RGPD) / proveedor de servicios (CCPA) de los datos personales de
los compradores del Taller que pasan por InvAI, bajo los términos del Acuerdo de Procesamiento de Datos
(`dpa.md`), el cual se incorpora a estos Términos por referencia. Para la propia recopilación que hace InvAI
de los datos de cuenta del personal del Taller, ver la Política de Privacidad (`privacy.md`).

## 10. Suspensión, terminación y devolución de datos

Cualquiera de las partes puede terminar el acuerdo como se describe en `[COUNSEL: cláusula de terminación,
plazo de aviso, con o sin causa]`. Al terminar o cancelar, el Taller puede exportar sus datos; InvAI elimina
los datos de la empresa del Taller dentro de 30 días de una solicitud de eliminación, a menos que se cancele
antes (`invai-backend/src/modules/privacy/service.ts:283` `HARD_PURGE_DELAY_MS = 30 * 86400_000`, `:372`
exportación, `:581` solicitud de eliminación, `:653` purga definitiva). Las copias de seguridad expiran por
separado; ver la Política de Privacidad §6 y el DPA §8 para el plazo de las copias de seguridad.

## 11. Garantías, responsabilidad, indemnización

`[COUNSEL: exclusión de garantías, límite de responsabilidad (monto del tope y excepciones), indemnización
mutua — todas son decisiones del dueño/asesor legal, no se redacta nada aquí]`

## 12. Cambios a estos Términos

`[COUNSEL: plazo y mecanismo de aviso para cambios importantes]`

## 13. Ley aplicable y disputas

`[COUNSEL: ley aplicable, jurisdicción, cláusula de arbitraje si la hay]`

## Contacto

`[[OWNER: correo/dirección de aviso legal]]`

---
*Última actualización: 28-09-2026 (borrador). Fecha de vigencia: no está en vigor.*
