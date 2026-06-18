import type { ComponentType, ReactNode } from "react";
import {
  Document as ReactPdfDocument,
  Image as ReactPdfImage,
  Page as ReactPdfPage,
  Text as ReactPdfText,
  View as ReactPdfView,
} from "@react-pdf/renderer";

type PdfStyle = object | ReadonlyArray<object | null | undefined>;

type PdfNodeProps = {
  id?: string;
  style?: PdfStyle;
  fixed?: boolean;
  break?: boolean;
  minPresenceAhead?: number;
};

type PdfDocumentProps = {
  children?: ReactNode;
  style?: PdfStyle;
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  keywords?: string;
  producer?: string;
  language?: string;
  creationDate?: Date;
  modificationDate?: Date;
  onRender?: (props: { blob?: Blob }) => void;
};

type PdfPageProps = PdfNodeProps & {
  children?: ReactNode;
  wrap?: boolean;
  debug?: boolean;
  size?: string | [number, number] | { width: number; height: number };
  orientation?: "portrait" | "landscape";
  dpi?: number;
};

type PdfViewProps = PdfNodeProps & {
  children?: ReactNode;
  wrap?: boolean;
  debug?: boolean;
  render?: (props: { pageNumber: number; subPageNumber: number }) => ReactNode;
};

type PdfTextProps = PdfNodeProps & {
  children?: ReactNode;
  wrap?: boolean;
  debug?: boolean;
  render?: (props: {
    pageNumber: number;
    totalPages: number;
    subPageNumber: number;
    subPageTotalPages: number;
  }) => ReactNode;
  hyphenationCallback?: (word: string) => string[];
  orphans?: number;
  widows?: number;
};

type PdfImageSource =
  | string
  | Buffer
  | { uri: string; method?: string; body?: string; headers?: Record<string, string> };

type PdfImageProps = PdfNodeProps &
  (
    | {
        src: PdfImageSource;
        source?: never;
      }
    | {
        source: PdfImageSource;
        src?: never;
      }
  ) & {
    debug?: boolean;
    cache?: boolean;
  };

// React-PDF's class component declarations can resolve against a different
// React type namespace in Vercel builds. These adapters keep JSX on the app's
// React namespace without changing the runtime React-PDF primitives.
export const Document = ReactPdfDocument as unknown as ComponentType<PdfDocumentProps>;
export const Page = ReactPdfPage as unknown as ComponentType<PdfPageProps>;
export const Text = ReactPdfText as unknown as ComponentType<PdfTextProps>;
export const View = ReactPdfView as unknown as ComponentType<PdfViewProps>;
export const Image = ReactPdfImage as unknown as ComponentType<PdfImageProps>;
