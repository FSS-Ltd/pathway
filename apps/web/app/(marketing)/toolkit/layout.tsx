import { metadataForPath } from "../../../lib/seo";

export const metadata = metadataForPath("/toolkit");

export default function ToolkitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
