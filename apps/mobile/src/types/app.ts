import type { AppSpace } from "@pathway/mobile-core";

export type AppBootstrapState = {
  isBootstrapped: boolean;
  activeSpace: AppSpace | null;
};
