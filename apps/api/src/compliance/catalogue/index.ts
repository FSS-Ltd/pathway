import { catalogueSchema } from "./schema";
import { catalogueV128 } from "./v1.28";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV128);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
