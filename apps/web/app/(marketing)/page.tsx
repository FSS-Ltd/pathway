import type { Metadata } from "next";
import HomeCtaSection from "../../components/home-cta-section";
import { sectors } from "../../content/sectors";
import FeatureCards from "../../components/feature-cards";
import NexStepsParallaxHero from "../../components/hero/nexsteps-parallax-hero";
import ProductShowcase from "../../components/product-showcase";
import ReportingVisibilitySection from "../../components/reporting-visibility-section";
import SectorGrid from "../../components/sector-grid";
import TrustSection from "../../components/trust-section";
import WhyNexsteps from "../../components/why-nexsteps";

export const metadata: Metadata = {
  title: "Nexsteps - Connected operations for schools, clubs, churches & charities",
  description:
    "Nexsteps helps organisations run attendance, teams, family communication, safeguarding, and reporting from one connected system.",
};

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
