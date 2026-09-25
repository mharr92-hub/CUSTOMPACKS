import { cn } from "@/lib/utils";

/**
 * Marco con marcas de corte de imprenta en las esquinas: indica que lo de
 * adentro es una pieza impresa. Las marcas se dibujan con CSS (.crop-frame en
 * app/globals.css) fuera del área de la imagen, como en un pliego real.
 */
export function CropFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("crop-frame", className)}>{children}</div>;
}
