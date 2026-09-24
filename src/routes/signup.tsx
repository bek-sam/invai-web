import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input } from "@invai/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { Field } from "../components/page";
import { authClient } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { slugify } from "../lib/format";

export const Route = createFileRoute("/signup")({
  validateSearch: z.object({ newCompany: z.boolean().optional() }),
  component: SignupPage,
});

const schema = z.object({
  name: z.string().min(1, "Required"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  company: z.string().min(2, "Required"),
});
type FormValues = z.infer<typeof schema>;

function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => authClient.getSession(),
    staleTime: 0,
  });
  const signedIn = !!session.data?.data?.user;
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(
      signedIn ? schema.partial({ name: true, email: true, password: true }) : schema,
    ) as never,
    defaultValues: { name: "", email: "", password: "", company: "" },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      if (!signedIn) {
        const res = await authClient.signUp.email({
          name: values.name,
          email: values.email,
          password: values.password,
        });
        if (res.error) throw new Error(res.error.message || "Sign-up failed");
      }
      const slug = `${slugify(values.company) || "shop"}-${Math.random().toString(36).slice(2, 6)}`;
      const org = await authClient.organization.create({ name: values.company, slug });
      if (org.error || !org.data)
        throw new Error(org.error?.message || "Couldn't create the company");
      await authClient.organization.setActive({ organizationId: org.data.id });
      queryClient.clear();
      await navigate({ to: "/" });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <AuthLayout
      title={
        signedIn
          ? t("auth.newCompanyTitle", "Create another company")
          : t("auth.signUpTitle", "Create your company")
      }
      subtitle={t(
        "auth.signUpSubtitle",
        "One workspace for orders, gang sheets, the floor and profit.",
      )}
      footer={
        signedIn ? (
          <Link to="/" className="font-medium text-primary hover:underline">
            {t("action.back")}
          </Link>
        ) : (
          <>
            {t("auth.haveAccount", "Already have an account?")}{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t("auth.signIn", "Sign in")}
            </Link>
          </>
        )
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {!signedIn && (
          <>
            <Field
              label={t("auth.yourName", "Your name")}
              htmlFor="name"
              error={errors.name?.message}
            >
              <Input id="name" autoComplete="name" {...form.register("name")} />
            </Field>
            <Field label={t("auth.email", "Email")} htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            </Field>
            <Field
              label={t("auth.password", "Password")}
              htmlFor="password"
              error={errors.password?.message}
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
              />
            </Field>
          </>
        )}
        <Field
          label={t("auth.companyName", "Company name")}
          htmlFor="company"
          error={errors.company?.message}
          hint={t("auth.companyHint", "Your shop's name, e.g. Desert Bloom Tees")}
        >
          <Input id="company" autoComplete="organization" {...form.register("company")} />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={isSubmitting || session.isPending} className="w-full">
          {isSubmitting && <Loader2 className="animate-spin" />}
          {t("auth.createCompany", "Create a company")}
        </Button>
      </form>
    </AuthLayout>
  );
}
