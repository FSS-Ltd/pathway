import { catalogueSchema } from "./schema";
import { catalogueV134 } from "./v1.34";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV134);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
