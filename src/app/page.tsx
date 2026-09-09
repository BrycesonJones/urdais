import { SITE_NAME, SITE_TAGLINE } from "@/constants/site";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{SITE_NAME}</h1>
      <p className="text-lg text-foreground/70">{SITE_TAGLINE}</p>
    </main>
  );
}
