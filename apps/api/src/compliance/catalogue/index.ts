import { catalogueSchema } from "./schema";
import { catalogueV13 } from "./v1.3";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV13);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
