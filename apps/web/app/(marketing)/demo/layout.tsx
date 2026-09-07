import { metadataForPath } from "../../../lib/seo";

export const metadata = metadataForPath("/demo");

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
