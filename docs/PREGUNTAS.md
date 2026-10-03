# Preguntas para Mark

Lo que el sistema necesita de Mark y no se puede decidir desde el código. La lista de tareas completa, en orden, está en `docs/PENDIENTES-MARK.md`. Cada punto dice qué hace hoy la plataforma mientras tanto y dónde se carga la respuesta. El detalle de cuentas y contenido está en `docs/lanzamiento.md`.

## Nuevas (25/09/2026)

1. ~~**ITBMS en los pagos.**~~ **Resuelta (03/10/2026, D-102):** los precios y los montos del pedido van sin impuesto, con la leyenda "más ITBMS 7 %" en el editor, el PDF y el portal. La leyenda se cambia en Configuración > `tax_label`.
2. **Precios en la pantalla de aceptación.** Con la regla 7 corregida, una vez emitida la cotización se podrían mostrar sus precios en el portal, no solo en el PDF.
   - Hoy la pantalla de aceptación remite al PDF (D-068) y solo el pedido aceptado muestra montos (D-101).
   - ¿Mostramos también los precios de la cotización en pantalla antes de aceptar?
3. **Datos para la demo.** `pnpm db:seed-demo` usa dos empresas ficticias: "Café Altura Boquete (DEMO)" y "Sabores del Istmo (DEMO)".
   - ¿Prefieres otros nombres o un caso real (con permiso del cliente) para las presentaciones?

## Ya conocidas (siguen abiertas)

| # | Pregunta | Qué hace hoy el sistema | Dónde se carga |
| --- | --- | --- | --- |
| 4 | Lista real de tipos, tamaños, papeles, calibres, impresión, acabados y atributos, con fotos (PRD §20) | Catálogo PROVISIONAL de ejemplo; en la web no aparece la etiqueta | Panel → Catálogo; fotos con `pnpm gallery:import` |
| 5 | Fotos de las 200 muestras con su código | 12 muestras de ejemplo | `pnpm gallery:import <carpeta>` |
| 6 | Umbral de volumen entre 30 y 45 días | 10.000 unidades (PROVISIONAL) | Configuración > `lead_time_threshold_units` |
| 7 | Formato del RFQ que prefiere la fábrica | PDF y Excel con la ficha completa | `config/rfq-format.ts` |
| 8 | Si el plazo incluye tránsito, aduana y entrega local; lugar de entrega estándar | Los términos dicen "incluye producción y tránsito hasta la dirección pactada" | `messages/es.json` > `legal.terms` |
| 9 | Datos de pago (banco, tipo de cuenta, número, beneficiario, correo de comprobantes; Yappy u otros) | El portal ofrece pedirlos por WhatsApp y el PDF de la cotización dice que se envían al aceptar | Configuración > `payment_bank_name`, `payment_account_type`, `payment_account_number`, `payment_account_holder`, `payment_receipts_email` y `payment_instructions` |
| 10 | Correo del equipo para avisos internos | Usa el correo de admin | Configuración > `team_notification_email` |
| 11 | Razón social y RUC para las páginas legales; revisión de un abogado (Ley 81 de 2019) | Dicen "ProvenPack" | `messages/es.json` > `legal` |
| 12 | Tolerancias de cantidad y color; política de muestras físicas; diseño de arte como servicio y tarifa | Los términos remiten a la ficha técnica de fábrica | `messages/es.json` > `legal.terms` |
| 13 | ¿Se cotiza fuera de Panamá? Reglas de flete | El flete es un campo manual por línea | Editor de cotización |
| 14 | Autorización escrita para logos y nombres de clientes (KFC, McDonald's…) | `/clientes` no muestra ninguno | Configuración > `show_client_logos`, con los archivos autorizados |
| 15 | Margen por defecto, vigencia de la cotización, SLA y horario hábil | 35 %, 15 días, 4 h / 24 h, lun–vie 08:00–17:00 (PROVISIONAL) | Configuración |
| 16 | Textos de las 23 plantillas de mensajes PROVISIONAL | Revisados el 03/10/2026 (redacción, tono y variables); falta que Mark los guarde | Panel → Plantillas |
| 17 | Cuentas: dominio, Supabase, Vercel, Resend, WhatsApp, GA4, Meta Pixel, correo de la fábrica | Modo local o simulado para cada una | Variables de entorno (`docs/deploy.md`) |
| 18 | Quiénes cotizan y hacen seguimiento (roles y número de personas) | Roles Ventas, Operaciones y QA y Solo lectura | Panel → Usuarios |

## De la auditoría (25/09/2026)

Estas respuestas definen cómo se corrigen algunos hallazgos de `docs/AUDITORIA.md`. Las tareas de `TAREAS-mejoras.md` que dependen de ellas usan mientras tanto la opción más conservadora.

19. ~~**Pagos en varias partes.**~~ **Resuelta (03/10/2026, D-113):** los pagos parciales se acumulan y el pedido pasa a "Anticipo recibido" cuando la suma cubre el anticipo (50 %). Se acepta una diferencia por comisiones del 1 % o USD 25, lo que sea menor (Configuración > `payment_tolerance_pct` y `payment_tolerance_max`).
20. **Planes de pago para producción** (sección 8 de la auditoría). **Sigue pendiente de Mark.**
    - Vercel Hobby no permite uso comercial, y Supabase Free se queda sin espacio para archivos en semanas.
    - Estimado: unos USD 45 al mes con 100 solicitudes (Supabase Pro + Vercel Pro), y unos USD 65 con 500, sumando Resend Pro. Son precios de 2025: hay que verificarlos.
    - ¿Apruebas contratar esos planes cuando se lance? El sistema no contrata nada por su cuenta.
21. ~~**Retención de archivos.**~~ **Resuelta (03/10/2026, D-115):** los comprobantes de pago y las cotizaciones aceptadas se guardan 5 años; las fotos y videos de QA y el arte, 24 meses después de cerrar el pedido. Un proceso diario marca lo vencido y admin confirma el borrado en Panel → Archivos.
22. ~~**Datos personales, Ley 81.**~~ **Resuelta (03/10/2026, D-116):** al borrar se anonimiza el contacto y se borran los borradores; en solicitudes que no llegaron a pedido también se borran las referencias y el arte. Se conservan las cotizaciones aceptadas, los pedidos, los pagos y los documentos legales durante los plazos de la pregunta 21. Lo atiende un usuario con rol admin en Panel → Datos personales.
23. ~~**Tiempo de respuesta de la fábrica al RFQ.**~~ **Resuelta (03/10/2026, D-114):** 48 horas hábiles (Configuración > `factory_sla_hours`). Pasado ese plazo, el sistema le reenvía el RFQ a la fábrica con un recordatorio y avisa al equipo.
