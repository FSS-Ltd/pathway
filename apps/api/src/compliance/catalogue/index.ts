import { catalogueSchema } from "./schema";
import { catalogueV114 } from "./v1.14";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV114);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
