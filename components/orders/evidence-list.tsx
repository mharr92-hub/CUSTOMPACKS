import { FileTextIcon, PlayCircleIcon } from "lucide-react";

/** Evidencias de un hito (fotos, video o PDF) con URL firmada de corta duración. */
export type EvidenceItem = { path: string; kind: string; name: string; url: string | null };

const IMAGE = new Set(["png", "jpeg", "webp"]);
const VIDEO = new Set(["mp4", "mov"]);

export function EvidenceList({ evidence, alt, videoLabel, fileLabel }: { evidence: EvidenceItem[]; alt: string; videoLabel: string; fileLabel: string }) {
  const shown = evidence.filter((e) => e.url);
  if (shown.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2" data-testid="evidence-list">
      {shown.map((e) => (
        <li key={e.path}>
          {IMAGE.has(e.kind) ? (
            <a href={e.url as string} target="_blank" rel="noopener noreferrer" className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
              {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado con URL firmada de corta duración */}
              <img src={e.url as string} alt={alt} className="size-24 rounded-md border border-border bg-muted object-cover sm:size-28" loading="lazy" />
            </a>
          ) : (
            <a
              href={e.url as string}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-24 flex-col items-center justify-center gap-1 rounded-md border border-border bg-muted px-2 text-center text-xs font-medium sm:size-28"
            >
              {VIDEO.has(e.kind) ? <PlayCircleIcon aria-hidden="true" className="size-6" /> : <FileTextIcon aria-hidden="true" className="size-6" />}
              {VIDEO.has(e.kind) ? videoLabel : fileLabel}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
