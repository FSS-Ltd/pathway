import { catalogueSchema } from "./schema";
import { catalogueV12 } from "./v1.2";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV12);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
