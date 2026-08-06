import { Card, CardHead } from "@/components/ui/Card";
import { CheckBox } from "@/components/ui/primitives";

/**
 * Une liste cochable du tournage : shotlist, matériel, autorisations, livrables.
 *
 * Les quatre listes se comportent pareil et sont utilisées dans les mêmes
 * conditions — souvent debout, sur un téléphone, entre deux plans. Une seule
 * mécanique donc, avec des cibles de clic assez larges pour être touchées sans
 * viser, et l'ajout toujours au même endroit : en bas.
 */
export function CheckList({
  title,
  meta,
  items,
  shootId,
  toggleAction,
  removeAction,
  addAction,
  addFields,
  addLabel,
  hint,
  empty,
}: {
  title: string;
  meta?: string;
  items: {
    id: string;
    label: string;
    aside?: string;
    done: boolean;
    /** Ce qui n'est pas coché n'est pas toujours un problème : un plan à faire
     *  n'est pas une autorisation manquante. */
    pendingIsBlocking?: boolean;
  }[];
  shootId: string;
  toggleAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
  addAction: (formData: FormData) => Promise<void>;
  addFields: { name: string; placeholder: string; type?: string; required?: boolean; width?: string }[];
  addLabel: string;
  hint?: string;
  empty: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHead title={title} meta={meta} />

      {items.length === 0 ? (
        <p className="px-[14px] py-4 text-base text-ink-2">{empty}</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 border-b border-line px-[14px] py-2">
            <form action={toggleAction} className="flex flex-none">
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="shootId" value={shootId} />
              <button
                type="submit"
                className="flex cursor-pointer items-center border-none bg-transparent p-0"
                aria-label={item.done ? `Décocher ${item.label}` : `Cocher ${item.label}`}
              >
                <CheckBox checked={item.done} />
              </button>
            </form>

            <span
              className={`clip flex-1 text-base ${item.done ? "text-ink-3 line-through" : "text-ink"}`}
            >
              {item.label}
            </span>

            {item.aside ? (
              <span
                className={`flex-none text-small ${
                  item.done ? "text-ok" : item.pendingIsBlocking ? "text-warn" : "text-ink-3"
                }`}
              >
                {item.aside}
              </span>
            ) : null}

            <form action={removeAction} className="flex-none">
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="shootId" value={shootId} />
              <button
                type="submit"
                title="Retirer"
                className="cursor-pointer rounded-control border border-line bg-paper px-[6px] py-[2px] text-micro text-ink-3 hover:border-alert hover:text-alert"
              >
                ✕
              </button>
            </form>
          </div>
        ))
      )}

      <form action={addAction} className="flex flex-wrap items-center gap-2 px-[14px] py-3">
        <input type="hidden" name="shootId" value={shootId} />
        {addFields.map((f) => (
          <input
            key={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required={f.required}
            placeholder={f.placeholder}
            className={`${f.width ?? "min-w-0 flex-1"} rounded-control border border-line bg-paper px-2 py-[6px] text-small outline-none focus:border-gold`}
          />
        ))}
        <button
          type="submit"
          className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink"
        >
          {addLabel}
        </button>
      </form>

      {hint ? <p className="px-[14px] pb-3 text-small text-ink-3">{hint}</p> : null}
    </Card>
  );
}
