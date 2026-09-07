import { metadataForPath } from "../../../lib/seo";

export const metadata = metadataForPath("/readiness-score");

export default function ReadinessScoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
