import { catalogueSchema } from "./schema";
import { catalogueV122 } from "./v1.22";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV122);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
