import { catalogueSchema } from "./schema";
import { catalogueV115 } from "./v1.15";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV115);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
