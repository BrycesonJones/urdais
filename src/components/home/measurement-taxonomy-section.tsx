import { MEASUREMENT_DIMENSIONS, MEASUREMENT_DOMAINS } from "@/data/taxonomy";

/** Faint cobalt square matrix revealed behind the right edge of a hovered row. */
const MATRIX_BACKGROUND =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='3' height='3' fill='%23526fe0' fill-opacity='0.35'/%3E%3C/svg%3E\")";

/**
 * "What Urdais Measures": an editorial index of the seven measurement
 * domains in a 35/65 split, followed by the cross-cutting "Measured across"
 * key. Typography, numbering, and dividers carry the design; rows are
 * informational, not links, so hover is a quiet accent only. Fully
 * server-rendered.
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
                key={item.number}
                className="group relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 py-5 transition-colors hover:border-b-[#526fe0]/40 hover:bg-[#0b1230]/40 lg:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,15rem)] lg:gap-x-6 lg:py-6"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-56 opacity-0 transition-opacity [mask-image:linear-gradient(to_left,black,transparent)] group-hover:opacity-100"
                  style={{ backgroundImage: MATRIX_BACKGROUND, backgroundSize: "10px 10px" }}
                />

                <span className="relative pt-0.5 font-mono text-xs tabular-nums text-neutral-400 transition-colors group-hover:text-[#8ca4ff]">
                  {item.number}
                </span>

                <div className="relative">
                  <h3 className="text-base font-semibold uppercase tracking-wide text-neutral-50 transition-colors group-hover:text-[#b6c7ff] md:text-lg">
                    {item.domain}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-400">{item.description}</p>
                </div>

                <ul className="relative col-start-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-neutral-400 transition-colors group-hover:text-neutral-300 lg:col-start-3 lg:flex-col lg:items-end lg:gap-y-1.5 lg:text-right">
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

        <div className="mt-16 border-t border-neutral-800 pt-8">
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
