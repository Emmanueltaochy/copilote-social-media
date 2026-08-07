import { addGearFromPresets, addGearPreset, removeGearPreset } from "../actions";

type Preset = { id: string; label: string };

/**
 * Le matériel habituel de la personne connectée.
 *
 * On part avec à peu près le même sac d'un tournage à l'autre. Le ressaisir
 * ligne par ligne à chaque fiche est le genre de corvée qu'on finit par
 * sauter — et une liste de matériel vide ne bloque plus rien, donc ne sert
 * plus à rien.
 *
 * Les lignes déjà présentes dans le tournage sont montrées cochées et
 * désactivées plutôt que masquées : les faire disparaître laisserait croire
 * qu'on les a oubliées de sa liste.
 */
export function GearPresets({
  shootId,
  presets,
  alreadyOnShoot,
}: {
  shootId: string;
  presets: Preset[];
  alreadyOnShoot: Set<string>;
}) {
  return (
    <div className="border-t border-line px-[14px] py-3">
      <span className="eyebrow text-ink-3">Mon matériel</span>

      {presets.length === 0 ? (
        <p className="mt-2 text-small text-ink-2">
          Votre liste est vide. Ajoutez-y ce que vous emportez d&apos;habitude : elle vous sera
          proposée sur chaque tournage, et n&apos;appartient qu&apos;à vous.
        </p>
      ) : (
        <form action={addGearFromPresets} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="shootId" value={shootId} />

          <div className="flex flex-wrap gap-x-4 gap-y-[6px]">
            {presets.map((p) => {
              const déjà = alreadyOnShoot.has(p.label);
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-[6px] text-small ${
                    déjà ? "text-ink-3" : "text-ink-2"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="presetIds"
                    value={p.id}
                    defaultChecked={déjà}
                    disabled={déjà}
                    className="h-[15px] w-[15px] accent-ink"
                  />
                  <span>{p.label}</span>
                  {déjà ? <span className="text-micro text-ink-3">déjà là</span> : null}
                </label>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
            >
              Ajouter les cochés
            </button>
          </div>
        </form>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={addGearPreset} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="shootId" value={shootId} />
          <input
            name="label"
            required
            placeholder="Ajouter à ma liste : trépied, micro-cravate…"
            className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold"
          />
          <button
            type="submit"
            className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small text-ink-2 hover:border-line-strong hover:text-ink"
          >
            Mémoriser
          </button>
        </form>
      </div>

      {presets.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {presets.map((p) => (
            <form key={p.id} action={removeGearPreset}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="shootId" value={shootId} />
              <button
                type="submit"
                title={`Retirer « ${p.label} » de ma liste`}
                className="cursor-pointer rounded-control border border-line bg-paper px-2 py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
              >
                {p.label} ✕
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}
