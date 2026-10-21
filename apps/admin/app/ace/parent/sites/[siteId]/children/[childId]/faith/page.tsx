import { FamilyFaithFeed } from "@/components/ace/faith/family-faith-feed";

export default function GuardianFaithPage({
  params,
}: {
  params: { siteId: string; childId: string };
}) {
  return <FamilyFaithFeed siteId={params.siteId} childId={params.childId} />;
}
