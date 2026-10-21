import { catalogueSchema } from "./schema";
import { catalogueV141 } from "./v1.41";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV141);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
