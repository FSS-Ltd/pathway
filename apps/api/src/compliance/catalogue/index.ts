import { catalogueSchema } from "./schema";
import { catalogueV142 } from "./v1.42";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV142);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
