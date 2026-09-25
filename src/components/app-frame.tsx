import {
  AppShell,
  type AppShellNavGroup,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@invai/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Bell, Check, ChevronsUpDown, Laptop, LogOut, Moon, Search, Sun } from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BillingBanner } from "../features/billing/billing-banner";
import { useMediaQuery } from "../hooks/use-media";
import { type Lang, setLang } from "../i18n";
import { authClient } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { useMe } from "../lib/me";
import { activeNavKey, navFor } from "../lib/nav";
import { useRealtime, useRealtimeStatus } from "../lib/realtime";
import { client, orpc } from "../lib/rpc";
import { setTheme, type ThemeMode, useTheme } from "../lib/theme";
import { AnyLink } from "./any-link";
import { CommandPalette } from "./command-palette";

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const me = useMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const [collapsedPref, setCollapsedPref] = useState(() => {
    try {
      return localStorage.getItem("invai.sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);

  useRealtime(true, me.org.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = navFor(me);
  const active = activeNavKey(groups, pathname);
  const navGroups: AppShellNavGroup[] = useMemo(
    () =>
      groups.map((g) => ({
        label: g.labelKey ? t(g.labelKey) : undefined,
        items: g.items.map((i) => ({
          key: i.key,
          label: t(i.labelKey),
          href: i.to,
          icon: i.icon,
          active: i.key === active,
        })),
      })),
    [groups, active, t],
  );

  return (
    <>
      <AppShell
        navGroups={navGroups}
        collapsed={isNarrow || collapsedPref}
        onCollapsedChange={(c) => {
          setCollapsedPref(c);
          try {
            localStorage.setItem("invai.sidebar", c ? "collapsed" : "expanded");
          } catch {}
        }}
        logo={<Logo compact={isNarrow || collapsedPref} />}
        renderNavLink={(item, content) => (
          <AnyLink to={item.href} aria-current={item.active ? "page" : undefined}>
            {content}
          </AnyLink>
        )}
        topBarStart={<OrgSwitcher />}
        topBarEnd={
          <>
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 text-muted-foreground sm:inline-flex"
              onClick={() => setPaletteOpen(true)}
            >
              <Search />
              <span className="hidden md:inline">{t("shell.search", "Search")}</span>
              <Kbd>⌘K</Kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label={t("shell.search", "Search")}
            >
              <Search />
            </Button>
            <AlertsBell />
            <UserMenu />
          </>
        }
        className="[&_main]:p-3 sm:[&_main]:p-6"
      >
        <BillingBanner />
        {children}
      </AppShell>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}

function Logo({ compact }: { compact: boolean }) {
  const status = useRealtimeStatus();
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold">
      <span className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
        In
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card",
            status === "open"
              ? "bg-success"
              : status === "connecting"
                ? "bg-warning"
                : "bg-muted-foreground",
          )}
          title={`Live updates: ${status}`}
        />
      </span>
      {!compact && <span className="truncate">InvAI</span>}
    </Link>
  );
}

function OrgSwitcher() {
  const { t } = useTranslation();
  const me = useMe();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();

  async function switchTo(orgId: string) {
    if (orgId === me.org.id) return;
    try {
      try {
        await client.me.switchOrg({ orgId });
      } catch {
        const res = await authClient.organization.setActive({ organizationId: orgId });
        if (res.error) throw new Error(res.error.message);
      }
      queryClient.clear();
      await router.invalidate();
      await navigate({ to: "/" });
    } catch (e) {
      toast.error(t("shell.switchFailed", "Couldn't switch company"), {
        description: errorMessage(e),
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-[55vw] gap-2 px-2">
          <span className="truncate font-semibold">{me.org.name}</span>
          {me.org.demo && (
            <Badge variant="info" className="hidden sm:inline-flex">
              {t("shell.demo", "Demo")}
            </Badge>
          )}
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("shell.companies", "Companies")}</DropdownMenuLabel>
        {me.orgs.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => void switchTo(o.id)}>
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            <span className="text-xs text-muted-foreground">
              {o.type === "vendor" ? t("shell.vendor", "Vendor") : o.role}
            </span>
            {o.id === me.org.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/signup" search={{ newCompany: true }}>
            {t("shell.newCompany", "Create another company")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AlertsBell() {
  const { t } = useTranslation();
  const me = useMe();
  const canRead = me.permissions.includes("alerts.read");
  const alerts = useQuery(
    orpc.alerts.list.queryOptions({
      input: { unreadOnly: true, limit: 1 },
      enabled: canRead,
      staleTime: 30_000,
      retry: false,
    }),
  );
  if (!canRead) return null;
  const unread = alerts.data?.unread ?? 0;
  const to = me.org.type === "vendor" ? "/vendor" : "/";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" asChild className="relative">
          <AnyLink to={to} hash="alerts" aria-label={t("shell.alerts", "Alerts")}>
            <Bell />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </AnyLink>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("shell.alerts", "Alerts")}</TooltipContent>
    </Tooltip>
  );
}

function UserMenu() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const initials = me.user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    await authClient.signOut().catch(() => undefined);
    queryClient.clear();
    await navigate({ to: "/login" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={t("shell.account", "Account")}
        >
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium">{me.user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {me.user.email} · {t(`roles.${me.role}`, me.role)}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("shell.theme", "Theme")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeMode)}>
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 size-4" /> {t("shell.light", "Light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 size-4" /> {t("shell.dark", "Dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Laptop className="mr-2 size-4" /> {t("shell.system", "System")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("shell.language", "Language")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={i18n.language}
          onValueChange={(v) => void setLang(v as Lang)}
        >
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="es">Español</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" />
          {t("action.logOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
