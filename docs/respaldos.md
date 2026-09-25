# Respaldos y monitoreo de errores

Guía para respaldar la base todos los días y, si se quiere, recibir los errores en Sentry. Nada de esto requiere pagar: el respaldo corre en GitHub Actions y Sentry tiene un plan gratuito.

## 1. Qué se respalda

| Qué | Dónde vive | Cómo se respalda |
| --- | --- | --- |
| Datos del negocio: catálogo, solicitudes, cotizaciones, pedidos, pagos, plantillas, auditoría | Esquema `public` de Postgres | `scripts/backup.mjs` (pg_dump), todos los días |
| Usuarios del equipo (correo y rol) | Esquema `auth` y tabla `profiles` | `profiles` va en `public`. Si se pierde `auth`, se vuelve a invitar a cada persona desde `/admin/usuarios` y recupera su rol. |
| Archivos: arte, proofs, evidencias, comprobantes, PDF emitidos | Supabase Storage (en local, `.data/storage`) | Fuera de la base. Ver la sección 5. |

## 2. Respaldo manual

Requisito: el cliente de PostgreSQL (`pg_dump` y `pg_restore`), versión 17 o mayor, igual o más nueva que la del servidor.

```bash
# Base local (Postgres embebido en :54322)
node scripts/backup.mjs

# Otra base
BACKUP_DATABASE_URL="postgres://usuario:clave@host:5432/postgres" node scripts/backup.mjs
```

El archivo queda en `.data/backups/provenpack-AAAA-MM-DD-HH-MM.dump`, en formato comprimido de pg_dump. El script borra los respaldos de más de 14 días de esa carpeta.

| Variable | Para qué | Valor por defecto |
| --- | --- | --- |
| `BACKUP_DATABASE_URL` | Base a respaldar | `DATABASE_URL` o la local |
| `BACKUP_DIR` | Carpeta de destino | `.data/backups` |
| `BACKUP_KEEP_DAYS` | Días que se conservan | `14` |
| `BACKUP_SCHEMAS` | Esquemas, separados por coma | Todos. En Supabase, usar `public`. |
| `PG_DUMP` | Ruta de `pg_dump` si no está en el PATH | `pg_dump` |

Si falla, el mensaje de error oculta la contraseña de la URL.

## 3. Respaldo diario automático (GitHub Actions)

El flujo `.github/workflows/backup.yml` corre todos los días a las 03:00 de Panamá, y también a mano desde la pestaña Actions.

1. Hace `pg_dump` de la base.
2. Cifra el archivo con GPG (AES-256) usando una frase de paso.
3. Lo guarda como artefacto del run durante 14 días.

Para activarlo, en GitHub ve a **Settings → Secrets and variables → Actions** y crea:

- Secreto `BACKUP_DATABASE_URL`: la cadena de conexión directa de Supabase (*Project Settings → Database → Connection string*, modo *Session*, puerto 5432), con la contraseña de la base.
- Secreto `BACKUP_PASSPHRASE`: una frase larga que se guarda fuera de GitHub (por ejemplo, en el gestor de contraseñas de Mark). Sin ella, los respaldos no se pueden abrir.
- Variable (no secreto) `BACKUP_SCHEMAS` = `public`.

Mientras falte alguno de los dos secretos, el flujo termina sin hacer nada y deja un aviso.

Para descargar un respaldo: pestaña **Actions → Respaldo diario → el run del día → Artifacts**.

> Los artefactos quedan en GitHub. Contienen datos de clientes, aunque cifrados. Solo deben tener acceso al repositorio las personas del equipo que lo necesiten.

## 4. Restaurar

```bash
# 1. Descifrar (si viene de GitHub Actions)
gpg --decrypt provenpack-AAAA-MM-DD-HH-MM.dump.gpg > respaldo.dump

# 2. Restaurar en una base vacía (recomendado) para revisar antes de reemplazar
createdb -h host -U usuario restauracion
pg_restore --no-owner --no-privileges -d "postgres://usuario:clave@host:5432/restauracion" respaldo.dump

# 3. O reemplazar los objetos de la base actual
pg_restore --clean --if-exists --no-owner --no-privileges -d "postgres://usuario:clave@host:5432/postgres" respaldo.dump
```

Después de restaurar, corre `pnpm db:migrate` contra esa base para aplicar las migraciones que falten, si el respaldo es anterior a alguna.

La prueba `tests/db/backup.test.ts` hace el recorrido completo en CI: respalda la base de pruebas, la restaura en una base nueva y compara los conteos y que todas las tablas conserven RLS. En una máquina sin `pg_dump` 17, la prueba se omite.

## 5. Archivos (Storage)

Los archivos no están en la base, así que pg_dump no los incluye.

- **Local:** copia la carpeta `.data/storage`.
- **Supabase:** los buckets privados (`artwork`, `documents`, `evidence`) se descargan desde el panel de Supabase (*Storage*) o con cualquier cliente compatible con S3, usando las credenciales S3 del proyecto (*Project Settings → Storage*).

Se recomienda una copia mensual. Los archivos de arte vencidos (`artwork_retention_months`) solo se marcan; se borran cuando admin lo confirma en `/admin/archivos`.

## 6. Sentry (opcional)

Con la variable `NEXT_PUBLIC_SENTRY_DSN` definida (DSN de un proyecto de Sentry, plan gratuito), se envían a Sentry:

- los errores del servidor que pasan por `log.error`, y los errores no capturados de páginas, acciones y rutas (`instrumentation.ts`);
- los errores no capturados del navegador. Pasan por `/api/errores`, con tope por IP, así que la CSP no necesita abrir otro dominio.

Antes de enviar, se borran los tokens de los enlaces de seguimiento, los parámetros `t`, `borrador` y `repetir`, los correos y las contraseñas de URLs de base. No se usa el SDK de Sentry (`lib/sentry.ts`), para no sumar peso al sitio.

Sin DSN, no se envía nada y los errores quedan solo en el log del servidor (Vercel → Logs).
