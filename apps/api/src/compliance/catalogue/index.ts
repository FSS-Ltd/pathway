import { catalogueSchema } from "./schema";
import { catalogueV117 } from "./v1.17";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV117);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
