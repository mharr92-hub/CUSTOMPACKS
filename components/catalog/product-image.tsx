import Image from "next/image";
import { cn } from "@/lib/utils";
import { CodePlaceholder } from "./code-placeholder";

/** Foto de la pieza o, si todavía no hay, el marcador con su código. */
export function ProductImage({
  photoUrl,
  code,
  alt,
  placeholderLabel,
  variant,
  sizes,
  priority = false,
  className,
}: {
  photoUrl: string | null;
  code: string;
  alt: string;
  placeholderLabel: string;
  variant: "box" | "bag" | "food_box" | "sample";
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden bg-kraft-light", className)}>
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
        />
      ) : (
        <CodePlaceholder code={code} variant={variant} label={placeholderLabel} />
      )}
    </div>
  );
}
