import { describe, expect, it } from "vitest";
import { draftFilePath } from "@/lib/artwork/paths";
import { assertSafePath } from "@/lib/storage";
import { fileNonce, randomToken } from "@/lib/tokens";

describe("rutas de archivos", () => {
  it("acepta tokens base64url que empiezan con - o _ (borradores y prefijos)", () => {
    expect(() => assertSafePath("drafts/-UQsPV1XfE-p6NnH/p1/artwork/0af3c2d1e4b5a697-logo.pdf")).not.toThrow();
    expect(() => assertSafePath("drafts/_abc/p1/reference/foto.jpg")).not.toThrow();
    expect(() => assertSafePath("requests/1b2c/3d4e/proof/-UQsPV1XfE-p6NnH-proof.pdf")).not.toThrow();
  });

  it("rechaza rutas peligrosas o vacías", () => {
    for (const bad of ["../etc/passwd", "a/../b", "a//b", ".hidden/x", "a/.x", "/abs/path", "a/b/", "a\b", "a b/c", ""]) {
      expect(() => assertSafePath(bad), bad).toThrow(/Ruta de archivo no válida/);
    }
  });

  it("cualquier token de borrador genera una ruta de subida válida", () => {
    for (let i = 0; i < 500; i++) {
      const path = draftFilePath(randomToken(32), "p1", "artwork", fileNonce(), "Logo final (1).pdf");
      expect(() => assertSafePath(path), path).not.toThrow();
    }
  });

  it("el prefijo de archivo es hexadecimal de 16 caracteres", () => {
    expect(fileNonce()).toMatch(/^[0-9a-f]{16}$/);
  });
});
