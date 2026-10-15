import { catalogueSchema } from "./schema";
import { catalogueV1 } from "./v1";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV1);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
