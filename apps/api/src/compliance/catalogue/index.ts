import { catalogueSchema } from "./schema";
import { catalogueV15 } from "./v1.5";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV15);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
