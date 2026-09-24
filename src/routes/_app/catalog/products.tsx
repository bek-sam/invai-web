import { CHANNELS, type Design, PLACEMENTS, type Placement, type Product } from "@invai/contracts";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Money,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ImageIcon, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect, Page } from "../../../components/page";
import { DesignPicker } from "../../../components/pickers";
import { ErrorState } from "../../../components/states";
import { useDebounced } from "../../../hooks/use-debounced";
import { centsToDollarsInput, parseDollarsToCents } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";
import { openInNewTab } from "../../../lib/upload";

export const Route = createFileRoute("/_app/catalog/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const products = useInfiniteQuery(
    orpc.products.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ search: q || undefined, cursor, limit: 200 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => products.data?.pages.flatMap((p) => p.items) ?? [], [products.data]);
  const mockup = useMutation(
    orpc.products.mockup.mutationOptions({ onSuccess: (r) => openInNewTab(r.url) }),
  );
  const columns: DataTableColumn<Product>[] = [
    {
      accessorKey: "name",
      header: t("products.name", "Product"),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    { accessorKey: "designName", header: t("orders.design", "Design") },
    {
      id: "blank",
      header: t("orders.blank", "Blank"),
      accessorFn: (r) => `${r.brand} ${r.styleCode}`,
    },
    {
      id: "variants",
      header: t("products.variants", "Colors × sizes"),
      cell: ({ row }) =>
        `${row.original.allowedColorCodes.length} × ${row.original.allowedSizeCodes.length}`,
    },
    {
      id: "placements",
      header: t("designs.placements", "Placements"),
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          {row.original.defaultPlacements.map((p) => (
            <Badge key={p} variant="secondary">
              {t(`placement.${p}`, p)}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      id: "prices",
      header: t("products.prices", "Prices"),
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.prices.map((p) => (
            <span key={p.channel} className="mr-2 whitespace-nowrap">
              {t(`channel.${p.channel}`, p.channel)} <Money cents={p.price} />
            </span>
          ))}
        </span>
      ),
    },
    {
      id: "mockup",
      header: "",
      cell: ({ row }) =>
        can("catalog.manage") && row.original.allowedColorCodes[0] ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              mockup.mutate({
                id: row.original.id,
                colorCode: row.original.allowedColorCodes[0] as string,
                placement: "front",
              });
            }}
            disabled={mockup.isPending}
          >
            <ImageIcon />
            {t("products.mockup", "Mockup")}
          </Button>
        ) : null,
    },
  ];
  return (
    <Page
      title={t("nav.products")}
      description={t(
        "products.subtitle",
        "A product is a design on a blank style, with allowed colors, sizes and prices.",
      )}
      actions={
        can("catalog.manage") && (
          <Button onClick={() => setEditing("new")}>
            <Plus />
            {t("products.new", "New product")}
          </Button>
        )
      }
    >
      <div className="relative mb-3 max-w-sm">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("products.search", "Search products")}
          className="pl-8"
        />
      </div>
      {products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<Product, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={products.isPending}
          hasMore={!!products.hasNextPage}
          isLoadingMore={products.isFetchingNextPage}
          onLoadMore={() => void products.fetchNextPage()}
          onRowClick={can("catalog.manage") ? (r) => setEditing(r) : undefined}
          emptyTitle={t("products.empty", "No products yet")}
          maxHeight="calc(100dvh - 15rem)"
        />
      )}
      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  );
}

function ProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const facets = useQuery(orpc.blanks.facets.queryOptions({ input: {} }));
  const existingDesign = useQuery(
    orpc.designs.get.queryOptions({ input: { id: product?.designId ?? "" }, enabled: !!product }),
  );
  const [design, setDesign] = useState<Design | null>(null);
  const currentDesign = design ?? existingDesign.data ?? null;
  const [styleKey, setStyleKey] = useState(product ? `${product.brand}|${product.styleCode}` : "");
  const [name, setName] = useState(product?.name ?? "");
  const [colors, setColors] = useState<Set<string>>(new Set(product?.allowedColorCodes ?? []));
  const [sizes, setSizes] = useState<Set<string>>(new Set(product?.allowedSizeCodes ?? []));
  const [placements, setPlacements] = useState<Set<Placement>>(
    new Set(product?.defaultPlacements ?? ["front"]),
  );
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(
      (product?.prices ?? []).map((p) => [p.channel, centsToDollarsInput(p.price)]),
    ),
  );
  const [brand, styleCode] = styleKey.split("|");
  const variants = useQuery(
    orpc.blanks.list.queryOptions({ input: { styleCode, limit: 500 }, enabled: !!styleCode }),
  );
  const colorOptions = [
    ...new Map((variants.data?.items ?? []).map((v) => [v.colorCode, v])).values(),
  ];
  const sizeOptions = [...new Set((variants.data?.items ?? []).map((v) => v.sizeCode))];
  const toggle = <T,>(set: Set<T>, v: T, setter: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
  };
  const onDone = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.products.key() });
    toast.success(t("products.saved", "Product saved"));
    onClose();
  };
  const create = useMutation(orpc.products.create.mutationOptions({ onSuccess: onDone }));
  const update = useMutation(orpc.products.update.mutationOptions({ onSuccess: onDone }));
  const archive = useMutation(orpc.products.archive.mutationOptions({ onSuccess: onDone }));
  const priceList = CHANNELS.flatMap((c) => {
    const cents = prices[c] ? parseDollarsToCents(prices[c] as string) : null;
    return cents !== null ? [{ channel: c, price: cents }] : [];
  });
  const valid =
    currentDesign &&
    brand &&
    styleCode &&
    name.trim() &&
    colors.size > 0 &&
    sizes.size > 0 &&
    placements.size > 0;
  const input = () => ({
    designId: currentDesign?.id ?? "",
    brand: brand ?? "",
    styleCode: styleCode ?? "",
    name: name.trim(),
    allowedColorCodes: [...colors],
    allowedSizeCodes: [...sizes],
    defaultPlacements: [...placements],
    prices: priceList,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {product ? t("products.edit", "Edit product") : t("products.new", "New product")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("orders.design", "Design")}>
            <DesignPicker
              value={currentDesign}
              onChange={(d) => {
                setDesign(d);
                if (!name) setName(d.name);
              }}
            />
          </Field>
          <Field label={t("blanks.style", "Style")} htmlFor="p-style">
            <NativeSelect
              id="p-style"
              value={styleKey}
              onChange={(e) => {
                setStyleKey(e.target.value);
                setColors(new Set());
                setSizes(new Set());
              }}
            >
              <option value="">{t("pickers.style", "Style")}</option>
              {facets.data?.styles.map((s) => (
                <option key={`${s.brand}|${s.styleCode}`} value={`${s.brand}|${s.styleCode}`}>
                  {s.brand} {s.style}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("products.name", "Product")} htmlFor="p-name" className="sm:col-span-2">
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        {styleCode && (
          <>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">{t("blanks.color", "Color")}</legend>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((c) => (
                  <label
                    key={c.colorCode}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
                  >
                    <Checkbox
                      checked={colors.has(c.colorCode)}
                      onCheckedChange={() => toggle(colors, c.colorCode, setColors)}
                    />
                    <span
                      className="size-3 rounded-full border border-border"
                      style={{ background: c.colorHex ?? "transparent" }}
                    />
                    {c.color}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">{t("blanks.size", "Size")}</legend>
              <div className="flex flex-wrap gap-2">
                {sizeOptions.map((s) => (
                  <label
                    key={s}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
                  >
                    <Checkbox
                      checked={sizes.has(s)}
                      onCheckedChange={() => toggle(sizes, s, setSizes)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            {t("designs.placements", "Placements")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {PLACEMENTS.map((p) => (
              <label
                key={p}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
              >
                <Checkbox
                  checked={placements.has(p)}
                  onCheckedChange={() => toggle(placements, p, setPlacements)}
                />
                {t(`placement.${p}`, p.replace(/_/g, " "))}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t("products.prices", "Prices")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CHANNELS.filter((c) => c !== "csv").map((c) => (
              <Field key={c} label={t(`channel.${c}`, c)} htmlFor={`price-${c}`}>
                <Input
                  id={`price-${c}`}
                  inputMode="decimal"
                  placeholder="$"
                  value={prices[c] ?? ""}
                  onChange={(e) => setPrices({ ...prices, [c]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </fieldset>
        <DialogFooter className="sm:justify-between">
          {product ? (
            <Button
              variant="ghost"
              className="text-danger"
              onClick={() => archive.mutate({ id: product.id })}
            >
              {t("designs.archive", "Archive")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("action.cancel")}
            </Button>
            <Button
              disabled={!valid || create.isPending || update.isPending}
              onClick={() =>
                product ? update.mutate({ id: product.id, ...input() }) : create.mutate(input())
              }
            >
              {(create.isPending || update.isPending) && <Loader2 className="animate-spin" />}
              {t("action.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
