---
title: Vincula una tableta del taller, entra con tu PIN, y escanea
slug: floor-tablet-setup
lang: es
roles: [owner, admin, presser, packer, receiver]
device: tablet
screens: [Stations, Floor login, Press]
updated: 2026-09-28
checked_against: invai-web d092a4b, invai-floor 68b9cbb el 2026-09-28
---

# Vincula una tableta del taller, entra con tu PIN, y escanea

**Lo que ves:** Una tableta que muestra **Configurar esta tableta**, o la app del taller pidiendo un
PIN que no reconoce.

**Por qué:** Cada tableta del taller se vincula a una estación (recoger, planchar, control de
calidad, empacar o recibir) con un token de un solo uso. Luego el personal entra en esa tableta con
su propio PIN personal — la tableta sigue vinculada; solo cambia quién tiene la sesión iniciada.

## Vincula la tableta
1. Como dueño o admin, ve a **Configuración → Estaciones**, haz clic en **Agregar estación** si la
   estación (por ejemplo "Plancha 1") todavía no existe.
2. Haz clic en **Vincular tableta**. Aparece un código QR y un token de estación de un solo uso —
   solo se muestra una vez.
3. En la tableta, en **Configurar esta tableta**, escanea el código QR, o escribe el **Token de
   estación** a mano y haz clic en **Conectar estación**.

## Entra y escanea
1. En **Ingresa tu PIN**, escribe tu PIN del taller de 4 a 6 dígitos. Un PIN equivocado muestra "PIN
   no reconocido" — inténtalo de nuevo o pide a un admin que revise tu PIN en **Configuración →
   Equipo**.
2. En **Plancha**: escanea primero el código QR de la transferencia ("Escanea el QR de la
   transferencia"), luego escanea la etiqueta de la prenda o caja. Una pantalla verde completa
   **PRENSAR** significa que puedes seguir; una pantalla roja completa **BLOQUEADO** significa que te
   detengas — muestra qué se esperaba contra qué escaneaste.
3. Para cambiar de quién tiene la sesión sin desvincular la tableta, toca **Cambiar** en el
   encabezado.

## Trabajar sin conexión
Si la tableta pierde la red, aparece un aviso: "Sin conexión: los escaneos se guardan en la tableta y
se sincronizarán". Sigue escaneando — todo se guarda en la tableta y se envía solo cuando vuelva la
conexión. El encabezado muestra "N escaneos por sincronizar" hasta entonces. No cierres la app a la
fuerza mientras hay escaneos pendientes.

![Pantalla de inicio de sesión con PIN en la tableta del taller](../img/floor-tablet-setup/01-pin-login.png)

## Cómo comprobar que funcionó
El encabezado muestra **En vivo** (no "Reconectando") y, después de enviarse los escaneos, **Todo
sincronizado**. En la web, **Producción → Tablero de estaciones** muestra los escaneos recientes de
la estación llegando en tiempo real.

## ¿Sigue con el problema?
- Detente y contacta a soporte si la pantalla de la plancha muestra verde para una prenda que a
  simple vista está mal, o si una tableta lleva más de un turno "Sin conexión" o con escaneos por
  sincronizar.
- Envía: el nombre de la estación, el nombre de la persona (no su PIN), y lo que mostraba la
  pantalla. No envíes una foto que incluya la dirección de un comprador.

Relacionado: [Hojas y proveedores](gang-sheets-and-vendors.md), [Recepción](receiving.md).
