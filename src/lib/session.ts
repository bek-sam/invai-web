import { authClient } from "./auth";

/** Better Auth sessions start without an active organization; pick the first one the user has. */
export async function ensureActiveOrg(preferredOrgId?: string) {
  const session = await authClient.getSession();
  if (!session.data) return;
  if (preferredOrgId) {
    await authClient.organization.setActive({ organizationId: preferredOrgId });
    return;
  }
  if (session.data.session.activeOrganizationId) return;
  const orgs = await authClient.organization.list();
  const first = orgs.data?.[0];
  if (first) await authClient.organization.setActive({ organizationId: first.id });
}
