import { ChromeRevealText } from "@/components/ui/chrome-reveal-text";
import { LiquidChrome } from "@/components/ui/liquid-chrome";
import { SITE_NAME, SITE_TAGLINE } from "@/constants/site";

/**
 * The homepage hero: static site copy centered over the animated Liquid
 * Chrome band that sits directly beneath the site header.
 *
 * The canvas is decorative (hidden from assistive technology inside
 * LiquidChrome); the heading and tagline are real content. Heights are set
 * per breakpoint in CSS so the effect stays substantial on every device.
 *
 * On load the title and tagline are rendered out of the chrome material
 * (ChromeRevealText, in step with the Information Markets heading below).
 * The wrapper's text-shadow is mirrored as --reveal-shadow so the pass
 * keeps the same shadow while it paints the text through its background.
 */
export function LiquidChromeSection() {
  return (
    <section className="relative h-[320px] w-full md:h-[420px] lg:h-[520px]">
      <LiquidChrome baseColor={[0.1, 0.1, 0.1]} speed={1} amplitude={0.6} interactive />

      {/* pointer-events-none keeps pointer distortion reaching the canvas. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center [--reveal-shadow:drop-shadow(0_1px_12px_rgba(0,0,0,0.5))] [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-50">
          <ChromeRevealText>{SITE_NAME}</ChromeRevealText>
        </h1>
        <p className="text-lg text-neutral-300">
          <ChromeRevealText>{SITE_TAGLINE}</ChromeRevealText>
        </p>
      </div>
    </section>
  );
}
