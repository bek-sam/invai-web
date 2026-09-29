# Acuerdo de Procesamiento de Datos de InvAI (DPA)

*Traducción completa al español de `../dpa.md` (versión en inglés). Si hay alguna diferencia entre las dos
versiones, la versión en inglés es la que cuenta hasta que el asesor legal indique lo contrario.*

> **BORRADOR para revisión del asesor legal. No está en vigor.** Versión 1, 28-09-2026, compliance-officer.
> Esto no es asesoría legal, no ha sido revisado por un abogado, y no ha sido publicado, enviado ni aceptado
> por nadie.
>
> **Decisiones que debe tomar el dueño:**
> - `[[OWNER: nombre legal exacto de InvAI y dirección (el "Encargado")]]`
> - `[[OWNER: plazo de aviso para cambios de subencargado, por ejemplo 30 días antes de que un nuevo
>   subencargado empiece a procesar — se necesita la recomendación del asesor legal]]`
> - `[COUNSEL: mecanismo de transferencia internacional (SCC) una vez confirmadas las regiones de los
>   subencargados]]`
> - `[COUNSEL: mecanismo de derecho de auditoría — en sitio, solo documentación, o mediante un informe
>   compartido]]`

Este Acuerdo de Procesamiento de Datos ("DPA") es entre el Taller que ha aceptado los Términos de Servicio de
InvAI ("Responsable") y `[[OWNER: nombre legal de InvAI]]` ("Encargado"), y aplica cada vez que InvAI procesa
datos personales de los compradores del Taller por cuenta del Taller. Incorpora los términos que exige el
Artículo 28(3) del RGPD y los términos de proveedor de servicios de la CCPA/CPRA (Cal. Civ. Code §1798.140;
11 CCR §7051).

## 1. Objeto, duración, naturaleza y finalidad

**Objeto:** el procesamiento por InvAI de los datos personales de los compradores del canal de venta del
Responsable como parte del servicio InvAI (importación de pedidos, producción de hojas de impresión, envíos,
reportes de ganancia, herramientas de publicación asistidas por IA).
**Duración:** mientras la cuenta de InvAI del Responsable esté activa, más el plazo de eliminación del §8.
**Naturaleza y finalidad:** recibir pedidos de los canales de venta conectados del Responsable, almacenarlos
y mostrarlos al personal autorizado del Responsable, imprimir materiales de producción, comprar y rastrear
etiquetas de envío, y (con los datos personales del comprador eliminados primero) apoyar las funciones de
publicación asistidas por IA del Responsable.

**Categorías de datos:** nombre del comprador, dirección de envío y facturación, correo, teléfono, detalles
del pedido y de línea, texto de regalo/personalización.
*Evidencia:* los campos que guarda InvAI, cada uno cifrado en reposo:
`invai-backend/src/db/schema/orders.ts:249-274` (columnas de la tabla `buyerPii`: `name`, `email`, `phone`,
`company`, `street1`, `street2`, `city`, `state`, `zip`, `country`).
**Categorías de titulares de los datos:** los compradores del canal de venta del Responsable.

## 2. Procesamiento solo bajo instrucciones documentadas

El Encargado procesa datos personales únicamente según las instrucciones documentadas del Responsable —
configurar qué canales de venta están conectados, qué personal y proveedores pueden ver los datos de pedidos,
y qué funciones de envío y publicación están habilitadas — salvo que la ley exija lo contrario, en cuyo caso
el Encargado avisará primero al Responsable, salvo que la ley lo prohíba.

## 3. Confidencialidad

Cualquier persona a la que el Encargado permita procesar estos datos está sujeta a confidencialidad, por
contrato o por ley. `[COUNSEL: cláusula estándar de confidencialidad]`

## 4. Medidas de seguridad (Art. 32)

Las medidas realmente implementadas y verificables hoy:
- Los campos identificables del comprador se cifran en reposo, campo por campo, con AES-256-GCM
  (`invai-backend/src/lib/crypto.ts:12,49,67`).
- Cada tabla de base de datos por inquilino lleva seguridad a nivel de fila para que los datos del Responsable
  estén aislados de los de cualquier otro Taller, verificado por un conjunto automatizado de pruebas entre
  inquilinos (`invai-backend/src/db/rls-coverage.test.ts`).
- Los datos personales del comprador se eliminan de cualquier texto antes de enviarlo al subencargado de IA
  (`invai-backend/src/ai/pii.ts:8-24`).
- Las cargas útiles (payloads) de los webhooks de canales de venta se verifican por firma antes de usarse,
  incluidos los webhooks de cumplimiento RGPD de Shopify
  (`invai-backend/src/integrations/channels/shopify/common.ts:265-267`).

Medidas que exigen los programas DPP y de Nivel 2 de Shopify que **todavía no están implementadas**, con
propietario y fecha registrados en `invai-docs/security/v1-review.md` y el paquete de evidencia DPP de
Amazon: autenticación multifactor en cuentas con acceso a PII, registro de seguridad centralizado de 12
meses, escaneo de vulnerabilidades programado y pruebas de penetración, y uso de la clave KMS de AWS ya
aprovisionada para cifrado envolvente (hoy la aplicación administra su propio conjunto de claves). Este anexo
de seguridad del DPA se actualizará conforme cada una se cierre, nunca antes.

## 5. Subencargados

