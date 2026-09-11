import { FlexibleCapacityChart } from "@/components/power-analytics/flexible-capacity-chart";
import { GridBuildoutChart } from "@/components/power-analytics/grid-buildout-chart";
import { InterconnectionQueue } from "@/components/power-analytics/interconnection-queue";
import { PowerDeliveryGapChart } from "@/components/power-analytics/power-delivery-gap-chart";
import { TransmissionHeadroom } from "@/components/power-analytics/transmission-headroom";

const SECTIONS = [
  { id: "delivery", label: "Delivery" },
  { id: "queues", label: "Queues" },
  { id: "headroom", label: "Headroom" },
  { id: "buildout", label: "Buildout" },
  { id: "flexibility", label: "Flexibility" },
] as const;

/**
 * Power Analytics: whether the physical grid can deliver enough
 * electricity, fast enough, to power the Information Age. Five views of one
 * deterministic grid-infrastructure data graph, stacked as full-width
 * sections with anchor navigation. UEPI remains the price of electricity;
 * this page is its delivery counterpart, and it is not an index.
 */
export function PowerAnalyticsPage() {
  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8ca4ff]">Power Analytics</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">Power Analytics</h1>
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              Demo data
            </span>
          </div>
          <p className="mt-2 text-base text-neutral-300 md:text-lg">The infrastructure delivering power to the Information Age.</p>
          <p className="mt-1 text-sm text-neutral-500">Load, interconnection, transmission capacity, grid buildout, and flexibility.</p>
        </header>

        <nav aria-label="Sections" className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex items-center gap-x-6 whitespace-nowrap border-b border-white/10 font-mono text-[11px] uppercase tracking-[0.2em]">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-block border-b border-transparent pb-3 text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-10 flex flex-col gap-14">
          <PowerDeliveryGapChart />
          <InterconnectionQueue />
          <TransmissionHeadroom />
          <GridBuildoutChart />
          <FlexibleCapacityChart />
        </div>
      </div>
    </main>
  );
}
