import { catalogueSchema } from "./schema";
import { catalogueV140 } from "./v1.40";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV140);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
