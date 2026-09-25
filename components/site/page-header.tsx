import { cn } from "@/lib/utils";

/** Encabezado de página interior: título grande y una entrada breve. */
export function PageHeader({
  title,
  intro,
  children,
  className,
}: {
  title: string;
  intro?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mx-auto max-w-7xl px-4 pt-12 pb-8 sm:px-6 sm:pt-16 lg:px-8", className)}>
      {children}
      <h1 className="max-w-4xl text-4xl leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-6xl">{title}</h1>
      {intro ? <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{intro}</p> : null}
    </header>
  );
}

/** Contenedor estándar de sección. */
export function Section({ children, className, id, labelledBy }: { children: React.ReactNode; className?: string; id?: string; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </section>
  );
}
