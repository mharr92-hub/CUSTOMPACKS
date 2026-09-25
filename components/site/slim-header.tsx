import { BrandLogo } from "./brand-logo";

/** Cabecera mínima para el cotizador y el seguimiento (sin navegación que distraiga). */
export function SlimHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-paper">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <BrandLogo />
        {children}
      </div>
    </header>
  );
}
