import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, LogOutIcon } from "lucide-react";
import { requireUser } from "@/server/auth";
import { signOutAction } from "@/server/actions/auth";
import { lastWorkspaceSlug } from "@/server/preferences";
import { ProfileForm } from "@/components/account/profile-form";
import { Preferences } from "@/components/account/preferences";
import { AccountData } from "@/components/account/account-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/common/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const t = await getTranslations("account");
  const back = await lastWorkspaceSlug();

  return (
    <PageContainer className="max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit">
        <Link href={back ? `/w/${back}` : "/"}>
          <ArrowLeftIcon className="rtl:rotate-180" />
          {t("back")}
        </Link>
      </Button>
      <PageHeader title={t("title")} description={user.email} />
      <Card>
        <CardHeader>
          <CardTitle>{t("profile")}</CardTitle>
          <CardDescription>{t("profileHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={user.name ?? ""} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("preferences")}</CardTitle>
          <CardDescription>{t("preferencesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Preferences />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("data.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountData email={user.email} />
        </CardContent>
      </Card>
      <form action={signOutAction}>
        <Button type="submit" variant="outline">
          <LogOutIcon />
          {t("signOut")}
        </Button>
      </form>
    </PageContainer>
  );
}
