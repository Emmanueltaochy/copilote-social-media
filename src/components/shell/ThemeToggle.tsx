"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

type Choice = "light" | "dark" | "system";

const KEY = "pilot-theme";

function apply(choice: Choice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function read(): Choice {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function save(choice: Choice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* navigation privée : le choix vaut pour la page en cours */
  }
}

/**
 * Le choix du thème : clair, sombre (noir et or) ou celui du système.
 * Le script en ligne de la racine l'applique avant l'affichage ; ce composant
 * ne sert qu'à le changer.
 */
export function useTheme() {
  // Ce composant ne s'affiche que dans des menus ouverts par un clic : il est
  // donc toujours rendu dans le navigateur, où le choix enregistré se lit.
  const [choice, setChoice] = useState<Choice>(() => (typeof window === "undefined" ? "system" : read()));
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => read() === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return {
    choice,
    set(next: Choice) {
      setChoice(next);
      save(next);
      apply(next);
    },
  };
}

/** Bouton rond qui alterne clair ↔ sombre (pour le rail). */
export function ThemeButton({ className }: { className?: string }) {
  const { set } = useTheme();
  return (
    <button
      type="button"
      title="Changer de thème"
      aria-label="Changer de thème"
      onClick={() => {
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        set(dark ? "light" : "dark");
      }}
      className={className}
    >
      <Icon name="moon" className="theme-icon-dark" />
    </button>
  );
}

/** Les trois choix côte à côte (menu du compte). */
export function ThemeChoices() {
  const { choice, set } = useTheme();
  const opts: { v: Choice; label: string; icon: "sun" | "moon" | "monitor" }[] = [
    { v: "light", label: "Clair", icon: "sun" },
    { v: "dark", label: "Sombre", icon: "moon" },
    { v: "system", label: "Auto", icon: "monitor" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-control bg-mute p-1">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => set(o.v)}
          aria-pressed={choice === o.v}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-[9px] border-none px-2 py-2 text-micro font-medium",
            choice === o.v ? "bg-paper text-ink shadow-soft" : "bg-transparent text-ink-2 hover:text-ink",
          )}
        >
          <Icon name={o.icon} size={16} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
