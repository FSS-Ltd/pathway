import BreadcrumbJsonLd from "./breadcrumb-json-ld";

export default function FeatureBreadcrumbJsonLd({
  name,
  path,
}: {
  name: string;
  path: string;
}) {
  return (
    <BreadcrumbJsonLd
      items={[
        { name: "Home", path: "/" },
        { name, path },
      ]}
    />
  );
}
