# Respaldos y monitoreo de errores

Guía para respaldar la base todos los días y, si se quiere, recibir los errores en Sentry. Nada de esto requiere pagar: el respaldo corre en GitHub Actions y Sentry tiene un plan gratuito.

## 1. Qué se respalda

| Qué | Dónde vive | Cómo se respalda |
| --- | --- | --- |
| Datos del negocio: catálogo, solicitudes, cotizaciones, pedidos, pagos, plantillas, auditoría | Esquema `public` de Postgres | `scripts/backup.mjs` (pg_dump), todos los días |
| Usuarios del equipo (correo y rol) | Esquema `auth` y tabla `profiles` | `profiles` va en `public`. El id y el correo de cada usuario de `auth.users` van en `provenpack-auth-users-….json`, junto al dump, para restaurar con los mismos UUID. |
| Archivos: arte, proofs, evidencias, comprobantes, PDF emitidos | Supabase Storage (en local, `.data/storage`) | Copia diaria con rclone a un almacenamiento compatible con S3 (sección 5). |

## 2. Respaldo manual

Requisito: el cliente de PostgreSQL (`pg_dump` y `pg_restore`), versión 17 o mayor, igual o más nueva que la del servidor.

```bash
# Base local (Postgres embebido en :54322)
node scripts/backup.mjs

# Otra base
BACKUP_DATABASE_URL="postgres://usuario:clave@host:5432/postgres" node scripts/backup.mjs
```

El archivo queda en `.data/backups/provenpack-AAAA-MM-DD-HH-MM.dump`, en formato comprimido de pg_dump. Al lado deja `provenpack-auth-users-AAAA-MM-DD-HH-MM.json` con los usuarios. El script borra los respaldos de más de 30 días de esa carpeta (PRD §15).

| Variable | Para qué | Valor por defecto |
| --- | --- | --- |
| `BACKUP_DATABASE_URL` | Base a respaldar | `DATABASE_URL` o la local |
| `BACKUP_DIR` | Carpeta de destino | `.data/backups` |
| `BACKUP_KEEP_DAYS` | Días que se conservan | `30` |
| `BACKUP_SCHEMAS` | Esquemas, separados por coma | Todos. En Supabase, usar `public`. |
| `PG_DUMP` | Ruta de `pg_dump` si no está en el PATH | `pg_dump` |

Si falla, el mensaje de error oculta la contraseña de la URL.

## 3. Respaldo diario automático (GitHub Actions)

El flujo `.github/workflows/backup.yml` corre todos los días a las 03:00 de Panamá, y también a mano desde la pestaña Actions.

1. Hace `pg_dump` de la base.
2. Cifra el archivo con GPG (AES-256) usando una frase de paso.
3. Lo guarda como artefacto del run durante 30 días (PRD §15), junto al archivo de usuarios, también cifrado.
4. En otro trabajo, copia los archivos de Storage (sección 5).

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

**Proyecto de Supabase nuevo:** los usuarios no vienen en el dump de `public`. Antes de restaurar `public`, vuelve a crear cada usuario de `provenpack-auth-users-….json` con el **mismo id** (desde el SQL Editor: `insert into auth.users (id, email, raw_app_meta_data, aud, role) values (...)`), para que `profiles`, solicitudes y auditoría sigan apuntando a la misma persona. Después, cada uno entra con su enlace mágico.

La prueba `tests/db/backup.test.ts` hace el recorrido completo en CI, todos los días que se hace push: respalda la base de pruebas, comprueba el archivo de usuarios, la restaura en una base nueva y compara los conteos y que todas las tablas conserven RLS. En una máquina sin `pg_dump` 17, la prueba se omite.

## 5. Archivos (Storage)

Los archivos no están en la base, así que pg_dump no los incluye.

- **Local:** copia la carpeta `.data/storage`.
- **Supabase, todos los días (`.github/workflows/backup.yml`, trabajo "Copia de archivos"):** rclone copia los buckets privados (`artwork`, `documents`, `evidence`) a un almacenamiento compatible con S3 que elija Mark. El repositorio no contrata ninguno: mientras falten los datos, el trabajo avisa y no hace nada. Para activarlo, en GitHub (**Settings → Secrets and variables → Actions**):
  - Origen (Supabase → *Project Settings → Storage → S3 connection*, "New access key"): secretos `STORAGE_S3_ENDPOINT`, `STORAGE_S3_ACCESS_KEY_ID` y `STORAGE_S3_SECRET_ACCESS_KEY`.
  - Destino (el servicio que elija Mark): secretos `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID` y `BACKUP_S3_SECRET_ACCESS_KEY`, y la variable `BACKUP_S3_BUCKET`.
  - Es una copia acumulativa (`rclone copy`): lo borrado en Supabase sigue en el destino. Configura allí la retención que defina Mark (pregunta 21 de `docs/PREGUNTAS.md`).

## 5b. Migraciones

- Una migración ya aplicada **no se edita**: `pnpm db:migrate` guarda el sha256 de cada archivo aplicado (`supabase_migrations.provenpack_checksums`) y falla, sin tocar nada, si uno cambió. El cambio va en una migración nueva.
- Contra Supabase, `pnpm db:migrate` hace antes un `pg_dump` del esquema `public` (requiere `pg_dump` 17). Si el respaldo falla, no aplica nada; `--sin-respaldo` lo salta bajo tu responsabilidad.
- Política: se corrige hacia adelante. Si una migración que cambia datos sale mal, se restaura el respaldo previo y se aplica una migración correctiva. Los archivos de arte vencidos (`artwork_retention_months`) solo se marcan; se borran cuando admin lo confirma en `/admin/archivos`.

## 6. Sentry (opcional)

Con la variable `NEXT_PUBLIC_SENTRY_DSN` definida (DSN de un proyecto de Sentry, plan gratuito), se envían a Sentry:

- los errores del servidor que pasan por `log.error`, y los errores no capturados de páginas, acciones y rutas (`instrumentation.ts`);
- los errores no capturados del navegador. Pasan por `/api/errores`, con tope por IP, así que la CSP no necesita abrir otro dominio.

Antes de enviar, se borran los tokens de los enlaces de seguimiento, los parámetros `t`, `borrador` y `repetir`, los correos y las contraseñas de URLs de base. No se usa el SDK de Sentry (`lib/sentry.ts`), para no sumar peso al sitio.

Sin DSN, no se envía nada y los errores quedan solo en el log del servidor (Vercel → Logs).
