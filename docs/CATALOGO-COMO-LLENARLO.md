# Cómo llenar el catálogo y cargar las fotos

Para Mark y su socio. El catálogo de la web es hoy una propuesta marcada como PROVISIONAL. Con estos dos archivos lo reemplazan por el real sin entrar al panel pieza por pieza.

## 1. Los archivos

En la carpeta `catalogo/` hay dos plantillas que ya traen lo que se ve hoy en la web. Ábranlas con Excel o Google Sheets, corrijan y guárdenlas **como CSV (UTF-8)**.

- **`plantilla-catalogo.csv`**: una fila por opción. La columna **clase** dice qué es cada fila:
  - categoría, tipo, tamaño, papel, calibre, impresión, acabado, atributo ambiental, aptitud alimentaria;
  - **regla**: una compatibilidad con su motivo.
- **`plantilla-muestras.csv`**: una fila por muestra de la maleta (M-001, M-002…).

Reglas generales:

- **No cambien el código de algo que ya existe.** El código es lo que une la fila con el catálogo y con las cotizaciones hechas. Para corregir, cambien el nombre o la descripción. Para algo nuevo, usen un código nuevo: mayúsculas, números y guiones, como CJ-13 o PA-06.
- **Para quitar algo, no borren la fila:** pongan `no` en **activo**. Nada se borra; las solicitudes y cotizaciones ya hechas no cambian.
- **Cuando confirmen una fila con la fábrica,** pongan `no` en **provisional**.
- **Listas en una celda:** separen con `|`. Ejemplo: `comercial | alimentario`.
- **Sí / no:** escriban `sí` o `no`.
- **Celda vacía:** deja ese dato sin valor. En **archivo de foto**, vacío deja la foto que ya está.

| Columna | Para qué clase | Qué va |
| --- | --- | --- |
| categoría | tipo | Código de la categoría (CAJ, BOL…) |
| segmento | tipo | comercial, alimentario o los dos |
| familia | tipo, tamaño | caja, bolsa o caja de alimentos (define qué tamaños ofrece el tipo) |
| tamaños | tamaño | Largo x ancho x alto en cm: `20 x 15 x 8` |
| papel, calibre | tipo | Los únicos papeles o calibres con que se fabrica ese tipo. Vacío = todos |
| papel, calibre, tipo, permitido | regla | `sí` = solo con eso; `no` = nunca con eso. El motivo va en **descripción** y lo ve el cliente |
| aptitud | papel, aptitud alimentaria | caliente, frío, grasa, frágil, líquido |
| usos típicos | tipo | Ejemplos que se muestran en la web |
| barrera | papel | sí si el papel es barrera |
| etiqueta simple, gramaje, puntos, peso mín/máx | calibre | El peso es el rango de producto en gramos que aguanta |
| tintas, pantone, sin impresión | impresión | |
| sello en la web, certificado | atributo ambiental | No marquen el sello sin el certificado (enlace https) |
| cliente anterior | muestras | Para quién se hizo. Es interno: la web no lo muestra |
| notas de fábrica | todas | Solo para el RFQ; el cliente no las ve |
| archivo de foto | todas | Nombre del archivo en la carpeta `catalogo/fotos`. Los tipos y las muestras admiten varios: `caja1.jpg | caja2.jpg` |

## 2. Las fotos

### Fotos de catálogo (tipos, papeles, acabados…)

1. Copien las fotos a `catalogo/fotos/`.
2. Escriban el nombre de cada archivo en la columna **archivo de foto** de su fila.

### Fotos de las muestras

Hay dos formas:

- **Por nombre (lo más simple):** `M-001.jpg` es la foto principal de la muestra M-001, y `M-001-2.jpg`, `M-001-3.jpg` son las adicionales.
- **Escaneo en lote:** si el escáner pone sus propios nombres (`Escaneo 001.pdf`):
  1. Hagan un `orden.csv` con una columna `codigo`.
  2. Escriban un código por foto, en el mismo orden en que salen: archivos por nombre y, dentro de un PDF, página por página.
  3. Repetir un código agrega otra foto a esa muestra.

Detalles de los archivos:

- Se aceptan JPG, PNG, WebP y PDF de varias páginas, hasta 80 MB cada uno. En un PDF, cada página es una foto.
- No hace falta recortar ni achicar: el sistema quita el margen blanco, pasa la foto a WebP y genera la miniatura.
- Escaneen sobre fondo blanco, con la pieza completa y sin sombras.

## 3. Cargar

En la carpeta del proyecto, con las variables de producción en `.env.local` (o con la base local para practicar):

```
pnpm catalog:import catalogo/plantilla-catalogo.csv catalogo/plantilla-muestras.csv --prueba
```

1. **`--prueba`** revisa todo y no cambia nada. Revisa que:
   - los códigos no se repitan;
   - existan las categorías, papeles y acabados que se nombran;
   - las fotos estén en la carpeta;
   - cada tipo tenga al menos un papel y un calibre posibles;
   - cada muestra use un papel permitido para su tipo.
2. Si sale una lista de errores, cada uno dice archivo, fila, código y qué corregir. Con un solo error **no se carga nada**.
3. Cuando diga "Prueba sin errores", corran lo mismo sin `--prueba`. La web se actualiza en unos 5 minutos.

Las fotos de las muestras van aparte:

```
pnpm gallery:import catalogo/escaneos --prueba
pnpm gallery:import catalogo/escaneos --orden catalogo/escaneos/orden.csv --crear
```

`--crear` da de alta, inactivas, las muestras que todavía no estén en la plantilla. Actívenlas en la plantilla o en el panel.

Para volver a bajar las plantillas con lo que ya está cargado: `pnpm catalog:export`.
