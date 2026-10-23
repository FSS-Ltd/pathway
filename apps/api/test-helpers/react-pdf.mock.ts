import type { PropsWithChildren, ReactElement, ReactNode } from "react";

type PdfNodeProps = PropsWithChildren<Record<string, unknown>>;

function PdfNode({ children }: PdfNodeProps): ReactNode {
  return children ?? null;
}

export const Document = PdfNode;
export const Page = PdfNode;
export const Text = PdfNode;
export const View = PdfNode;
export const financeDocumentFontFamily = "Jest PDF renderer stub";

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T): T {
    return styles;
  },
};

export async function renderToBuffer(_document: ReactElement): Promise<Buffer> {
  return Buffer.from("%PDF-1.4\n% Jest renderer stub\n");
}
