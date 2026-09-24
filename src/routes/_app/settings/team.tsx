import { type Role, SHOP_ROLES, type User } from "@invai/contracts";
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  RelativeTime,
  Switch,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect, Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { useCan, useMe } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/team")({
  component: TeamPage,
});

function TeamPage() {
  const { t } = useTranslation();
  const me = useMe();
  const can = useCan();
  const manage = can("team.manage");
  const queryClient = useQueryClient();
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pinFor, setPinFor] = useState<User | null>(null);
  const roles: readonly Role[] = me.org.type === "vendor" ? ["vendor"] : SHOP_ROLES;
  const q = useInfiniteQuery(
    orpc.team.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        includeDeactivated: showDeactivated,
        cursor,
        limit: 200,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.team.key() });
  const changeRole = useMutation(
    orpc.team.changeRole.mutationOptions({
      onSuccess: () => {
        toast.success(t("team.roleChanged", "Role updated"));
        invalidate();
      },
    }),
  );
  const deactivate = useMutation(orpc.team.deactivate.mutationOptions({ onSuccess: invalidate }));
  const reactivate = useMutation(orpc.team.reactivate.mutationOptions({ onSuccess: invalidate }));
  const columns: DataTableColumn<User>[] = [
    {
      accessorKey: "name",
      header: t("team.person", "Person"),
      cell: ({ row }) => (
        <span>
          <span className="font-medium">{row.original.name}</span>
          <span className="block text-xs text-muted-foreground">{row.original.email}</span>
        </span>
      ),
    },
    {
      accessorKey: "role",
      header: t("team.role", "Role"),
      cell: ({ row }) =>
        manage && row.original.id !== me.user.id && roles.length > 1 ? (
          <NativeSelect
            className="h-8"
            value={row.original.role}
            onChange={(e) =>
              changeRole.mutate({ userId: row.original.id, role: e.target.value as Role })
            }
            aria-label={t("team.role", "Role")}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`, r)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          t(`roles.${row.original.role}`, row.original.role)
        ),
    },
    {
      accessorKey: "status",
      header: t("sheets.status", "Status"),
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "active"
              ? "success"
              : row.original.status === "invited"
                ? "warning"
                : "outline"
          }
        >
          {t(`userStatus.${row.original.status}`, row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "hasPin",
      header: t("team.pin", "Floor PIN"),
      cell: ({ row }) => (row.original.hasPin ? "✓" : "—"),
    },
    {
      accessorKey: "lastSeenAt",
      header: t("team.lastSeen", "Last seen"),
      cell: ({ row }) =>
        row.original.lastSeenAt ? (
          <RelativeTime value={row.original.lastSeenAt} className="text-muted-foreground" />
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        manage &&
        row.original.id !== me.user.id && (
          <span className="flex justify-end gap-1">
            {me.org.type === "shop" && (
              <Button size="sm" variant="ghost" onClick={() => setPinFor(row.original)}>
                <KeyRound />
                {t("team.setPin", "PIN")}
              </Button>
            )}
            {row.original.status === "deactivated" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => reactivate.mutate({ userId: row.original.id })}
              >
                {t("team.reactivate", "Reactivate")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => deactivate.mutate({ userId: row.original.id })}
              >
                {t("team.deactivate", "Deactivate")}
              </Button>
            )}
          </span>
        ),
    },
  ];
  return (
    <Page
      title={t("nav.team")}
      description={t("team.subtitle", "Who can sign in, what they can do, and floor PINs.")}
      actions={
        manage && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus />
            {t("team.invite", "Invite")}
          </Button>
        )
      }
    >
      <label className="mb-3 flex items-center gap-2 text-sm">
        <Switch checked={showDeactivated} onCheckedChange={setShowDeactivated} />
        {t("team.showDeactivated", "Show deactivated")}
      </label>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<User, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={q.isPending}
          emptyTitle={t("team.empty", "Just you so far")}
          maxHeight="calc(100dvh - 15rem)"
          estimateRowHeightPx={56}
        />
      )}
      {inviteOpen && (
        <InviteDialog roles={roles} onClose={() => setInviteOpen(false)} onDone={invalidate} />
      )}
      {pinFor && <PinDialog user={pinFor} onClose={() => setPinFor(null)} onDone={invalidate} />}
    </Page>
  );
}

function InviteDialog({
  roles,
  onClose,
  onDone,
}: {
  roles: readonly Role[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(
    roles.includes("office") ? "office" : (roles[0] ?? "vendor"),
  );
  const invite = useMutation(
    orpc.team.invite.mutationOptions({
      onSuccess: () => {
        toast.success(t("team.invited", "Invitation sent to {{email}}", { email }));
        onDone();
        onClose();
      },
    }),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("team.inviteTitle", "Invite a teammate")}</DialogTitle>
          <DialogDescription>
            {t(
              "team.inviteHint",
              "They get an email link to join. Floor staff sign in on a station with a PIN.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate({ name: name.trim(), email: email.trim(), role });
          }}
        >
          <Field label={t("team.name", "Name")} htmlFor="i-name">
            <Input id="i-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("auth.email", "Email")} htmlFor="i-email">
            <Input
              id="i-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t("team.role", "Role")} htmlFor="i-role" hint={t(`roleHint.${role}`, "")}>
            <NativeSelect
              id="i-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`, r)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || !email.trim() || invite.isPending}>
              {invite.isPending && <Loader2 className="animate-spin" />}
              {t("team.sendInvite", "Send invite")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PinDialog({
  user,
  onClose,
  onDone,
}: {
  user: User;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const set = useMutation(
    orpc.team.setPin.mutationOptions({
      onSuccess: () => {
        toast.success(t("team.pinSet", "PIN set for {{name}}", { name: user.name }));
        onDone();
        onClose();
      },
    }),
  );
  const valid = /^\d{4,6}$/.test(pin);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("team.pinTitle", "Floor PIN for {{name}}", { name: user.name })}
          </DialogTitle>
          <DialogDescription>
            {t("team.pinHint", "4 to 6 digits, unique in your company. It is never shown again.")}
          </DialogDescription>
        </DialogHeader>
        <Input
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="text-center text-2xl tracking-[0.5em]"
          aria-label={t("team.pin", "Floor PIN")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!valid || set.isPending}
            onClick={() => set.mutate({ userId: user.id, pin })}
          >
            {set.isPending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
