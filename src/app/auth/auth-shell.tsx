import { SiteHeader } from "@/components/layout/site-header";

/**
 * Chrome for `/auth/status`, the operator diagnostic. The minimal sign-in and
 * sign-up pages that once shared it now redirect into `/access`. The main column
 * paints its own dark surface rather than inheriting the `prefers-color-scheme`
 * page background.
 */
export function AuthShell({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-[#0a0a0a] px-4 py-16 text-neutral-100">
        <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">{title}</h1>
        {caption ? <p className="mt-2 mb-6 text-sm text-neutral-400">{caption}</p> : <div className="mb-6" />}
        {children}
        </div>
      </main>
    </>
  );
}
