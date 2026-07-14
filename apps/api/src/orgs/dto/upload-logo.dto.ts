import { z } from "zod";

export const uploadLogoDto = z.object({
  logoBase64: z.string().min(1, "Logo data is required"),
  logoContentType: z.string().optional().nullable(),
});

export type UploadLogoDto = z.infer<typeof uploadLogoDto>;
