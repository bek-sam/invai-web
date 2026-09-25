import { Button } from "@invai/ui";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDemoAction } from "./use-demo";

/** "Try with sample data": opens (or builds, the first time) this person's sample shop. */
export function TryDemoButton() {
  const { t } = useTranslation();
  const start = useDemoAction("start");
  return (
    <Button size="sm" variant="outline" onClick={() => start.mutate()} disabled={start.isPending}>
      {start.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {start.isPending
        ? t("demo.starting", "Setting up the sample shop…")
        : t("demo.try", "Try with sample data")}
    </Button>
  );
}
