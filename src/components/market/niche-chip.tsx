import type { Id } from "@invai/contracts";
import { Badge, Button } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { orpc } from "../../lib/rpc";
import { ErrorState } from "../states";
import { NichePicker } from "./niche-picker";
import { useNicheTaxonomy } from "./use-niche-taxonomy";

/**
 * The design page's niche chip (spec flow step 5, AC32): 0/1/2 niches. "Change" is hidden for a
 * viewer without `market.niches.manage` (a designer keeps it; a presser never reaches this page).
 */
export function NicheChip({ designId, canManage }: { designId: Id; canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const es = i18n.language.startsWith("es");
  const [pickerOpen, setPickerOpen] = useState(false);
  const niches = useQuery(orpc.market.niches.get.queryOptions({ input: { designId } }));
  const taxonomy = useNicheTaxonomy();

  if (niches.isPending) {
    return <Badge variant="outline">{t("common.loading", "Loading…")}</Badge>;
  }
  if (niches.isError) {
    return <ErrorState error={niches.error} compact />;
  }

  const label = (key: string) => {
    const entry = taxonomy.data?.items.find((n) => n.key === key);
    if (!entry) return key;
    return es ? entry.labelEs : entry.labelEn;
  };

  const keys = niches.data.niches;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {keys.length === 0 ? (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tag className="size-4" aria-hidden />
          {t("market.niche.none", "No niche yet. Pick one to get market signals.")}
        </span>
      ) : (
        // One text node, matching the spec copy exactly ("Niche: Teacher" / "Niches: Teacher,
        // Retirement") — QA's e2e checks this literal string, not per-niche visual chips.
        <Badge variant="secondary" className="text-sm">
          {`${
            keys.length === 1
              ? t("market.niche.label", "Niche")
              : t("market.niche.labelPlural", "Niches")
          }: ${keys.map(label).join(", ")}`}
        </Badge>
      )}
      {canManage && (
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
          {keys.length === 0
            ? t("market.niche.pick", "Pick a niche")
            : t("market.niche.change", "Change")}
        </Button>
      )}
      {canManage && (
        <NichePicker
          designId={designId}
          current={keys}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        />
      )}
    </div>
  );
}
