import { describe, expect, it } from "vitest";
import { bucketLimitIssues } from "../../scripts/lib/storage-check.mjs";

const MB = 1024 * 1024;

describe("límite de los buckets frente a max_file_mb (M11)", () => {
  it("avisa cuando un bucket acepta menos de lo configurado o falta", () => {
    const issues: string[] = bucketLimitIssues(
      [
        { id: "artwork", file_size_limit: 50 * MB },
        { id: "evidence", file_size_limit: null },
      ],
      100,
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('"artwork" acepta hasta 50 MB');
    expect(issues[1]).toContain('Falta el bucket "documents"');
  });
  it("sin problemas cuando todos alcanzan", () => {
    expect(bucketLimitIssues(["artwork", "evidence", "documents"].map((id) => ({ id, file_size_limit: 200 * MB })), 100)).toEqual([]);
  });
});
