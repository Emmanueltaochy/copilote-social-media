"use client";

import { useActionState, useRef } from "react";
import { repondre, type ReplyState } from "./actions";

export function Reply({ hidden, disabled }: { hidden: Record<string, string>; disabled: boolean }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(repondre, {});
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await action(fd);
        ref.current?.reset();
      }}
      className="flex flex-col gap-2 border-t border-line p-4"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <textarea
        name="text"
        rows={3}
        disabled={disabled}
        placeholder={disabled ? "Réponses désactivées en préversion" : "Votre réponse…"}
        className="w-full resize-y rounded-[16px] border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-gold disabled:opacity-60"
      />
      <div className="flex items-center gap-3">
        {state.error ? <span className="text-small text-alert">{state.error}</span> : null}
        {state.ok ? <span className="text-small text-ok">{state.ok}</span> : null}
        <button
          type="submit"
          disabled={pending || disabled}
          className="ml-auto cursor-pointer rounded-full lg:mr-14 border-none bg-night px-4 py-2 text-base font-medium text-white hover:opacity-85 disabled:opacity-50"
        >
          {pending ? "Envoi…" : "Répondre"}
        </button>
      </div>
    </form>
  );
}
