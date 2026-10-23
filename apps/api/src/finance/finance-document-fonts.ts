import { Font } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";

export const financeDocumentFontFamily = [
  "NexSteps Finance Nunito",
  "NexSteps Finance Noto Sans",
];

// Embed the existing brand font locally: PDF standard fonts lose extended
// European names. Static URLs also let ncc package the files for serverless.
Font.register({
  family: financeDocumentFontFamily[0],
  fonts: [
    {
      src: `data:font/ttf;base64,${readFileSync(new URL("./fonts/Nunito-Regular.ttf", import.meta.url)).toString("base64")}`,
      fontWeight: 400,
    },
    {
      src: `data:font/ttf;base64,${readFileSync(new URL("./fonts/Nunito-Bold.ttf", import.meta.url)).toString("base64")}`,
      fontWeight: 700,
    },
  ],
});

// Nunito covers extended Latin and Cyrillic. Use an embedded fallback for Greek
// names as well, rather than silently falling back to a PDF standard font.
Font.register({
  family: financeDocumentFontFamily[1],
  fonts: [
    {
      src: `data:font/ttf;base64,${readFileSync(new URL("./fonts/NotoSans-Regular.ttf", import.meta.url)).toString("base64")}`,
      fontWeight: 400,
    },
    {
      src: `data:font/ttf;base64,${readFileSync(new URL("./fonts/NotoSans-Bold.ttf", import.meta.url)).toString("base64")}`,
      fontWeight: 700,
    },
  ],
});
