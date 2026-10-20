import { catalogueSchema } from "./schema";
import { catalogueV124 } from "./v1.24";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV124);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
