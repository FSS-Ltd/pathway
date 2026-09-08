import { breadcrumbJsonLd } from "../../lib/seo";
import JsonLd from "./json-ld";

export default function BreadcrumbJsonLd({
  items,
}: {
  items: readonly { name: string; path: string }[];
}) {
  return <JsonLd data={breadcrumbJsonLd(items)} />;
}
