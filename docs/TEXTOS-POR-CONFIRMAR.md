# Textos por confirmar

Los textos del sitio, el portal y las 23 plantillas ya fueron revisados (ortografía, tono de tú, variables). Aquí solo queda lo que necesita una decisión o un dato de Mark: montos, nombres, datos de contacto y cuenta bancaria. Cada fila dice qué cargar y dónde.

## 1. Datos de pago (Panel → Configuración)

| Qué falta | Dónde se carga | Dónde se ve |
| --- | --- | --- |
| Banco, tipo de cuenta, número y beneficiario | `payment_bank_name`, `payment_account_type`, `payment_account_number`, `payment_account_holder` | Portal del pedido ("Cómo pagar") y PDF de la cotización |
| Correo para recibir comprobantes | `payment_receipts_email` | Portal y PDF de la cotización |
| Otras formas de pago (Yappy, ACH, qué poner como referencia) | `payment_instructions` | Debajo de los datos de la cuenta |
| **Medios de pago aceptados.** Hoy los textos dicen "por transferencia o ACH". ¿Se suma Yappy, cheque o tarjeta? | `messages/es.json` → `faq.items.payment.a` y `legal.terms.sections.payment.body` | Preguntas frecuentes y términos |

Mientras no estén cargados, el portal ofrece pedir los datos por WhatsApp y el PDF dice que se envían al aceptar.

## 2. Datos de contacto (variables de entorno, `docs/deploy.md`)

| Qué falta | Variable |
| --- | --- |
| Número de WhatsApp del negocio | `NEXT_PUBLIC_WHATSAPP_NUMBER` |
| Correo público de contacto (también para los derechos de Ley 81) | `NEXT_PUBLIC_CONTACT_EMAIL` |
| Remitente de los correos (p. ej. `ProvenPack <hola@provenpack.com>`) | `MAIL_FROM` |
| Correo de la fábrica para los RFQ | `FACTORY_EMAIL` |
| Correo del equipo para los avisos internos | Configuración → `team_notification_email` |

## 3. Nombres y datos legales (pregunta 11)

| Texto actual | Dónde | Qué decidir |
| --- | --- | --- |
| "{brand} es responsable de los datos…" (dice ProvenPack) | `legal.privacy.sections.who.body` | Razón social, RUC y domicilio del responsable |
| Términos y condiciones sin razón social | `legal.terms` | Razón social y RUC; revisión de un abogado. Hasta entonces las páginas dicen "Documento en revisión legal" (`legal.draftNote`) |
| "Los precios y los montos del pedido no incluyen el ITBMS (7 %)" | `legal.terms.sections.quotes.body` | Con el contador: si alguna pieza está exenta |

## 4. Montos y condiciones que ve el cliente

| Texto o valor | Dónde | Qué decidir |
| --- | --- | --- |
| Moneda USD | Configuración → `currency`; `legal.terms.sections.quotes.body` | Confirmar (hoy PROVISIONAL) |
| Vigencia de la cotización: 15 días | Configuración → `quote_validity_days` | Confirmar (pregunta 15) |
| "El plazo incluye producción y transporte hasta {ciudad}" y "Gestionamos el embarque, la aduana y la entrega" | `quotePdf.leadTimeRule`, `legal.terms.sections.leadTime.body`, `howItWorks.steps.deliver.us` | Si el plazo de 45/30 días incluye tránsito, aduana y entrega local (pregunta 8) |
| "En Panamá, en la dirección que nos indiques. Si estás en otro país, escríbenos" | `faq.items.delivery.a` | Si se cotiza fuera de Panamá (pregunta 13) |
| "Consulta con tu asesor qué muestras podemos enviarte" | `faq.items.samples.a` | Política de muestras físicas: si se envían y si tienen costo (pregunta 12) |
| "Indícalo en el cotizador… y un asesor te cuenta las opciones" | `faq.items.design.a` | Si el diseño de arte es un servicio y su tarifa (pregunta 12) |
| Tolerancias "de la ficha técnica de fábrica" | `legal.terms.sections.tolerances.body` | Tolerancias de cantidad y color (pregunta 12) |

## 5. Afirmaciones sobre clientes y muestras

| Texto | Dónde | Qué confirmar |
| --- | --- | --- |
| "Hemos producido para cadenas internacionales de comida rápida y grandes almacenes" | `home.clients.body`, `clients.intro` | Que se puede decir sin nombrar a nadie. Los nombres y logos requieren autorización escrita (pregunta 14) |
| "Más de 200 muestras reales" | `home.gallery.intro`, `gallery.intro` | El número real cuando estén escaneadas |
| Empresas de la demo: "Café Altura Boquete (DEMO)" y "Sabores del Istmo (DEMO)" | `pnpm db:seed-demo` | Otros nombres o un caso real con permiso (pregunta 3) |

## 6. Plantillas de mensajes

Las 23 plantillas que siguen PROVISIONAL ya están corregidas. Solo hace falta leerlas y guardarlas en Panel → Plantillas; al guardarlas dejan de ser provisionales (pregunta 16). Ninguna lleva montos fijos: los montos, fechas y enlaces los completa el sistema, y los montos de saldo van con la leyenda del impuesto.
