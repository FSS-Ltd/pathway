import { catalogueSchema } from "./schema";
import { catalogueV111 } from "./v1.11";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV111);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
