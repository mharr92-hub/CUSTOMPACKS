/** Tipos compartidos por el componente de subida (navegador) y el servidor. */
export type UploadedFile = { id: string; name: string; size: number; path: string; kind: string };

export type UploadErrorKey = "tooLarge" | "tooMany" | "badType" | "typeMismatch" | "network" | "expired" | "rateLimited" | "generic";

export type SlotResult =
  | { ok: true; url: string; method: "PUT"; headers: Record<string, string>; path: string }
  | { ok: false; error: UploadErrorKey };

/** `previewUrl`: URL firmada corta para mostrar la vista previa recién subida. */
export type ConfirmResult = { ok: true; file: UploadedFile; previewUrl?: string } | { ok: false; error: UploadErrorKey };
