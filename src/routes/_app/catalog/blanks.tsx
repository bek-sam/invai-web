import { type BlankVariant, SUPPLIERS } from "@invai/contracts";
import {
  Button,
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
import { FileUp, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect, Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import {
  CsvImportDialog,
  ReportStats,
  RowErrors,
} from "../../../features/catalog/csv-import-dialog";
import { useDebounced } from "../../../hooks/use-debounced";
import { parseDollarsToCents } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { client, orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/catalog/blanks")({
  component: BlanksPage,
});

function BlanksPage() {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [brand, setBrand] = useState("");
  const [supplier, setSupplier] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<BlankVariant | "new" | null>(null);
  const q = useDebounced(text.trim(), 250);
  const facets = useQuery(orpc.blanks.facets.queryOptions({ input: {}, retry: false }));
  const blanks = useInfiniteQuery(
    orpc.blanks.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        search: q || undefined,
        brand: brand || undefined,
        supplier: (supplier || undefined) as never,
        cursor,
        limit: 200,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => blanks.data?.pages.flatMap((p) => p.items) ?? [], [blanks.data]);
  const columns: DataTableColumn<BlankVariant>[] = [
    {
      id: "style",
      header: t("blanks.style", "Style"),
      accessorFn: (r) => `${r.brand} ${r.style}`,
      cell: ({ row }) => (
        <span>
          <span className="font-medium">
            {row.original.brand} {row.original.style}
          </span>
          {row.original.styleName && (
            <span className="ml-1 text-muted-foreground">{row.original.styleName}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "color",
      header: t("blanks.color", "Color"),
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span
            className="size-3.5 rounded-full border border-border"
            style={{ background: row.original.colorHex ?? "transparent" }}
          />
          {row.original.color}
        </span>
      ),
    },
    { accessorKey: "size", header: t("blanks.size", "Size") },
    {
      id: "sku",
      header: t("blanks.sku", "SKU codes"),
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.styleCode}-{row.original.colorCode}-{row.original.sizeCode}
        </span>
      ),
    },
    {
      accessorKey: "supplier",
      header: t("blanks.supplier", "Supplier"),
      cell: ({ row }) => (
        <span className="text-xs">
          {t(`supplier.${row.original.supplier}`, row.original.supplier)} ·{" "}
          <span className="font-mono">{row.original.supplierSku}</span>
        </span>
      ),
    },
    {
      accessorKey: "cost",
      header: t("blanks.cost", "Cost"),
      cell: ({ row }) => <Money cents={row.original.cost} />,
    },
    {
      accessorKey: "weightOz",
      header: t("blanks.weight", "Weight"),
      cell: ({ row }) => `${row.original.weightOz} oz`,
    },
  ];
  return (
    <Page
      title={t("nav.blanks")}
      description={t(
        "blanks.subtitle",
        "Blank shirts by style, color and size. Stock lives here, shared by every design.",
      )}
      actions={
        can("catalog.manage") && (
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp />
              {t("blanks.import", "Import CSV")}
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus />
              {t("blanks.add", "Add blank")}
            </Button>
          </>
        )
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-sm">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("blanks.search", "Search style, color, SKU")}
            className="pl-8"
          />
        </div>
        <NativeSelect
          aria-label={t("blanks.brand", "Brand")}
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        >
          <option value="">{t("blanks.allBrands", "All brands")}</option>
          {facets.data?.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t("blanks.supplier", "Supplier")}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        >
          <option value="">{t("blanks.allSuppliers", "All suppliers")}</option>
          {SUPPLIERS.map((s) => (
            <option key={s} value={s}>
              {t(`supplier.${s}`, s)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {blanks.isError ? (
        <ErrorState error={blanks.error} onRetry={() => void blanks.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<BlankVariant, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={blanks.isPending}
          hasMore={!!blanks.hasNextPage}
          isLoadingMore={blanks.isFetchingNextPage}
          onLoadMore={() => void blanks.fetchNextPage()}
          onRowClick={can("catalog.manage") ? (r) => setEditing(r) : undefined}
          emptyTitle={t("blanks.empty", "No blanks yet")}
          emptyDescription={t(
            "blanks.emptyHint",
            "Import your blanks from a CSV or add them one by one.",
          )}
          maxHeight="calc(100dvh - 15rem)"
          estimateRowHeightPx={45}
        />
      )}
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t("blanks.importTitle", "Import blanks")}
        description={t(
          "blanks.importHint",
          "Columns: brand, style, styleCode, styleName, color, colorCode, colorHex, size, sizeCode, supplier, supplierSku, cost (cents), weightOz. Existing rows update by brand + style + color + size.",
        )}
        onImport={async (fileKey) => {
          const r = await client.blanks.bulkImport({ fileKey });
          void queryClient.invalidateQueries({ queryKey: orpc.blanks.key() });
          return r;
        }}
        renderReport={(r) => (
          <div>
            <ReportStats
              stats={[
                [t("csv.created", "Created"), r.created, "ok"],
                [t("csv.updated", "Updated"), r.updated, "neutral"],
                [t("csv.failed", "Failed"), r.failed, "bad"],
              ]}
            />
            <RowErrors errors={r.errors} />
          </div>
        )}
      />
      {editing && (
        <BlankDialog blank={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </Page>
  );
}

function BlankDialog({ blank, onClose }: { blank: BlankVariant | null; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [f, setF] = useState({
    brand: blank?.brand ?? "",
    style: blank?.style ?? "",
    styleCode: blank?.styleCode ?? "",
    styleName: blank?.styleName ?? "",
    color: blank?.color ?? "",
    colorCode: blank?.colorCode ?? "",
    colorHex: blank?.colorHex ?? "",
    size: blank?.size ?? "",
    sizeCode: blank?.sizeCode ?? "",
    supplier: blank?.supplier ?? ("ssactivewear" as (typeof SUPPLIERS)[number]),
    supplierSku: blank?.supplierSku ?? "",
    cost: blank ? (blank.cost / 100).toFixed(2) : "",
    weightOz: blank ? String(blank.weightOz) : "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const onDone = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.blanks.key() });
    toast.success(
      blank ? t("blanks.saved", "Blank saved") : t("blanks.createdToast", "Blank added"),
    );
    onClose();
  };
  const create = useMutation(orpc.blanks.create.mutationOptions({ onSuccess: onDone }));
  const update = useMutation(orpc.blanks.update.mutationOptions({ onSuccess: onDone }));
  const archive = useMutation(orpc.blanks.archive.mutationOptions({ onSuccess: onDone }));
  const cost = parseDollarsToCents(f.cost);
  const weight = Number(f.weightOz);
  const valid =
    f.brand &&
    f.style &&
    f.styleCode &&
    f.color &&
    f.colorCode &&
    f.size &&
    f.sizeCode &&
    f.supplierSku &&
    cost !== null &&
    cost >= 0 &&
    weight > 0 &&
    (!f.colorHex || /^#[0-9a-fA-F]{6}$/.test(f.colorHex));
  const input = () => ({
    brand: f.brand.trim(),
    style: f.style.trim(),
    styleCode: f.styleCode.trim(),
    styleName: f.styleName.trim() || null,
    color: f.color.trim(),
    colorCode: f.colorCode.trim(),
    colorHex: f.colorHex.trim() || null,
    size: f.size.trim(),
    sizeCode: f.sizeCode.trim(),
    supplier: f.supplier,
    supplierSku: f.supplierSku.trim(),
    cost: cost ?? 0,
    weightOz: weight,
  });
  const fields: [keyof typeof f, string][] = [
    ["brand", t("blanks.brand", "Brand")],
    ["style", t("blanks.style", "Style")],
    ["styleCode", t("blanks.styleCode", "Style code")],
    ["styleName", t("blanks.styleName", "Style name")],
    ["color", t("blanks.color", "Color")],
    ["colorCode", t("blanks.colorCode", "Color code")],
    ["colorHex", t("blanks.colorHex", "Color hex")],
    ["size", t("blanks.size", "Size")],
    ["sizeCode", t("blanks.sizeCode", "Size code")],
    ["supplierSku", t("blanks.supplierSku", "Supplier SKU")],
    ["cost", t("blanks.costUsd", "Cost ($)")],
    ["weightOz", t("blanks.weightOz", "Weight (oz)")],
  ];
  const pending = create.isPending || update.isPending;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {blank ? t("blanks.edit", "Edit blank") : t("blanks.add", "Add blank")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fields.map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`blank-${k}`}>
              <Input
                id={`blank-${k}`}
                value={f[k]}
                onChange={set(k)}
                inputMode={k === "cost" || k === "weightOz" ? "decimal" : undefined}
              />
            </Field>
          ))}
          <Field label={t("blanks.supplier", "Supplier")} htmlFor="blank-supplier">
            <NativeSelect id="blank-supplier" value={f.supplier} onChange={set("supplier")}>
              {SUPPLIERS.map((s) => (
                <option key={s} value={s}>
                  {t(`supplier.${s}`, s)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <DialogFooter className="sm:justify-between">
          {blank ? (
            <Button
              variant="ghost"
              className="text-danger"
              onClick={() => archive.mutate({ id: blank.id })}
              disabled={archive.isPending}
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
              disabled={!valid || pending}
              onClick={() =>
                blank ? update.mutate({ id: blank.id, ...input() }) : create.mutate(input())
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              {t("action.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
