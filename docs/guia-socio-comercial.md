# Guía de una página · Socio comercial

Lo esencial para atender una solicitud de la entrada a la cotización. El detalle de cada pantalla está en `docs/manual-equipo.md`.

## Cómo entra una solicitud

- **Desde la web.** El cliente llena el cotizador (5 minutos) y recibe un número `S-2026-…` y un enlace de seguimiento. Tú recibes un correo "Nueva solicitud" y la ves en **Panel → Bandeja**.
- **Por WhatsApp o llamada.** Mándale el enlace del cotizador: `https://<dominio>/cotizar`. Si vio una muestra de la galería, que la marque con "Quiero algo así". Si no puede llenarlo, complétalo con él en la llamada; él marca la casilla de privacidad.
- **Datos que faltan después.** Agrégalos tú con **Editar pieza** o **Editar contacto**, con un motivo.

## Cómo se cotiza en 24 horas hábiles

Las horas hábiles son de lunes a viernes, de 08:00 a 17:00, hora de Panamá. El reloj corre en el panel y avisa cuando vence.

| Cuándo | Qué haces | En el panel |
| --- | --- | --- |
| Primeras 4 h | Toma la solicitud y mira el semáforo | **Tomarla yo** → **Pasar a En revisión** (o **Pedir datos faltantes**) |
| El mismo día | Revisa el arte y manda el RFQ a la fábrica | Arte: checklist → proof. **Generar RFQ** → **Enviar a fábrica** |
| Cuando responde la fábrica | Carga costos, flete, margen y plazo, y emite | **Respuesta de fábrica** → **Preparar cotización** → **Emitir y enviar al cliente** |
| Después | Sigue al cliente hasta que acepte o pida cambios | Avisos de vigencia automáticos; **Registrar aceptación** si acepta por WhatsApp |

**La fábrica** tiene 48 horas hábiles para responder. Si no responde, el sistema le reenvía el RFQ y te avisa. Para cumplir las 24 horas con el cliente, pídele a la fábrica la respuesta el mismo día. Si la cotización se va a atrasar, avísale al cliente antes de que venza el plazo.

## Qué hacer con cada color del semáforo

| Color | Qué significa | Qué haces |
| --- | --- | --- |
| 🔴 Rojo | Falta lo crítico: el tipo de pieza, la cantidad, o el arte que el cliente dijo tener | Pulsa **Pedir datos faltantes** en la primera hora. Sale por correo y WhatsApp. Si no responde en el día, llámalo. Sin esos datos no se puede pedir costo a la fábrica |
| 🟡 Amarillo | Faltan datos que ayudan (peso, medidas del producto, referencias), o todavía no hay arte o pidió diseño | Se puede cotizar. Completa lo que falte en una llamada corta (**Editar pieza**) y manda el RFQ. El arte puede llegar después: sin proof aprobado no se produce |
| 🟢 Verde | Completa | Manda el RFQ de inmediato |

## Lo que nunca se hace

- **Dar precios antes de la cotización formal.** Ni por WhatsApp, ni "aproximados", ni rangos. El precio va solo en el PDF que emite el panel.
- **Prometer una fecha de entrega antes del anticipo y del proof aprobado.** El plazo (45 días; 30 en volúmenes menores) corre desde lo último de los dos.
- **Pasar a producción sin proof aprobado.** El sistema tampoco lo permite.
- **Cambiar el código de un producto del catálogo.** Si algo está mal, avísale a Mark.

## Cada mañana

1. **Bandeja:** atiende primero lo vencido y lo rojo.
2. **WhatsApp pendientes:** usa "Abrir y marcar enviado" en cada aviso.
3. **Pedidos:** confirma los comprobantes de pago. Se acepta una diferencia por comisión de hasta 1 % o USD 25.
