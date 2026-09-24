import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Languages, Moon, ShoppingCart, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebounced } from "../hooks/use-debounced";
import { setLang } from "../i18n";
import { useCan, useMe } from "../lib/me";
import { navFor } from "../lib/nav";
import { orpc } from "../lib/rpc";
import { isDark, setTheme } from "../lib/theme";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const can = useCan();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim(), 200);
  const canSearchOrders = me.org.type === "shop" && can("orders.read");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const orders = useQuery(
    orpc.orders.list.queryOptions({
      input: { search: debounced, limit: 8 },
      enabled: open && canSearchOrders && debounced.length >= 2,
      staleTime: 10_000,
    }),
  );

  const go = (to: string, search?: Record<string, string>) => {
    onOpenChange(false);
    void navigate({ to: to as never, search: search as never });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("palette.title", "Command menu")}
    >
      <CommandInput
        placeholder={t("palette.placeholder", "Jump to a page or search orders…")}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {orders.isFetching ? t("common.loading") : t("common.noResults")}
        </CommandEmpty>
        {canSearchOrders && (orders.data?.items.length ?? 0) > 0 && (
          <CommandGroup heading={t("nav.orders")}>
            {orders.data?.items.map((o) => (
              <CommandItem
                key={o.id}
                value={`order ${o.orderNo} ${o.buyerName} ${debounced}`}
                onSelect={() => go("/orders", { order: o.id })}
              >
                <ShoppingCart />
                <span className="font-medium">#{o.orderNo}</span>
                <span className="truncate text-muted-foreground">{o.buyerName.split(" ")[0]}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {o.status.replace(/_/g, " ")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {navFor(me).map((g, gi) => (
          <CommandGroup
            key={g.labelKey ?? gi}
            heading={g.labelKey ? t(g.labelKey) : t("palette.pages", "Pages")}
          >
            {g.items.map((item) => (
              <CommandItem
                key={item.key}
                value={`${t(item.labelKey)} ${item.keywords ?? ""}`}
                onSelect={() => go(item.to)}
              >
                <item.icon />
                {t(item.labelKey)}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading={t("palette.preferences", "Preferences")}>
          <CommandItem
            value="toggle theme dark light mode"
            onSelect={() => {
              setTheme(isDark() ? "light" : "dark");
              onOpenChange(false);
            }}
          >
            {isDark() ? <Sun /> : <Moon />}
            {t("palette.toggleTheme", "Toggle dark mode")}
          </CommandItem>
          <CommandItem
            value="language idioma español english"
            onSelect={() => {
              void setLang(i18n.language === "es" ? "en" : "es");
              onOpenChange(false);
            }}
          >
            <Languages />
            {i18n.language === "es" ? "English" : "Español"}
            <CommandShortcut>EN/ES</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
