import { catalogueSchema } from "./schema";
import { catalogueV113 } from "./v1.13";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV113);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
