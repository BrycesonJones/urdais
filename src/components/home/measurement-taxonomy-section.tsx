import { MEASUREMENT_DIMENSIONS, MEASUREMENT_DOMAINS } from "@/data/taxonomy";

/**
 * "What Urdais Measures": an editorial index of the seven measurement
 * domains in a 35/65 split, followed by the cross-cutting "Measured across"
 * key. Typography, spacing, and dividers carry the design. Rows are static
 * classification content, not controls, so they have no hover or focus
 * treatment. Fully server-rendered.
 */
export function MeasurementTaxonomySection() {
  return (
    <section
      aria-labelledby="measures-heading"
      className="flex-1 bg-[#0a0a0a] px-4 pb-24 pt-8 text-neutral-50 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-screen-2xl">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,35fr)_minmax(0,65fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8ca4ff]">
              Measurement index
            </p>
            <h2
              id="measures-heading"
              className="mt-3 text-3xl font-semibold uppercase leading-tight tracking-tight md:text-4xl"
            >
              What Urdais Measures
            </h2>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-neutral-400">
              The markets and infrastructure underlying the Information Age.
            </p>
          </div>

          <ol className="divide-y divide-neutral-800 border-y border-neutral-800">
            {MEASUREMENT_DOMAINS.map((item) => (
              <li
                key={item.domain}
                className="grid gap-y-3 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] lg:gap-x-8 lg:py-6"
              >
                <div>
                  <h3 className="text-base font-semibold uppercase tracking-wide text-neutral-50 md:text-lg">
                    {item.domain}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-400">{item.description}</p>
                </div>

                <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-neutral-400 lg:flex-col lg:items-end lg:gap-y-1.5 lg:text-right">
                  {item.examples.map((example, i) => (
                    <li key={example} className="flex items-center gap-x-3">
                      {i > 0 && (
                        <span aria-hidden="true" className="text-neutral-600 lg:hidden">
                          ·
                        </span>
                      )}
                      {example}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>

        {/* Separated from the taxonomy by spacing alone; no rule. */}
        <div className="mt-20 lg:mt-24">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8ca4ff]">
            Measured across
          </h3>
          <ul className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2 font-mono text-xs uppercase tracking-[0.15em] text-neutral-300 md:text-sm">
            {MEASUREMENT_DIMENSIONS.map((dimension, i) => (
              <li key={dimension} className="flex items-baseline gap-x-4">
                {i > 0 && (
                  <span aria-hidden="true" className="text-[#526fe0]">
                    ·
                  </span>
                )}
                {dimension}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
