import { FLOOR_ROLES, type Role, SHOP_ROLES, type User } from "@invai/contracts";
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
import { KeyRound, Loader2, Mail, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { Field, NativeSelect, Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { errorInfo } from "../../../lib/errors";
import { useCan, useMe } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/team")({
  component: TeamPage,
});

const isFloorRole = (r: Role) => (FLOOR_ROLES as readonly Role[]).includes(r);

/** What the owner is about to do, waiting for "Confirm". */
type Pending =
  | { kind: "role"; user: User; role: Role }
  | { kind: "deactivate"; user: User }
  | { kind: "revoke"; user: User };

function TeamPage() {
  const { t } = useTranslation();
  const me = useMe();
  const can = useCan();
  const manage = can("team.manage");
  const queryClient = useQueryClient();
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pinFor, setPinFor] = useState<User | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
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
  const pendingEmails = useMemo(
    () => new Set(rows.filter((r) => r.status === "invited").map((r) => r.email.toLowerCase())),
    [rows],
  );
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.team.key() });
  const teamError = (err: unknown) => {
    const { code, message } = errorInfo(err);
    toast.error(
      code === "CONFLICT" && /owner/i.test(message)
        ? t("team.lastOwner", "A company needs at least one owner.")
        : code === "NOT_INVITED"
          ? t("team.notInvited", "That invite was already accepted or canceled.")
          : code === "UPSTREAM_FAILED"
            ? t(
                "team.inviteFailed",
                "The invite email didn't go out. Check the address and try again.",
              )
            : message,
    );
  };
  const done = (msg: string) => () => {
    toast.success(msg);
    setPending(null);
    invalidate();
  };
  const onError = (err: unknown) => {
    teamError(err);
    setPending(null);
    invalidate();
  };
  const changeRole = useMutation(
    orpc.team.changeRole.mutationOptions({
      meta: { silent: true },
      onSuccess: done(t("team.roleChanged", "Role updated")),
      onError,
    }),
  );
  const deactivate = useMutation(
    orpc.team.deactivate.mutationOptions({
      meta: { silent: true },
      onSuccess: done(t("team.deactivated", "Deactivated")),
      onError,
    }),
  );
  const revoke = useMutation(
    orpc.team.revoke.mutationOptions({
      meta: { silent: true },
      onSuccess: done(t("team.revoked", "Invite revoked")),
      onError,
    }),
  );
  const resend = useMutation(
    orpc.team.resend.mutationOptions({
      meta: { silent: true },
      onSuccess: (u) => {
        toast.success(t("team.resent", "Invite sent again to {{email}}", { email: u.email }));
        invalidate();
      },
      onError: teamError,
    }),
  );
  const reactivate = useMutation(orpc.team.reactivate.mutationOptions({ onSuccess: invalidate }));
  const columns: DataTableColumn<User>[] = [
    {
      accessorKey: "name",
      header: t("team.person", "Person"),
      cell: ({ row }) => (
        <span>
          <span className="font-medium">{row.original.name}</span>
          {/* A PIN-only member's email is a placeholder, never a real address: don't show it. */}
          {row.original.pinOnly ? (
            <span className="block text-xs text-muted-foreground">
              {t("team.pinOnlyNote", "PIN only, no email")}
            </span>
          ) : (
            <span className="block text-xs text-muted-foreground">{row.original.email}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "role",
      header: t("team.role", "Role"),
      cell: ({ row }) => {
        const u = row.original;
        const options = u.pinOnly ? roles.filter(isFloorRole) : roles;
        return manage && u.id !== me.user.id && u.status !== "deactivated" && options.length > 1 ? (
          <NativeSelect
            className="h-8"
            value={u.role}
            onChange={(e) => setPending({ kind: "role", user: u, role: e.target.value as Role })}
            aria-label={t("team.roleFor", "Role for {{name}}", { name: u.name })}
          >
            {options.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`, r)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          t(`roles.${u.role}`, u.role)
        );
      },
    },
    {
      accessorKey: "status",
      header: t("sheets.status", "Status"),
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
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
          {row.original.pinOnly && (
            <Badge variant="secondary">{t("team.pinOnly", "PIN only")}</Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: "hasPin",
      header: t("team.pin", "Floor PIN"),
      cell: ({ row }) =>
        row.original.hasPin ? (
          // relative: an sr-only label is absolutely placed; keep it inside the table's scroll box.
          <span className="relative">
            <span aria-hidden>✓</span>
            <span className="sr-only">{t("team.hasPin", "PIN set")}</span>
          </span>
        ) : (
          <span className="relative">
            <span aria-hidden>—</span>
            <span className="sr-only">{t("team.noPin", "No PIN")}</span>
          </span>
        ),
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
      cell: ({ row }) => {
        const u = row.original;
        if (!manage || u.id === me.user.id) return null;
        if (u.status === "invited")
          return (
            <span className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={resend.isPending}
                onClick={() => resend.mutate({ userId: u.id })}
              >
                <Mail />
                {t("team.resend", "Resend")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setPending({ kind: "revoke", user: u })}
              >
                {t("team.revoke", "Revoke")}
              </Button>
            </span>
          );
        return (
          <span className="flex justify-end gap-1">
            {me.org.type === "shop" && u.status === "active" && (
              <Button size="sm" variant="ghost" onClick={() => setPinFor(u)}>
                <KeyRound />
                {t("team.setPin", "PIN")}
              </Button>
            )}
            {u.status === "deactivated" ? (
              <Button size="sm" variant="ghost" onClick={() => reactivate.mutate({ userId: u.id })}>
                {t("team.reactivate", "Reactivate")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setPending({ kind: "deactivate", user: u })}
              >
                {t("team.deactivate", "Deactivate")}
              </Button>
            )}
          </span>
        );
      },
    },
  ];
  const confirmBusy = changeRole.isPending || deactivate.isPending || revoke.isPending;
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
        <InviteDialog
          roles={roles}
          pinOnlyAllowed={me.org.type === "shop"}
          pendingEmails={pendingEmails}
          onClose={() => setInviteOpen(false)}
          onDone={invalidate}
        />
      )}
      {pinFor && <PinDialog user={pinFor} onClose={() => setPinFor(null)} onDone={invalidate} />}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          pending={confirmBusy}
          destructive={pending.kind !== "role" || pending.role === "owner"}
          title={
            pending.kind === "role"
              ? pending.role === "owner"
                ? t("team.confirmOwnerTitle", "Make {{name}} an owner?", {
                    name: pending.user.name,
                  })
                : t("team.confirmRoleTitle", "Change {{name}}'s role?", {
                    name: pending.user.name,
                  })
              : pending.kind === "deactivate"
                ? t("team.confirmDeactivateTitle", "Deactivate {{name}}?", {
                    name: pending.user.name,
                  })
                : t("team.confirmRevokeTitle", "Revoke the invite to {{email}}?", {
                    email: pending.user.email,
                  })
          }
          description={
            pending.kind === "role"
              ? pending.role === "owner"
                ? t(
                    "team.confirmOwnerBody",
                    "Owners can do everything, including billing, deleting data and managing other owners.",
                  )
                : t("team.confirmRoleBody", "From {{from}} to {{to}}. It applies right away.", {
                    from: t(`roles.${pending.user.role}`, pending.user.role),
                    to: t(`roles.${pending.role}`, pending.role),
                  })
              : pending.kind === "deactivate"
                ? t(
                    "team.confirmDeactivateBody",
                    "They are signed out, can't sign in on the web, and their floor PIN stops working. You can reactivate them later.",
                  )
                : t(
                    "team.confirmRevokeBody",
                    "The link in their email stops working. You can invite them again later.",
                  )
          }
          confirmLabel={
            pending.kind === "role"
              ? t("team.confirmRole", "Change role")
              : pending.kind === "deactivate"
                ? t("team.deactivate", "Deactivate")
                : t("team.revoke", "Revoke")
          }
          onConfirm={() => {
            const userId = pending.user.id;
            if (pending.kind === "role") changeRole.mutate({ userId, role: pending.role });
            else if (pending.kind === "deactivate") deactivate.mutate({ userId });
            else revoke.mutate({ userId });
          }}
        />
      )}
    </Page>
  );
}

function InviteDialog({
  roles,
  pinOnlyAllowed,
  pendingEmails,
  onClose,
  onDone,
}: {
  roles: readonly Role[];
  pinOnlyAllowed: boolean;
  pendingEmails: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pinOnly, setPinOnly] = useState(false);
  const [pin, setPin] = useState("");
  // Set once the PIN-only member exists, so a retry after a PIN clash only sets the PIN.
  const [added, setAdded] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(
    roles.includes("office") ? "office" : (roles[0] ?? "vendor"),
  );
  const floorRoles = roles.filter(isFloorRole);
  const roleOptions = pinOnly ? floorRoles : roles;
  const earlierPending = !pinOnly && pendingEmails.has(email.trim().toLowerCase());
  const invite = useMutation(
    orpc.team.invite.mutationOptions({
      // The API answers only after the email went out; a failed email is an error, never "sent".
      meta: { silent: true },
      onError: (err) => {
        const { code, message } = errorInfo(err);
        toast.error(
          code === "UPSTREAM_FAILED"
            ? t(
                "team.inviteFailed",
                "The invite email didn't go out. Check the address and try again.",
              )
            : code === "CONFLICT"
              ? /pending/i.test(message)
                ? t("team.earlierPending", "An earlier invite is still pending.")
                : t("team.alreadyMember", "That person is already on the team.")
              : message,
        );
      },
    }),
  );
  const setPinMut = useMutation(orpc.team.setPin.mutationOptions({ meta: { silent: true } }));
  const busy = invite.isPending || setPinMut.isPending;
  const pinValid = /^\d{4,6}$/.test(pin);

  const submit = async () => {
    if (!pinOnly) {
      const resent = earlierPending;
      const invited = await invite.mutateAsync({ name: name.trim(), email: email.trim(), role });
      toast.success(
        resent
          ? t("team.resent", "Invite sent again to {{email}}", { email: invited.email })
          : t("team.invited", "Invitation sent to {{email}}", { email: invited.email }),
      );
      onDone();
      onClose();
      return;
    }
    const user = added ?? (await invite.mutateAsync({ name: name.trim(), role, pinOnly: true }));
    setAdded(user);
    onDone();
    try {
      await setPinMut.mutateAsync({ userId: user.id, pin });
    } catch (err) {
      const { code, message } = errorInfo(err);
      toast.error(
        code === "CONFLICT"
          ? t("team.pinTaken", "{{name}} was added, but that PIN is taken. Pick another one.", {
              name: user.name,
            })
          : message,
      );
      return;
    }
    toast.success(
      t("team.pinOnlyAdded", "{{name}} can now sign in on a station with their PIN.", {
        name: user.name,
      }),
    );
    onDone();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pinOnly
              ? t("team.addPinOnlyTitle", "Add floor staff")
              : t("team.inviteTitle", "Invite a teammate")}
          </DialogTitle>
          <DialogDescription>
            {pinOnly
              ? t(
                  "team.pinOnlyHint",
                  "For floor staff with no email. They sign in on a station with a PIN and can't use the web app.",
                )
              : t(
                  "team.inviteHint",
                  "They get an email link to join. Floor staff sign in on a station with a PIN.",
                )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit().catch(() => undefined);
          }}
        >
          {pinOnlyAllowed && floorRoles.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={pinOnly}
                disabled={!!added}
                onCheckedChange={(on) => {
                  setPinOnly(on);
                  if (on && !isFloorRole(role)) setRole(floorRoles[0] as Role);
                }}
              />
              {t("team.pinOnlyToggle", "No email: floor PIN only")}
            </label>
          )}
          <Field label={t("team.name", "Name")} htmlFor="i-name">
            <Input
              id="i-name"
              required
              value={name}
              disabled={!!added}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {!pinOnly && (
            <Field
              label={t("auth.email", "Email")}
              htmlFor="i-email"
              hint={
                earlierPending
                  ? t(
                      "team.earlierPendingHint",
                      "An earlier invite is still pending. Sending again resends it with a fresh link expiry.",
                    )
                  : undefined
              }
            >
              <Input
                id="i-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          )}
          <Field label={t("team.role", "Role")} htmlFor="i-role" hint={t(`roleHint.${role}`, "")}>
            <NativeSelect
              id="i-role"
              value={role}
              disabled={!!added}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`, r)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {pinOnly && (
            <Field
              label={t("team.pin", "Floor PIN")}
              htmlFor="i-pin"
              hint={t(
                "team.pinHint",
                "4 to 6 digits, unique in your company. It is never shown again.",
              )}
            >
              <Input
                id="i-pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="tracking-[0.3em]"
              />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("action.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || busy || (pinOnly ? !pinValid : !email.trim())}
            >
              {busy && <Loader2 className="animate-spin" />}
              {pinOnly
                ? t("team.addPinOnly", "Add and set PIN")
                : earlierPending
                  ? t("team.resendInvite", "Resend invite")
                  : t("team.sendInvite", "Send invite")}
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
