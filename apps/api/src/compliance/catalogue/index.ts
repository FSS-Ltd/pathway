import { catalogueSchema } from "./schema";
import { catalogueV19 } from "./v1.9";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV19);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
