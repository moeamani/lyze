import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({ children, params }: LayoutProps<"/w/[ws]/settings">) {
  const { ws } = await params;
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 md:pt-10 lg:px-10">
        <SettingsTabs base={`/w/${ws}/settings`} />
      </div>
      {children}
    </>
  );
}