El Responsable otorga al Encargado una autorización general para usar los subencargados listados en la lista
pública de subencargados (`subprocessors.md`), la cual el Encargado mantiene actualizada. El Encargado
avisará al Responsable sobre un nuevo subencargado al menos `[[OWNER: plazo de aviso]]` antes de que empiece
a procesar datos del Responsable, plazo durante el cual el Responsable puede objetar por motivos razonables
de protección de datos.

## 6. Ayuda con los derechos de los titulares de datos y las evaluaciones de impacto (DPIA)

El Encargado ayudará al Responsable a responder la solicitud de un titular de datos (acceso, eliminación,
corrección) dentro del plazo aplicable, siguiendo el proceso en
`invai-docs/compliance/privacy-requests/` una vez que ese proceso esté en uso activo, y proporcionará la
información razonablemente necesaria para las propias evaluaciones de impacto de protección de datos del
Responsable. Tres de los propios webhooks de cumplimiento de Shopify ya funcionan de forma automática sobre
los datos de compradores del Responsable: `customers/data_request` abre una solicitud que el Responsable
(dueño del Taller) debe responder dentro de 30 días; `customers/redact` y `shop/redact` eliminan esos datos
(`invai-backend/src/modules/privacy/service.ts:57-62`, cobertura de pruebas en
`invai-backend/src/modules/privacy/service.test.ts:143-268`).

## 7. Notificación de brechas de seguridad

El Encargado notificará al Responsable sin demora indebida, y en todo caso dentro de **24 horas** de tener
conocimiento de una brecha de datos personales que afecte los datos del Responsable, con suficiente
información para que el Responsable cumpla con su propio deber de notificar en 72 horas a una autoridad de
control bajo el Art. 33 del RGPD. `[[OWNER: este plazo coincide con los plazos de aviso a Amazon y a los
Talleres del manual de respuesta a incidentes
(invai-docs/research/12-security-quality-playbook.md §5); confirmar que es aceptable como compromiso
contractual]]`

## 8. Eliminación o devolución; plazo de copias de seguridad

Al terminar la cuenta del Responsable, el Encargado pondrá a disposición los datos del Responsable para su
exportación, y luego los eliminará dentro de 30 días de una solicitud de eliminación (no se ofrece un plazo
de solo-exportación por separado; la exportación y el plazo de eliminación corren juntos).
*Evidencia:* `invai-backend/src/modules/privacy/service.ts:283` (`HARD_PURGE_DELAY_MS = 30 * 86400_000`),
`:372` (activación de exportación), `:581` (solicitud de eliminación), `:653` (purga definitiva, elimina
filas del inquilino y objetos en S3). Los datos personales del comprador específicamente se eliminan antes y
de forma automática: 30 días después de la entrega sin importar el estado de la cuenta
(`invai-backend/src/modules/orders/jobs.ts:13,20-71`), y en cualquier pedido con más de 18 meses aunque no
haya solicitud (`invai-backend/src/modules/privacy/service.ts:285,767`).
Copias de seguridad: `[[OWNER/platform-sre: indicar aquí el plazo de retención de la base de datos de
producción una vez confirmado — no se encontró en `invai-infra/sst.config.ts` a la fecha de este borrador]]`.

## 9. Auditorías e información

El Encargado pondrá a disposición la información razonablemente necesaria para demostrar el cumplimiento de
este DPA y permitirá auditorías. `[COUNSEL: mecanismo de auditoría — ver el recuadro superior]`

## 10. Transferencias internacionales

`[COUNSEL: SCC o mecanismo equivalente, una vez confirmadas la región de hospedaje de InvAI y la región de
cada subencargado — ver los marcadores de región en subprocessors.md]]`

## Anexo A — Resumen del flujo de datos

Canal de venta (el comprador hace un pedido) → adaptador de canal/webhook → tabla `orders` y tabla cifrada
`buyer_pii` → carga útil original archivada en almacenamiento de objetos → armado de hoja de impresión y
escaneo de piso (sin PII del comprador en la hoja física más allá de lo que el diseño necesita) → EasyPost
(dirección de envío) para una etiqueta → PDF de etiqueta y hoja de empaque → rastreo enviado de vuelta al
canal de venta → todos los datos identificables del comprador se eliminan 30 días después de la entrega.
Las funciones de IA de publicación/marca registrada reciben solo texto escrito por el Taller, con los
patrones de PII del comprador eliminados primero.
Ver `invai-docs/compliance/vendor-inventory.md` para la tabla completa de flujo de datos por proveedor.

## Anexo B — Medidas de seguridad

Ver §4 arriba; se mantiene actualizado desde `invai-docs/security/v1-review.md` y el paquete de evidencia
DPP de Amazon.

## Anexo C — Subencargados

Ver `subprocessors.md`.

## Términos de proveedor de servicios CCPA/CPRA

El Encargado procesará los datos personales únicamente para el fin comercial específico de proveer el
servicio InvAI descrito en este DPA; no venderá ni compartirá datos personales; no retendrá, usará ni
divulgará datos personales fuera de la relación comercial directa con el Responsable; no combinará los datos
personales recibidos del Responsable con datos personales de otras fuentes salvo lo que permita la CCPA; y
notificará al Responsable si ya no puede cumplir estas obligaciones. El Responsable puede tomar medidas
razonables para detener y remediar el uso no autorizado de datos personales por el Encargado.

---
*Última actualización: 28-09-2026 (borrador). Fecha de vigencia: no está en vigor.*
