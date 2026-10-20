import { catalogueSchema } from "./schema";
import { catalogueV120 } from "./v1.20";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV120);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
