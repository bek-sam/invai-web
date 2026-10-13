import type { DesignAiUse, DesignUpdateInput } from "@invai/contracts";

type Update = (input: DesignUpdateInput) => unknown;
type Form = Omit<DesignUpdateInput, "id" | "aiUse"> & { aiUse?: unknown };

/** The AI-use choice saves on its own: exactly { id, aiUse }, never the rest of the form. */
export function chooseAiUse(update: Update, designId: string, aiUse: DesignAiUse) {
  return update({ id: designId, aiUse });
}

/** The page's Save sends the form fields and never aiUse. */
export function saveDesignForm(update: Update, designId: string, form: Form) {
  const { aiUse: _ignored, ...rest } = form;
  return update({ id: designId, ...rest });
}
