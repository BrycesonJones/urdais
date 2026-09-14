import type { ReactNode } from "react";

type SectionHeadingProps = {
  id: string;
  title: string;
  subtitle: string;
  /** Small status chip beside the title. */
  badge?: ReactNode;
  /** Right-aligned controls or notes for the section. */
  aside?: ReactNode;
};

/** Heading row shared by the analytical market sections: title, one-line subtitle, optional controls. */
export function SectionHeading({ id, title, subtitle, badge, aside }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id={id} className="text-xl font-semibold tracking-tight text-neutral-50 md:text-2xl">
            {title}
          </h2>
          {badge}
        </div>
        <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
      </div>
      {aside}
    </div>
  );
}
