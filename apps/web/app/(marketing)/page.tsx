import HomeCtaSection from "../../components/home-cta-section";
import { sectors } from "../../content/sectors";
import FeatureCards from "../../components/feature-cards";
import NexStepsParallaxHero from "../../components/hero/nexsteps-parallax-hero";
import ProductShowcase from "../../components/product-showcase";
import ReportingVisibilitySection from "../../components/reporting-visibility-section";
import SectorGrid from "../../components/sector-grid";
import TrustSection from "../../components/trust-section";
import WhyNexsteps from "../../components/why-nexsteps";
import { metadataForPath } from "../../lib/seo";

export const metadata = metadataForPath("/");

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <NexStepsParallaxHero />
      <ProductShowcase />
      <WhyNexsteps />
      <FeatureCards />
      <SectorGrid sectors={sectors} />
      <TrustSection />
      <ReportingVisibilitySection />
      <HomeCtaSection />
    </div>
  );
}
