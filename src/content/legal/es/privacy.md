# Política de Privacidad de InvAI

*Traducción completa al español de `../privacy.md` (versión en inglés). Si hay alguna diferencia entre las
dos versiones, la versión en inglés es la que cuenta hasta que el asesor legal indique lo contrario.*

> **BORRADOR para revisión del asesor legal. No está en vigor.** Versión 1, 28-09-2026, compliance-officer.
> Esto no es asesoría legal, no ha sido revisado por un abogado, y no ha sido publicado, enviado ni aceptado
> por nadie.
>
> **Decisiones que debe tomar el dueño:**
> - `[[OWNER: nombre legal exacto de InvAI y dirección]]`
> - `[[OWNER: correo/dirección de contacto para solicitudes de privacidad]]`
> - `[COUNSEL: mecanismo de transferencia internacional (SCC) si InvAI o algún subencargado está fuera de
>   la UE/Reino Unido y hay datos de un Taller o comprador de la UE/Reino Unido involucrados]]`
> - `[COUNSEL: edad mínima / datos de menores — los usuarios de InvAI son personal de los talleres, no
>   menores, pero confirmar si se necesita alguna declaración]]`

## 1. Alcance y nuestros dos roles

Esta política cubre el propio sitio web y producto de InvAI (invai-web, invai-floor, el portal de
proveedores) y los datos de cuenta de las personas que los usan: dueños de Taller, personal y proveedores
conectados.

InvAI cumple dos roles distintos con dos tipos distintos de datos personales:
- **Responsable del tratamiento (controller)**, para los datos de cuenta: el nombre, correo, rol y actividad
  de inicio de sesión de las personas que ingresan a InvAI. Esta política describe directamente ese
  tratamiento.
- **Encargado del tratamiento (RGPD) / proveedor de servicios (CCPA)**, para los datos de compradores que
  pasan por InvAI porque un Taller conectó un canal de venta: el pedido, nombre, dirección de envío, correo o
  teléfono de un comprador. InvAI procesa esos datos solo según las instrucciones del Taller, bajo el Acuerdo
  de Procesamiento de Datos (`dpa.md`). Si usted es un comprador de un canal de venta con una pregunta sobre
  sus datos, vea el §8 — lo dirigimos al Taller, porque el Taller es el responsable de sus datos, no InvAI.

## 2. Datos que recopilamos

| Categoría | Ejemplos | De quién |
|---|---|---|
| Datos de cuenta | nombre, correo, rol (dueño/administrador/oficina/diseñador/prensista/empacador/receptor), hash de contraseña, PIN de piso (con hash) | personal del Taller que se registra o es invitado |
| Datos de uso y dispositivo | páginas visitadas, acciones realizadas, dirección IP, información del navegador/dispositivo, entradas del registro de auditoría | todos los usuarios de InvAI, automáticamente |
| Contacto de facturación | nombre/correo de facturación del Taller, ids de cliente y suscripción de Stripe | dueño del Taller, una vez que la facturación esté activa (`[[OWNER: no está activa hoy, ver Términos §7]]`) |
| Mensajes de soporte | cualquier cosa que el Taller envíe a InvAI para pedir ayuda | personal del Taller |
| Datos de pedidos de compradores (rol de encargado, no datos propios de InvAI) | nombre, dirección de envío/facturación, correo, teléfono del comprador, detalles del pedido y del artículo, texto de personalización | el canal de venta conectado del Taller, descrito en el DPA |

*Evidencia:* los campos del comprador y su cifrado (`invai-backend/src/db/schema/orders.ts:249-274` tabla
`buyerPii`: `name`, `email`, `phone`, `company`, `street1`, `street2`, `city`, `state`, `zip`, `country`, cada
campo identificable se guarda con cifrado AES-256-GCM a nivel de campo,
`invai-backend/src/lib/crypto.ts:12,49`).

## 3. Cómo lo usamos

Para operar el servicio (importación de pedidos, armado de hojas de impresión, escaneo de piso, compra de
etiquetas, cálculo de ganancias, borradores de publicaciones con IA, portal de proveedores), para asegurar
las cuentas e investigar abusos, para facturar a los Talleres una vez que la facturación esté activa, y para
mejorar el producto usando estadísticas de uso agregadas y no identificables. No usamos datos del canal de
venta ni de compradores para entrenar o ajustar ningún modelo de IA.

## 4. Funciones de IA

Cuando un Taller usa una función asistida por IA (borradores de publicaciones, revisión de riesgo de marca
registrada, revisión de personalización, el asistente), InvAI envía el texto relevante escrito por el Taller
a un modelo de IA de un tercero (Anthropic). Los datos personales del comprador (correos electrónicos,
números de teléfono, direcciones, números que parecen de tarjeta de pago, códigos postales) se eliminan de
cualquier texto antes de que llegue al modelo.

