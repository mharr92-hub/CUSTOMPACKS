// Compara el límite de tamaño de cada bucket privado de Supabase con
// settings.max_file_mb (M11). Función pura: la usa scripts/check-storage.mjs y
// la prueba unitaria.
export const PRIVATE_BUCKETS = ["artwork", "evidence", "documents"];

/**
 * @param {{ id: string; file_size_limit: number | null }[]} buckets
 * @param {number} maxFileMb
 * @returns {string[]} problemas legibles (vacío si todo alcanza)
 */
export function bucketLimitIssues(buckets, maxFileMb) {
  const issues = [];
  const needed = maxFileMb * 1024 * 1024;
  for (const id of PRIVATE_BUCKETS) {
    const bucket = buckets.find((b) => b.id === id);
    if (!bucket) {
      issues.push(`Falta el bucket "${id}": aplica las migraciones (pnpm db:migrate).`);
      continue;
    }
    // null = sin límite propio: manda el límite global del proyecto (Storage → Settings).
    if (bucket.file_size_limit !== null && bucket.file_size_limit < needed) {
      const mb = Math.floor(bucket.file_size_limit / 1024 / 1024);
      issues.push(`El bucket "${id}" acepta hasta ${mb} MB y la configuración pide ${maxFileMb} MB: súbelo o baja max_file_mb.`);
    }
  }
  return issues;
}
