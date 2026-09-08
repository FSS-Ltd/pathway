import MarketingLayout from "../(marketing)/layout";
import { metadataForPath } from "../../lib/seo";

export const metadata = metadataForPath("/configure");

export default function ConfiguratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingLayout>{children}</MarketingLayout>;
}
