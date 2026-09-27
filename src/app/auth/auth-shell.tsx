import { SiteHeader } from "@/components/layout/site-header";

/**
 * Shared chrome for the minimal auth routes. Exists so the three pages are not
 * three copies of a layout that Phase 4 is going to delete.
 */
export function AuthShell({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-sm px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">{title}</h1>
        {caption ? <p className="mt-2 mb-6 text-sm text-neutral-400">{caption}</p> : <div className="mb-6" />}
        {children}
      </main>
    </>
  );
}
