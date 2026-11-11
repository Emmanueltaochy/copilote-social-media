"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Le cahier des charges, une section à la fois.
 *
 * Une longue page de questions décourage avant même de commencer. Ici, le
 * client voit où il en est (« Étape 2 sur 5 »), ce qui reste, et avance
 * section par section. Les réponses s'enregistrent toujours en quittant
 * chaque champ : changer d'étape ne perd rien.
 */
export function EtapesBrief({
  etapes,
  fin,
  accent,
  briefId,
}: {
  etapes: { titre: string; total: number; remplis: number; contenu: ReactNode }[];
  fin: ReactNode;
  accent: string;
  briefId: string;
}) {
  const cle = `brief-etape:${briefId}`;
  // Reprend là où le client s'était arrêté : la première section incomplète.
  const premiere = Math.max(0, etapes.findIndex((e) => e.remplis < e.total));
  const [i, setI] = useState(premiere);
  const haut = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(cle));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isInteger(v) && v >= 0 && v < etapes.length) setI(v);
    } catch {}
  }, [cle, etapes.length]);

  const aller = (n: number) => {
    setI(n);
    try {
      localStorage.setItem(cle, String(n));
    } catch {}
    haut.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const e = etapes[i];
  const derniere = i === etapes.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <div ref={haut} className="scroll-mt-4 rounded-card border border-line bg-paper p-4 shadow-soft">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-lead font-semibold">
            Étape {i + 1} sur {etapes.length} : {e.titre}
          </span>
          <span className="text-small text-ink-3">
            {e.remplis}/{e.total} réponse{e.total > 1 ? "s" : ""} dans cette étape
          </span>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {etapes.map((x, k) => (
            <span
              key={k}
              className="h-[6px] flex-1 rounded-full"
              style={{ background: k < i || x.remplis >= x.total ? accent : k === i ? `${accent}99` : "var(--c-mute, #e6e8eb)" }}
            />
          ))}
        </div>
        <ol className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
          {etapes.map((x, k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => aller(k)}
                className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-[5px] text-small"
                style={
                  k === i
                    ? { borderColor: accent, background: accent, color: "#fff" }
                    : { borderColor: "var(--c-line, #dde1e5)", background: "transparent", color: "inherit" }
                }
              >
                <span className="font-semibold">{x.remplis >= x.total ? "✓" : k + 1}</span> {x.titre}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {e.contenu}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => aller(i - 1)}
          disabled={i === 0}
          className="cursor-pointer rounded-full border border-line bg-paper px-5 py-[10px] text-base font-medium text-ink disabled:invisible"
        >
          ← Précédent
        </button>
        {!derniere ? (
          <button
            type="button"
            onClick={() => aller(i + 1)}
            className="cursor-pointer rounded-full border-none px-6 py-[10px] text-base font-semibold text-white"
            style={{ background: accent }}
          >
            Étape suivante : {etapes[i + 1].titre} →
          </button>
        ) : null}
      </div>

      {derniere ? fin : null}
    </div>
  );
}
