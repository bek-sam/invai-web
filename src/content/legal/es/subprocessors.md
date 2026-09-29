# Subencargados de InvAI

*Traducción completa al español de `../subprocessors.md` (versión en inglés). Si hay alguna diferencia entre
las dos versiones, la versión en inglés es la que cuenta hasta que el asesor legal indique lo contrario.*

> **BORRADOR para revisión del asesor legal. No está en vigor.** Versión 1, 28-09-2026, compliance-officer.
> Esto no es asesoría legal, no ha sido revisado por un abogado, y no ha sido publicado, enviado ni aceptado
> por nadie. Esta página está pensada para convertirse en una página pública enlazada desde la Política de
> Privacidad y el DPA una vez que el asesor legal y el dueño la aprueben.
>
> **Decisiones que debe tomar el dueño:**
> - `[[OWNER: proveedor de correo electrónico — el código admite cualquier servidor SMTP; todavía no se ha
>   elegido un proveedor específico, ver la nota bajo "Correo electrónico"]]`
> - `[[OWNER: región de AWS en producción — el código usa por defecto us-east-1 (`invai-backend/src/env.ts`
>   valor por defecto de `S3_REGION`) pero esto no se ha confirmado como la región de producción]]`
> - `[[OWNER: si se agregará una herramienta de seguimiento de errores o análisis de producto — ninguna
>   existe en el código hoy, ver la nota abajo]]`

Cada fila abajo está verificada contra el código que realmente llama a ese servicio, no contra un plan.
"Estado" indica si la integración está en vivo contra el proveedor real o corriendo hoy contra el simulador
local de InvAI (los simuladores se usan automáticamente cuando la clave/secreto de API del proveedor no está
configurado; `invai-backend/src/env.ts` `mocks.*`, líneas 249-262).

## Encargados del tratamiento de datos personales de compradores

| Subencargado | Finalidad | Categorías de datos | Región | Estado hoy | Evidencia |
|---|---|---|---|---|---|
| Amazon Web Services (AWS) | Hospedaje: base de datos Postgres, almacenamiento de objetos (cargas útiles de pedidos, etiquetas, CSVs), una clave de gestión de llaves aprovisionada pero sin usar | Todos los datos del servicio, incluida la PII cifrada del comprador | `[[OWNER: confirmar región de producción; el código usa us-east-1 por defecto]]` | En vivo localmente (sustitutos Postgres/MinIO); el hospedaje de producción todavía no está desplegado | `invai-infra/sst.config.ts`; `invai-backend/src/env.ts` `S3_BUCKET`/`S3_REGION` |
| Anthropic | Borradores de publicaciones con IA, revisión de riesgo de marca registrada, revisión de personalización, asistente dentro de la aplicación | Solo texto escrito por el Taller; la PII del comprador (correos, teléfonos, direcciones, números tipo tarjeta, códigos postales) se elimina antes de cualquier llamada | EE. UU. (región de procesamiento de Anthropic) `[COUNSEL: confirmar los términos del DPA de Anthropic y cualquier configuración de retención cero]` | Simulado a menos que `ANTHROPIC_API_KEY` esté configurada (`invai-backend/src/env.ts:250`) | `invai-backend/src/ai/pii.ts:8-24`; `invai-docs/decisions/0007-ai-model-policy.md` |
| EasyPost | Cotización de tarifas, compra de etiquetas, rastreo | Nombre/dirección de envío, peso/dimensiones del paquete, referencia del pedido | EE. UU. `[[OWNER: confirmar]]` | Simulado a menos que `EASYPOST_API_KEY` esté configurada (`invai-backend/src/env.ts:251`) | `invai-backend/src/integrations/carriers/easypost/` |
| S&S Activewear | Órdenes de compra de prendas en blanco al proveedor elegido por el Taller | Dirección de envío (del Taller o su lugar de producción), artículo/cantidad — sin identidad del comprador | EE. UU. `[[OWNER: confirmar]]` | Simulado a menos que un Taller configure `SS_ACTIVEWEAR_ACCOUNT`/`SS_ACTIVEWEAR_API_KEY` propios (`invai-backend/src/env.ts:253`) | `invai-backend/src/integrations/suppliers/ssactivewear/` |
| SanMar | Igual que S&S, proveedor alternativo | Igual que S&S | EE. UU. `[[OWNER: confirmar]]` | **Diferido, no integrado** — la integración SOAP se descartó de la v1 | `invai-docs/decisions/0006-v1-cuts.md` ("SanMar SOAP: deferred. S&S is used for now.") |
| Stripe | Facturación de suscripción | Contacto de facturación del Taller, ids de suscripción/plan; InvAI no guarda números de tarjeta (se planea usar el checkout alojado por Stripe) | EE. UU. `[[OWNER: confirmar]]` | **Simulado, sin cobro real** — los límites del plan se aplican sin una cuenta de Stripe en vivo (`invai-backend/src/env.ts:254` `mocks.billing`) | `invai-docs/decisions/0006-v1-cuts.md` ("Stripe checkout: stubbed") |
| Proveedor de correo `[[OWNER: nombre]]` | Correo transaccional (invitaciones, restablecer contraseña) y el resumen semanal por correo (opcional, con consentimiento) | Nombre/correo del destinatario, contenido del mensaje | `[[OWNER]]` | El entorno local de desarrollo/pruebas usa Mailpit (no es un subencargado, se queda en la máquina local); no se ha elegido un proveedor de producción — Amazon SES es el candidato principal, pendiente de una decisión abierta del dueño | `invai-backend/src/env.ts:112-113` (`SMTP_URL`, `MAIL_FROM`); `invai-docs/owner-inbox.md` OI-13 (proveedor de correo, abierto); el resumen semanal por correo requiere consentimiento explícito de cada persona con baja de un clic, `invai-docs/specs/weekly-digest.md` §"Delivery" |

