import { LiquidChrome } from "@/components/ui/liquid-chrome";

/**
 * Full-width Liquid Chrome band shown directly beneath the site header.
 *
 * Decorative only for now: no copy, controls, or framing. Heights are set
 * per breakpoint in CSS so the effect stays substantial on every device.
 */
export function LiquidChromeSection() {
  return (
    <div aria-hidden="true" className="h-[300px] w-full md:h-[380px] lg:h-[480px]">
      <LiquidChrome baseColor={[0.1, 0.1, 0.1]} speed={1} amplitude={0.6} interactive />
    </div>
  );
}
