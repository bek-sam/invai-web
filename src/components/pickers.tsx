import type { BlankVariant, Design } from "@invai/contracts";
import { cn, Input, Popover, PopoverContent, PopoverTrigger } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebounced } from "../hooks/use-debounced";
import { orpc } from "../lib/rpc";
import { NativeSelect } from "./page";
import { SignedImage } from "./signed-image";

/** Searchable design picker with thumbnails. */
export function DesignPicker({
  value,
  onChange,
  className,
}: {
  value: Design | null;
  onChange: (d: Design) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 200);
  const designs = useQuery(
    orpc.designs.list.queryOptions({ input: { search: q || undefined, limit: 30 }, enabled: open }),
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm",
            className,
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value
              ? `${value.code} · ${value.name}`
              : t("pickers.chooseDesign", "Choose a design…")}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,26rem)] p-2" align="start">
        <Input
          autoFocus
          placeholder={t("pickers.searchDesigns", "Search by code or name")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {designs.isPending ? (
            <Loader2 className="mx-auto my-6 animate-spin text-muted-foreground" />
          ) : designs.isError ? (
            <p className="p-3 text-sm text-danger">{t("common.error")}</p>
          ) : designs.data.items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("common.noResults")}</p>
          ) : (
            designs.data.items.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onChange(d);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <SignedImage
                  fileKey={d.placements[0]?.previewKey ?? null}
                  alt=""
                  className="size-9 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">{d.code}</span>
                </span>
                {value?.id === d.id && <Check className="size-4" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Brand/style → color → size selects that resolve to one blank variant. */
export function BlankPicker({
  value,
  onChange,
}: {
  value: BlankVariant | null;
  onChange: (b: BlankVariant | null) => void;
}) {
  const { t } = useTranslation();
  const facets = useQuery(orpc.blanks.facets.queryOptions({ input: {}, staleTime: 5 * 60_000 }));
  const [styleCode, setStyleCode] = useState(value?.styleCode ?? "");
  const [colorCode, setColorCode] = useState(value?.colorCode ?? "");
  const [sizeCode, setSizeCode] = useState(value?.sizeCode ?? "");
  const variants = useQuery(
    orpc.blanks.list.queryOptions({
      input: { styleCode, limit: 500 },
      enabled: !!styleCode,
      staleTime: 60_000,
    }),
  );
  const items = variants.data?.items ?? [];
  const colors = [...new Map(items.map((v) => [v.colorCode, v])).values()];
  const sizes = [...new Set(items.filter((v) => v.colorCode === colorCode).map((v) => v.sizeCode))];

  function pick(nextStyle: string, nextColor: string, nextSize: string) {
    setStyleCode(nextStyle);
    setColorCode(nextColor);
    setSizeCode(nextSize);
    const match = items.find(
      (v) => v.styleCode === nextStyle && v.colorCode === nextColor && v.sizeCode === nextSize,
    );
    onChange(match ?? null);
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <NativeSelect
        aria-label={t("pickers.style", "Style")}
        value={styleCode}
        onChange={(e) => pick(e.target.value, "", "")}
        disabled={facets.isPending}
      >
        <option value="">{t("pickers.style", "Style")}</option>
        {facets.data?.styles.map((s) => (
          <option key={`${s.brand}-${s.styleCode}`} value={s.styleCode}>
            {s.brand} {s.style}
            {s.styleName ? ` · ${s.styleName}` : ""}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t("pickers.color", "Color")}
        value={colorCode}
        onChange={(e) => pick(styleCode, e.target.value, "")}
        disabled={!styleCode || variants.isPending}
      >
        <option value="">{t("pickers.color", "Color")}</option>
        {colors.map((c) => (
          <option key={c.colorCode} value={c.colorCode}>
            {c.color}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t("pickers.size", "Size")}
        value={sizeCode}
        onChange={(e) => pick(styleCode, colorCode, e.target.value)}
        disabled={!colorCode}
      >
        <option value="">{t("pickers.size", "Size")}</option>
        {sizes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function blankLabel(
  b: { brand: string; style: string; color: string; size: string } | null | undefined,
): string {
  if (!b) return "—";
  return `${b.brand} ${b.style} · ${b.color} · ${b.size}`;
}
