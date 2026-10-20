import { catalogueSchema } from "./schema";
import { catalogueV129 } from "./v1.29";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV129);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
