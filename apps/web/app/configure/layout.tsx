import MarketingLayout from "../(marketing)/layout";

export default function ConfiguratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingLayout>{children}</MarketingLayout>;
}