*Evidencia:* patrones de eliminación para correo, teléfono, dirección, código postal y números tipo tarjeta
(`invai-backend/src/ai/pii.ts:8-24` `stripPii`/`stripPiiDeep`, aplicado a todo lo que pasa por la pasarela
según el propio comentario del archivo en la línea 3: "Buyer personal data never reaches the model"). Modelo
y política por defecto: `invai-docs/decisions/0007-ai-model-policy.md` ("PII: none goes to the AI
provider"). Los borradores de IA requieren que una persona del Taller apruebe antes de que se publique
cualquier cosa (`invai-backend/src/modules/ai/service.ts:58`). `[COUNSEL/owner: confirmar la configuración de
retención o retención cero de Anthropic para nuestra cuenta, una vez que exista — no verificado en el código]`

## 5. Con quién lo compartimos

InvAI comparte datos únicamente con los subencargados listados en `subprocessors.md`, cada uno sujeto a un
acuerdo de procesamiento de datos, y solo para el fin que indica esa página. InvAI no vende datos personales
ni los comparte para publicidad conductual entre contextos (CCPA). Las conexiones con canales de venta (Etsy,
Amazon, Shopify, TikTok Shop, Walmart) son las propias cuentas del Taller, autorizadas por el Taller; InvAI no
envía datos de compradores a un canal de venta salvo los números de rastreo y el estado de entrega que el
Taller haya pedido enviar de vuelta para ese pedido.

## 6. Retención

| Datos | Retención | Mecanismo |
|---|---|---|
| PII del comprador (campos identificables) | se elimina 30 días después de la entrega (respaldo: 30 días después del envío o cancelación si nunca llega un evento de entrega) | tarea nocturna, `invai-backend/src/modules/orders/jobs.ts:13` `PII_RETENTION_DAYS = 30`, `:20-71` `purgeBuyerPii` |
| Cargas útiles (payloads) originales del canal, CSVs de pedidos, PDFs de etiquetas en almacenamiento de objetos | 30 días | `invai-backend/src/modules/orders/jobs.ts:82-100` `purgePiiObjects` |
| Datos del comprador en cualquier pedido, sin importar el canal | se redactan después de 18 meses aunque no haya solicitud de eliminación | `invai-backend/src/modules/privacy/service.ts:285` `BUYER_PII_RETENTION_MONTHS = 18`, `:767` `redactStaleBuyerPii` (tarea diaria, `invai-backend/src/modules/privacy/jobs.ts:63-77`) |
| Datos de cuenta y de la empresa del Taller tras la cancelación | se eliminan dentro de 30 días de una solicitud de eliminación (primero se marcan como eliminados de forma reversible, se puede cancelar) | `invai-backend/src/modules/privacy/service.ts:283` `HARD_PURGE_DELAY_MS`, `:581` `requestDeletion`, `:615` `cancelDeletion`, `:653` `hardPurgeCompany` |
| Copias de seguridad de la base de datos | `[[OWNER/platform-sre: confirmar el plazo de retención de instantáneas (snapshots) de RDS en producción — no se encontró en `invai-infra/sst.config.ts` a la fecha de este borrador]]` |
| Registros de seguridad y auditoría | la tabla `audit_log` de `invai-backend` es de solo adición y sin PII en su texto resumen; **todavía no existe** una política de retención centralizada de 12 meses — ver `invai-docs/security/v1-review.md` |

## 7. Seguridad (solo controles verificados)

- Los campos identificables del comprador se cifran en reposo con AES-256-GCM, campo por campo, con un
  conjunto de claves rotables (`invai-backend/src/lib/crypto.ts:12,49,67`).
- Cada tabla por Taller aplica seguridad a nivel de fila para que los datos de un Taller nunca sean visibles
  para otro, verificado por un conjunto automatizado de pruebas entre inquilinos
  (`invai-backend/src/db/rls-coverage.test.ts`).
- `[[OWNER/security-reviewer: cualquier otra afirmación de seguridad (MFA, registro centralizado, pruebas de
  penetración, SOC 2) debe venir del paquete de evidencia DPP verificado, no agregarse aquí — ninguna de esas
  está lista todavía, ver `invai-docs/security/v1-review.md`]]`

## 8. Sus derechos

Si usted es un usuario propio de InvAI (personal de un Taller), puede solicitar acceder, corregir o eliminar
sus datos de cuenta escribiendo a `[[OWNER: contacto de privacidad]]`. Si usted es un comprador de un canal
de venta, InvAI no es el responsable de sus datos — lo es el Taller. Contacte al Taller donde hizo su pedido;
InvAI ayuda al Taller a responder su solicitud dentro del plazo que corresponda (RGPD: 1 mes; CCPA/CPRA: 45
días), y para los Talleres de Shopify, tres procesos activados por Shopify (`customers/data_request`,
`customers/redact`, `shop/redact`) ya funcionan hoy de forma automática
(`invai-backend/src/integrations/channels/shopify/common.ts:265-267`,
`invai-backend/src/modules/privacy/service.ts:57-62`).

## 9. Transferencias internacionales

`[COUNSEL: mecanismo SCC u otro, una vez confirmadas las regiones de InvAI y de cada subencargado por el
dueño — ver los marcadores de región en subprocessors.md]]`

## 10. Cookies y análisis

`[[OWNER: listar solo las herramientas de cookies/análisis realmente en uso — ninguna se encontró en el
código a la fecha de este borrador, ver subprocessors.md]]`

## 11. Menores

`[COUNSEL: declaración de que el servicio no está dirigido a menores]`

## 12. Contacto y cambios

`[[OWNER: correo/dirección de contacto y cómo notificaremos cambios importantes]]`

---
*Última actualización: 28-09-2026 (borrador). Fecha de vigencia: no está en vigor.*
