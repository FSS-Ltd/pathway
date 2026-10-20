import { catalogueSchema } from "./schema";
import { catalogueV135 } from "./v1.35";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV135);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
