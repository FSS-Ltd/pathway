import type { ReactNode } from "react";
import { metadataForPath } from "../../../lib/seo";

export const metadata = metadataForPath("/cookies");

export default function CookiesLayout({ children }: { children: ReactNode }) {
  return children;
}
