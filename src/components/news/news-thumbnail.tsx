"use client";

import Image from "next/image";
import { useId, useState } from "react";

type NewsThumbnailProps = {
  /** Provider thumbnail URL; null renders the fallback surface. */
  imageUrl: string | null;
  /** Layout hint so the browser requests an appropriately sized image. */
  sizes: string;
};

/**
 * 16:9 editorial thumbnail. Renders the provider image lazily; when there
 * is no URL or the image fails to load, shows a quiet Urdais fallback: a
 * navy surface with a faint cobalt square matrix. Purely illustrative, so
 * it is hidden from assistive technology; the headline carries the meaning.
 */
export function NewsThumbnail({ imageUrl, sizes }: NewsThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const patternId = `news-matrix-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const showImage = imageUrl !== null && !failed;

  return (
    <div
      aria-hidden="true"
      className="relative aspect-video w-full overflow-hidden rounded-md bg-[#0b1230]"
    >
      {showImage ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes={sizes}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <svg className="absolute inset-0 h-full w-full" role="presentation">
          <defs>
            <pattern id={patternId} patternUnits="userSpaceOnUse" width={10} height={10}>
              <rect width={3} height={3} fill="#526fe0" />
            </pattern>
            <linearGradient id={`${patternId}-fade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity={0.45} />
              <stop offset="1" stopColor="#fff" stopOpacity={0.08} />
            </linearGradient>
            <mask id={`${patternId}-mask`}>
              <rect width="100%" height="100%" fill={`url(#${patternId}-fade)`} />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${patternId})`} mask={`url(#${patternId}-mask)`} />
        </svg>
      )}
    </div>
  );
}
