import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { orpc } from "../../lib/rpc";

/**
 * The fixed niche taxonomy (`market.niches.taxonomy`), cached by React Query and looked up by key
 * for chips, the picker and recommendation copy (R4's `{{niche}}`). Falls back to the raw key
 * while loading or for a key the taxonomy doesn't (yet) know.
 */
export function useNicheTaxonomy() {
  return useQuery(orpc.market.niches.taxonomy.queryOptions({ input: {}, staleTime: 5 * 60_000 }));
}

/** A `(key) => label` function in the current language, for inline use (recommendation copy). */
export function useNicheLabel(): (key: string) => string {
  const { i18n } = useTranslation();
  const taxonomy = useNicheTaxonomy();
  const es = i18n.language.startsWith("es");
  return (key: string) => {
    const entry = taxonomy.data?.items.find((n) => n.key === key);
    if (!entry) return key;
    return es ? entry.labelEs : entry.labelEn;
  };
}
