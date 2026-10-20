import { catalogueSchema } from "./schema";
import { catalogueV126 } from "./v1.26";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV126);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
