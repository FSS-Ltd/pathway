import { catalogueSchema } from "./schema";
import { catalogueV110 } from "./v1.10";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV110);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
