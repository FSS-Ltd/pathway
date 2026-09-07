import HomeschoolLandingPage from "../../../components/homeschool/homeschool-landing-page";
import JsonLd from "../../../components/seo/json-ld";
import {
  homeschoolDirectAnswer,
  homeschoolStructuredData,
} from "../../../lib/homeschool-seo";
import { metadataForPath } from "../../../lib/seo";

export const metadata = metadataForPath("/homeschool");

export default function HomeschoolPage() {
  return (
    <>
      <JsonLd data={homeschoolStructuredData} />
      <HomeschoolLandingPage directAnswer={homeschoolDirectAnswer} />
    </>
  );
}
