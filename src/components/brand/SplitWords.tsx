import { Fragment, type CSSProperties } from "react";

/**
 * Titolo che compare parola per parola: ogni parola sale da dietro una maschera, con un piccolo scarto.
 * Solo CSS (nessuno script): il testo intero resta leggibile per screen reader e motori di ricerca.
 */
export function SplitWords({ text, startAt = 0 }: { text: string; startAt?: number }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(" ").map((w, i) => (
          <Fragment key={`${w}-${i}`}>
            {i > 0 ? " " : null}
            <span className="word-mask">
              <span className="word-rise" style={{ "--w": startAt + i } as CSSProperties}>
                {w}
              </span>
            </span>
          </Fragment>
        ))}
      </span>
    </>
  );
}
