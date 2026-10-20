import { catalogueSchema } from "./schema";
import { catalogueV125 } from "./v1.25";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV125);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
