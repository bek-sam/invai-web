import { type EmailSkipReason, type RecipientDeliverability, WEEKDAYS } from "@invai/contracts";
import { Badge, Button, Switch, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { hourLabel, timezoneLabel, weekdayLabel } from "../../../components/digest/digest-copy";
import { Field, NativeSelect, Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { errorInfo, errorMessage } from "../../../lib/errors";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/notifications")({
  component: NotificationsSettingsPage,
});

const HOURS = [6, 7, 8, 9, 10];

const DELIVERABILITY_KEY: Record<RecipientDeliverability, string> = {
  ok: "digest.settings.recipientStatus.ok",
  unverified: "digest.settings.recipientStatus.unverified",
  placeholder: "digest.settings.recipientStatus.placeholder",
  suppressed: "digest.settings.recipientStatus.suppressed",
};
const DELIVERABILITY_DEFAULT: Record<RecipientDeliverability, string> = {
  ok: "Email works",
  unverified: "Email not confirmed",
  placeholder: "No real email on file",
  suppressed: "Emails are bouncing",
};

const EMAIL_SKIP_KEY: Record<EmailSkipReason, string> = {
  not_member: "digest.emailSkip.notMember",
  unverified: "digest.emailSkip.unverified",
  suppressed: "digest.emailSkip.suppressed",
  placeholder: "digest.emailSkip.placeholder",
  sample_workspace: "digest.emailSkip.sampleWorkspace",
  opted_out: "digest.emailSkip.optedOut",
  duplicate: "digest.emailSkip.duplicate",
  quiet_hours: "digest.emailSkip.quietHours",
};
const EMAIL_SKIP_DEFAULT: Record<EmailSkipReason, string> = {
  not_member: "You're no longer a member of this shop",
  unverified: "Your email isn't confirmed yet",
  suppressed: "Your recent emails have bounced",
  placeholder: "You don't have a real email on file",
  sample_workspace: "This is a sample shop; no email is sent",
  opted_out: "You're not getting this by email",
  duplicate: "Already sent",
  quiet_hours: "It's quiet hours right now",
};

function NotificationsSettingsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const settings = useQuery(orpc.digest.settings.get.queryOptions({ input: {} }));
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.digest.key() });
  const save = useMutation(orpc.digest.settings.set.mutationOptions({ onSuccess: invalidate }));
  const setRecipientEmail = useMutation(
    orpc.digest.settings.setRecipientEmail.mutationOptions({ onSuccess: invalidate }),
  );
  const preview = useMutation(orpc.digest.sendPreview.mutationOptions());

  const onPreview = () => {
    preview.mutate(
      {},
      {
        onSuccess: (res) => {
          if (res.status === "sent")
            toast.success(t("digest.settings.previewSent", "Preview sent. Check your inbox."));
          else
            toast.info(
              t("digest.settings.previewSkipped", "Nothing sent: {{reason}}", {
                reason: res.reason
                  ? t(EMAIL_SKIP_KEY[res.reason], EMAIL_SKIP_DEFAULT[res.reason])
                  : t("digest.settings.previewSkippedGeneric", "not available right now"),
              }),
            );
        },
        onError: (err) => {
          const info = errorInfo(err);
          if (info.code === "RATE_LIMITED") {
            toast.error(t("digest.settings.previewRateLimited", "Try again in a minute."));
          } else if (info.code === "NO_DIGEST") {
            toast.error(
              t(
                "digest.settings.noDigestYet",
                "Nothing to preview yet: your first digest builds next week.",
              ),
            );
          } else {
            toast.error(errorMessage(err));
          }
        },
      },
    );
  };

  return (
    <Page
      wide={false}
      title={t("nav.notifications", "Notifications")}
      description={t(
        "digest.settings.subtitle",
        "Choose when your shop gets its weekly business review.",
      )}
    >
      {settings.isPending ? (
        <SkeletonRows rows={6} />
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <Section>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {t("digest.settings.enabled", "Weekly review")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("digest.settings.schedule", "Every {{day}} at {{time}}, {{tz}}", {
                      day: weekdayLabel(settings.data.day, lang),
                      time: hourLabel(settings.data.hour, lang),
                      tz: timezoneLabel(settings.data.timezone, lang),
                    })}
                  </p>
                </div>
                <Switch
                  checked={settings.data.enabled}
                  disabled={save.isPending}
                  onCheckedChange={(enabled) => save.mutate({ enabled })}
                  aria-label={t("digest.settings.enabled", "Weekly review")}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Field label={t("digest.settings.day", "Day")} htmlFor="digest-day">
                  <NativeSelect
                    id="digest-day"
                    value={settings.data.day}
                    disabled={save.isPending || !settings.data.enabled}
                    onChange={(e) => save.mutate({ day: e.target.value as never })}
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>
                        {weekdayLabel(d, lang)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t("digest.settings.hour", "Time")} htmlFor="digest-hour">
                  <NativeSelect
                    id="digest-hour"
                    value={settings.data.hour}
                    disabled={save.isPending || !settings.data.enabled}
                    onChange={(e) => save.mutate({ hour: Number(e.target.value) })}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h, lang)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <div>
                  <p className="text-sm font-medium">
                    {t("digest.settings.aiSummary", "Write the summary with AI")}
                  </p>
                  {settings.data.aiSummaryMode !== "on" && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "digest.settings.aiSummaryShadow",
                        "Turned off for now while we test AI summaries. You'll get the standard summary until this is ready.",
                      )}
                    </p>
                  )}
                </div>
                <Switch
                  checked={settings.data.aiSummary}
                  disabled={save.isPending || settings.data.aiSummaryMode !== "on"}
                  onCheckedChange={(aiSummary) => save.mutate({ aiSummary })}
                  aria-label={t("digest.settings.aiSummary", "Write the summary with AI")}
                />
              </div>
            </div>
          </Section>

          <Section title={t("digest.settings.recipients", "Recipients")}>
            <ul className="flex flex-col gap-2">
              {settings.data.recipients.map((r) => (
                <li
                  key={r.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate font-medium">{r.name}</span>
                    <Badge variant={r.deliverable === "ok" ? "secondary" : "outline"}>
                      {t(DELIVERABILITY_KEY[r.deliverable], DELIVERABILITY_DEFAULT[r.deliverable])}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {r.emailOn
                        ? t("digest.settings.recipientOn", "Getting it by email")
                        : t("digest.settings.recipientOff", "Not by email")}
                    </span>
                    {r.emailOn && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={setRecipientEmail.isPending}
                        onClick={() => setRecipientEmail.mutate({ userId: r.userId, on: false })}
                      >
                        {t("digest.settings.turnOffRecipient", "Turn off email")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Button
            variant="outline"
            className="w-fit"
            disabled={preview.isPending}
            onClick={onPreview}
          >
            {preview.isPending && <Loader2 className="animate-spin" />}
            {t("digest.settings.preview", "Send me a preview now")}
          </Button>
        </div>
      )}
    </Page>
  );
}
