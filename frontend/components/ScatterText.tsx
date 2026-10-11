"use client";

import { Fragment } from "react";

/** Headline whose letters scatter away from the mascot and spring back. */
export default function ScatterText({
  text,
  className = "",
  id,
}: {
  text: string;
  className?: string;
  id: string;
}) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, wi) => (
        <Fragment key={wi}>
          <span className="inline-block whitespace-nowrap">
            {[...w].map((ch, ci) => (
              <span
                key={ci}
                data-interactive="char"
                data-interactive-id={`${id}-char`}
                data-kind="char"
                className="scatter-char inline-block"
              >
                {ch}
              </span>
            ))}
          </span>
          {wi < words.length - 1 ? " " : ""}
        </Fragment>
      ))}
    </span>
  );
}
