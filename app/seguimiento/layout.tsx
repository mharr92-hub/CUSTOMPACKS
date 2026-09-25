import { SlimHeader } from "@/components/site/slim-header";

export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SlimHeader />
      <main id="contenido" className="flex-1">
        {children}
      </main>
    </>
  );
}
