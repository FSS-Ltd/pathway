import { catalogueSchema } from "./schema";
import { catalogueV127 } from "./v1.27";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV127);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
