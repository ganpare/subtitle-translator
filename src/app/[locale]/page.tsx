import ClientPage from "./client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const t = await getTranslations({ locale, namespace: "subtitle" });

  return {
    title: `${t("title")} - Tools by AI`,
    description: t("description"),
  };
}

export default function Page() {
  return <ClientPage />;
}
