import type { ReactNode } from "react";

type SectionHeadingProps = {
  id: string;
  title: string;
  subtitle: string;
  /** Right-aligned controls or notes for the section. */
  aside?: ReactNode;
};

/** Heading row shared by the Model Economics sections: title, one-line subtitle, optional controls. */
export function SectionHeading({ id, title, subtitle, aside }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id={id} className="text-xl font-semibold tracking-tight text-neutral-50 md:text-2xl">
          {title}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
      </div>
      {aside}
    </div>
  );
}
