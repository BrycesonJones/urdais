import { AccessRequiredPanel } from "@/components/premium/access-required-panel";
import type { AccessDenialReason } from "@/lib/access/entitlement";

/**
 * The locked page: a premium product's structure, with the gate over it.
 *
 * ## Everything behind the gate is synthetic
 *
 * The skeleton below is generated from nothing but array lengths. There is no
 * snapshot of a real price, no cached API response, no historical series and no
 * coordinate anywhere in this file, and the component takes **no data props at
 * all** — so it is not possible to pass it premium data by mistake. That is the
 * point of the shape: the locked page is rendered *instead of* loading the
 * product, and a reader who is refused receives the skeleton and the gate and
 * nothing else.
 *
 * A blur over real data would be the other implementation, and it would ship the
 * data. `blur-sm` here is applied to placeholder bars, which is decoration; the
 * access decision happened on the server before this component was chosen.
 *
 * ## Why show a skeleton at all
 *
 * So a visitor can tell what product sits behind the subscription. A bare panel on
 * an empty page communicates "error"; a recognisable page shape communicates
 * "this exists and is not yours yet". The bars are deliberately abstract — bars,
 * not numbers — because a plausible-looking fake figure is worse than an obvious
 * placeholder: someone will screenshot it.
 */
export type PremiumLockedPageProps = {
  /** The product's real title, which is public information. */
  title: string;
  /** The product's real one-line description, also public. */
  description: string;
  reason: Exclude<AccessDenialReason, "unknown_product">;
  returnTo: string;
};

/** Bar widths, in Tailwind fractions. Fixed so nothing here is random per render. */
const SKELETON_ROWS = ["w-5/6", "w-2/3", "w-3/4", "w-1/2", "w-4/6"] as const;
const SKELETON_TILES = 4;

export function PremiumLockedPage({ title, description, reason, returnTo }: PremiumLockedPageProps) {
  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        {/*
          The title and description stay legible and outside the obscured region.
          Both are public marketing copy, and a locked page that will not even say
          what it is cannot be evaluated by the person deciding whether to pay.
        */}
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">{description}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-neutral-400">
            {/* The premium state in words, so it does not depend on colour or an icon. */}
            Premium product
          </p>
        </header>

        {/*
          `relative` so the gate can sit over the skeleton. The skeleton is
          `aria-hidden` and `inert`: it is decoration with nothing to read and
          nothing to focus, so a keyboard reaches the gate's own controls
          immediately rather than tabbing through placeholder scenery.
        */}
        <div className="relative mt-8">
          <div aria-hidden="true" inert className="select-none blur-sm" >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: SKELETON_TILES }, (_, index) => (
                <div key={index} className="rounded-lg border border-white/10 bg-[#111111] p-4">
                  <div className="h-2.5 w-1/2 rounded bg-white/10" />
                  <div className="mt-3 h-6 w-2/3 rounded bg-white/[0.07]" />
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-[#111111] p-4">
              <div className="h-2.5 w-1/4 rounded bg-white/10" />
              {/* A chart frame, with no series in it. */}
              <div className="mt-4 h-48 rounded bg-gradient-to-t from-white/[0.06] to-transparent" />
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-[#111111] p-4">
              <div className="h-2.5 w-1/5 rounded bg-white/10" />
              <div className="mt-4 flex flex-col gap-2.5">
                {SKELETON_ROWS.map((width) => (
                  <div key={width} className={`h-3 rounded bg-white/[0.07] ${width}`} />
                ))}
              </div>
            </div>
          </div>

          {/*
            Overlaid rather than replacing the skeleton, and centred within the
            first screenful so the gate is visible without scrolling on a short
            viewport. `pointer-events-none` on the positioning layer with them
            restored on the panel keeps the obscured area from swallowing clicks.
          */}
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-10 sm:items-center sm:pt-0">
            <div className="pointer-events-auto">
              <AccessRequiredPanel reason={reason} surface="page" returnTo={returnTo} headingLevel={2} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