## Conexiones con canales de venta (no son subencargados — son las propias cuentas del Taller)

Estos no son subencargados en el sentido del RGPD/CCPA: el Taller autoriza su propia cuenta de canal de venta
para enviar sus datos de pedidos a InvAI, e InvAI no está dando instrucciones a estas plataformas para que
procesen datos por cuenta de InvAI. Se listan aquí para completar el panorama porque la aplicación llama a
sus APIs.

| Canal de venta | Qué le envía InvAI | Qué recibe InvAI de él | Estado hoy |
|---|---|---|---|
| Shopify | Actualizaciones de estado de envío/rastreo; envíos opcionales de nivel de inventario (`invai-docs/decisions/0003-stock-push-opt-in.md`) | Nombre, dirección, correo, teléfono del comprador, detalles del pedido y de línea | Integración en vivo por webhook + API, incluidos los tres webhooks de cumplimiento RGPD (`invai-backend/src/integrations/channels/shopify/common.ts:265-267`) |
| Etsy, Amazon, TikTok Shop, Walmart | Nada hoy (sin envío de vuelta en vivo) | Datos de pedidos de compradores, importados por el propio archivo CSV del Taller hoy | Solo importación por CSV; el acceso directo por API está pendiente de la revisión de cada canal (`invai-docs/decisions/0006-v1-cuts.md`) |

## Ningún subencargado identificado

| Categoría | Hallazgo |
|---|---|
| Seguimiento de errores / monitoreo de la aplicación | No se encontró ninguna herramienta de seguimiento de errores o APM (p. ej. Sentry, Datadog) en las dependencias o el código de `invai-backend` a la fecha de este borrador. `[[OWNER: confirmar si se agregará alguna antes del lanzamiento]]` |
| Análisis de producto | No se encontró ninguna herramienta de análisis (p. ej. PostHog) en el código a la fecha de este borrador. `[[OWNER: confirmar]]` |
| Proveedores de datos de señales de mercado (Census, Google Trends, Pinterest, Jungle Scout) | Presentes en la configuración (`invai-backend/src/env.ts:100-103`) para funciones de investigación de demanda/publicaciones con IA, todos simulados a menos que se configuren las claves; estos no reciben datos personales de compradores ni del Taller, solo consultas de mercado agregadas, por lo que no se tratan como subencargados de datos personales, pero se listan aquí para completar el panorama |

## Aviso de cambios

`[[OWNER/COUNSEL: cómo se notifica a los clientes sobre un nuevo subencargado y el plazo de aviso antes de
que empiece a procesar — ver dpa.md §5]]`

---
*Última actualización: 28-09-2026 (borrador). No publicado.*
