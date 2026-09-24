import { STATIONS, type StationDevice } from "@invai/contracts";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  RelativeTime,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, KeyRound, Loader2, Plus, Tablet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect, Page } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { useMe } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/stations")({
  component: StationsPage,
});

function StationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const q = useQuery(orpc.stations.list.queryOptions({ input: {} }));
  const locations = useQuery(orpc.locations.list.queryOptions({ input: {}, retry: false }));
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<{ station: StationDevice; token: string } | null>(null);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.stations.key() });
  const issue = useMutation(orpc.stations.issueToken.mutationOptions({ onSuccess: invalidate }));
  const update = useMutation(orpc.stations.update.mutationOptions({ onSuccess: invalidate }));
  const issueFor = (s: StationDevice) =>
    issue.mutate({ id: s.id }, { onSuccess: (r) => setToken({ station: s, token: r.token }) });
  return (
    <Page
      wide={false}
      title={t("nav.stations")}
      description={t(
        "stationsSettings.subtitle",
        "Tablets on the floor. Each gets a token once; staff then sign in with their PIN.",
      )}
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t("stationsSettings.add", "Add station")}
        </Button>
      }
    >
      {q.isPending ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tablet}
            title={t("stationsSettings.none", "No stations yet")}
            description={t(
              "stationsSettings.noneHint",
              "Add one per tablet: pick, press, QC or pack.",
            )}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.data.items.map((s) => (
            <Card key={s.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2">
                <Tablet className="size-4 text-muted-foreground" />
                <p className="font-medium">{s.name}</p>
                <Badge variant="secondary">
                  {s.kind
                    ? t(`station.${s.kind}`)
                    : t("stationsSettings.anyStation", "Any station")}
                </Badge>
                {!s.active && (
                  <Badge variant="outline">{t("stationsSettings.inactive", "Inactive")}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {s.tokenIssuedAt ? (
                  <>
                    {t("stationsSettings.tokenIssued", "Token issued")}{" "}
                    <RelativeTime value={s.tokenIssuedAt} />
                  </>
                ) : (
                  t("stationsSettings.noToken", "No token yet")
                )}
                {s.lastSeenAt && (
                  <>
                    {" · "}
                    {t("team.lastSeen", "Last seen")} <RelativeTime value={s.lastSeenAt} />
                  </>
                )}
              </p>
              <div className="mt-1 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => issueFor(s)}
                  disabled={issue.isPending}
                >
                  <KeyRound />
                  {s.tokenIssuedAt
                    ? t("stationsSettings.reissue", "New token")
                    : t("stationsSettings.issue", "Pair tablet")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update.mutate({ id: s.id, active: !s.active })}
                >
                  {s.active
                    ? t("team.deactivate", "Deactivate")
                    : t("team.reactivate", "Reactivate")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {creating && (
        <CreateStation
          locations={locations.data?.items ?? []}
          onClose={() => setCreating(false)}
          onCreated={(s) => {
            invalidate();
            setCreating(false);
            issueFor(s);
          }}
        />
      )}
      {token && (
        <TokenDialog station={token.station} token={token.token} onClose={() => setToken(null)} />
      )}
    </Page>
  );
}

function CreateStation({
  locations,
  onClose,
  onCreated,
}: {
  locations: { id: string; name: string; isDefault: boolean }[];
  onClose: () => void;
  onCreated: (s: StationDevice) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [locationId, setLocationId] = useState(
    locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? "",
  );
  const create = useMutation(orpc.stations.create.mutationOptions({ onSuccess: onCreated }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("stationsSettings.add", "Add station")}</DialogTitle>
        </DialogHeader>
        <Field label={t("designs.name", "Name")} htmlFor="st-name">
          <Input
            id="st-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("stationsSettings.namePh", "Press 1")}
          />
        </Field>
        <Field label={t("stations.station", "Station")} htmlFor="st-kind">
          <NativeSelect id="st-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{t("stationsSettings.anyStation", "Any station")}</option>
            {STATIONS.map((s) => (
              <option key={s} value={s}>
                {t(`station.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("company.locations", "Location")} htmlFor="st-loc">
          <NativeSelect
            id="st-loc"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!name.trim() || !locationId || create.isPending}
            onClick={() =>
              create.mutate({ name: name.trim(), locationId, kind: (kind || null) as never })
            }
          >
            {create.isPending && <Loader2 className="animate-spin" />}
            {t("action.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenDialog({
  station,
  token,
  onClose,
}: {
  station: StationDevice;
  token: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const me = useMe();
  // invai-floor's setup screen scans this JSON payload (see invai-floor src/lib/codes.ts).
  const payload = JSON.stringify({
    token,
    station: station.name,
    kind: station.kind,
    company: me.org.name,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("stationsSettings.pairTitle", "Pair {{name}}", { name: station.name })}
          </DialogTitle>
          <DialogDescription>
            {t(
              "stationsSettings.pairHint",
              "Scan this with the tablet, or paste the token into the floor app. It is shown only once.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center rounded-lg bg-white p-4">
          <QRCodeSVG value={payload} size={220} level="M" />
        </div>
        <div className="flex gap-2">
          <Input
            readOnly
            value={token}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("stationsSettings.token", "Station token")}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              void navigator.clipboard
                .writeText(token)
                .then(() => toast.success(t("stationsSettings.copied", "Copied")))
            }
            aria-label={t("stationsSettings.copy", "Copy")}
          >
            <Copy />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("stationsSettings.done", "Done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
