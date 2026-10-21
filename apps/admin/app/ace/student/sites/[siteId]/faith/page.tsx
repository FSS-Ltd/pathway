import { FamilyFaithFeed } from "@/components/ace/faith/family-faith-feed";

export default function StudentFaithPage({
  params,
}: {
  params: { siteId: string };
}) {
  return <FamilyFaithFeed siteId={params.siteId} />;
}
