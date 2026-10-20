import { catalogueSchema } from "./schema";
import { catalogueV116 } from "./v1.16";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV116);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
