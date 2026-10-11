"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import {
  childSectionForRoute,
  ParentChildNavigation,
} from "@/components/ace/family/parent-child-navigation";

export default function ParentChildLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { siteId: string; childId: string };
}) {
  const section = childSectionForRoute(useSelectedLayoutSegment());
  return (
    <>
      {section ? (
        <ParentChildNavigation
          siteId={params.siteId}
          childId={params.childId}
          section={section}
        />
      ) : null}
      {children}
    </>
  );
}
