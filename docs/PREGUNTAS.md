# Preguntas para Mark

Lo que el sistema necesita de Mark y no se puede decidir desde el código. Cada punto dice qué hace hoy la plataforma mientras tanto y dónde se carga la respuesta. El detalle de cuentas y contenido está en `docs/lanzamiento.md`.

## Nuevas (25/09/2026)

1. **ITBMS en los pagos.** Hoy los precios y los montos del pedido (total, anticipo, saldo) son **sin impuesto**, con la leyenda "más ITBMS 7 %" (D-102).
   - ¿El cliente paga el anticipo y el saldo con el 7 % incluido (y el sistema lo calcula y lo muestra sumado), o el impuesto va en una factura aparte?
   - Si se incluye, hay que definir si el 7 % se aplica a todas las piezas o hay exentas.
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
| 9 | Datos de pago (banco, cuenta, ACH, Yappy) | El portal ofrece pedirlos por WhatsApp | Configuración > `payment_instructions` |
| 10 | Correo del equipo para avisos internos | Usa el correo de admin | Configuración > `team_notification_email` |
| 11 | Razón social y RUC para las páginas legales; revisión de un abogado (Ley 81 de 2019) | Dicen "ProvenPack" | `messages/es.json` > `legal` |
| 12 | Tolerancias de cantidad y color; política de muestras físicas; diseño de arte como servicio y tarifa | Los términos remiten a la ficha técnica de fábrica | `messages/es.json` > `legal.terms` |
| 13 | ¿Se cotiza fuera de Panamá? Reglas de flete | El flete es un campo manual por línea | Editor de cotización |
| 14 | Autorización escrita para logos y nombres de clientes (KFC, McDonald's…) | `/clientes` no muestra ninguno | Configuración > `show_client_logos`, con los archivos autorizados |
| 15 | Margen por defecto, vigencia de la cotización, SLA y horario hábil | 35 %, 15 días, 4 h / 24 h, lun–vie 08:00–17:00 (PROVISIONAL) | Configuración |
| 16 | Textos de las 15 plantillas de mensajes PROVISIONAL | Redactados con el tono del PRD | Panel → Plantillas |
| 17 | Cuentas: dominio, Supabase, Vercel, Resend, WhatsApp, GA4, Meta Pixel, correo de la fábrica | Modo local o simulado para cada una | Variables de entorno (`docs/deploy.md`) |
| 18 | Quiénes cotizan y hacen seguimiento (roles y número de personas) | Roles Ventas, Operaciones y QA y Solo lectura | Panel → Usuarios |

## De la auditoría (25/09/2026)

Estas respuestas definen cómo se corrigen algunos hallazgos de `docs/AUDITORIA.md`. Las tareas de `TAREAS-mejoras.md` que dependen de ellas usan mientras tanto la opción más conservadora.

19. **Pagos en varias partes** (DAT-02, REG-02).
    - ¿El anticipo o el saldo se pueden pagar en varias transferencias?
    - ¿Se acepta una diferencia pequeña por comisiones bancarias? ¿De cuánto?
    - Hoy cualquier pago confirmado cuenta como completo. Mientras no respondas, la corrección exigirá que la suma de los pagos confirmados cubra el monto, sin tolerancia.
20. **Planes de pago para producción** (sección 8 de la auditoría).
    - Vercel Hobby no permite uso comercial, y Supabase Free se queda sin espacio para archivos en semanas.
    - Estimado: unos USD 45 al mes con 100 solicitudes (Supabase Pro + Vercel Pro), y unos USD 65 con 500, sumando Resend Pro. Son precios de 2025: hay que verificarlos.
    - ¿Apruebas contratar esos planes cuando se lance? El sistema no contrata nada por su cuenta.
21. **Retención de archivos** (REN, DAT-04).
    - Hoy el arte se guarda 24 meses y las fotos de QA no se borran nunca.
    - ¿Cuánto tiempo hay que guardar las evidencias de QA y los comprobantes de pago?
22. **Datos personales, Ley 81** (DAT-03, SEG-07).
    - ¿Quién atiende las solicitudes de acceso y eliminación?
    - ¿Qué datos hay que conservar aunque el cliente pida borrarlos (facturas o pedidos, por obligación contable)? ¿Durante cuánto tiempo?
23. **Tiempo de respuesta de la fábrica al RFQ** (`docs/MEJORAS.md`, P-12).
    - Para cotizar en 24 horas hábiles, la fábrica tiene que responder en una fracción de ese tiempo.
    - ¿Qué tiempo de respuesta se puede acordar con la fábrica?
    - Mientras tanto, el recordatorio propuesto usa la mitad del SLA de cotización (PROVISIONAL).
