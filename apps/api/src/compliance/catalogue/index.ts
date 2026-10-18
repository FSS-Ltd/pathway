import { catalogueSchema } from "./schema";
import { catalogueV17 } from "./v1.7";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV17);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
