import type { NicheKey, NicheTaxonomyEntry } from "@invai/contracts";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  toast,
} from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../lib/errors";
import { orpc } from "../../lib/rpc";
import { useNicheTaxonomy } from "./use-niche-taxonomy";

function groupByFamily(items: NicheTaxonomyEntry[]): Map<string, NicheTaxonomyEntry[]> {
  const groups = new Map<string, NicheTaxonomyEntry[]>();
  for (const item of items) {
    const arr = groups.get(item.family) ?? [];
    arr.push(item);
    groups.set(item.family, arr);
  }
  return groups;
}

/**
 * One searchable picker (spec flow step 5, AC32) that edits a design's niches (0..2) at once.
 * A third pick is refused (the option is disabled once 2 are already chosen, matching QA's
 * `e2e/market.spec.ts`); clearing both niches returns the design to `unclassified`.
 */
export function NichePicker({
  designId,
  current,
  open,
  onOpenChange,
}: {
  designId: string;
  current: NicheKey[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const es = i18n.language.startsWith("es");
  const queryClient = useQueryClient();
  const taxonomy = useNicheTaxonomy();
  const [selected, setSelected] = useState<NicheKey[]>(current);

  useEffect(() => {
    if (open) setSelected(current);
  }, [open, current]);

  const save = useMutation(
    orpc.market.niches.set.mutationOptions({
      onSuccess: () => {
        toast.success(t("market.niche.saved", "Niches saved"));
        void queryClient.invalidateQueries({ queryKey: orpc.market.niches.key() });
        onOpenChange(false);
      },
      onError: (e) => {
        toast.error(t("market.niche.saveFailed", "Couldn't save"), {
          description: errorMessage(e),
        });
      },
    }),
  );

  function toggle(key: NicheKey) {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 2) return prev; // refused: the option is disabled, so this shouldn't fire
      return [...prev, key];
    });
  }

  const groups = groupByFamily(taxonomy.data?.items ?? []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("market.niche.pickerTitle", "Pick niches")}
      description={t("market.niche.pickerHint", "Choose up to 2")}
    >
      <CommandInput placeholder={t("market.niche.search", "Search niches…")} />
      <CommandList>
        <CommandEmpty>{t("common.noResults", "No results")}</CommandEmpty>
        {[...groups.entries()].map(([family, items]) => (
          <CommandGroup key={family} heading={family}>
            {items.map((n) => {
              const label = es ? n.labelEs : n.labelEn;
              const isSelected = selected.includes(n.key);
              const disabled = !isSelected && selected.length >= 2;
              return (
                <CommandItem
                  key={n.key}
                  value={`${label} ${n.key}`}
                  disabled={disabled}
                  onSelect={() => toggle(n.key)}
                  className={disabled ? "opacity-50" : undefined}
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}
                    aria-hidden
                  >
                    {isSelected && <Check className="size-3" />}
                  </span>
                  {label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center justify-between gap-2 border-t border-border p-2">
        <p className="px-1 text-xs text-muted-foreground">{selected.length}/2</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => onOpenChange(false)}
          >
            {t("action.cancel", "Cancel")}
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={save.isPending}
            onClick={() => save.mutate({ designId, niches: selected })}
          >
            {t("action.save", "Save")}
          </button>
        </div>
      </div>
    </CommandDialog>
  );
}
