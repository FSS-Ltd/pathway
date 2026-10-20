import { catalogueSchema } from "./schema";
import { catalogueV119 } from "./v1.19";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV119);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
