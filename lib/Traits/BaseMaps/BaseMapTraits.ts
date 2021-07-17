import CatalogMemberFactory from "../../Models/CatalogMemberFactory";
import modelReferenceTrait from "../Decorators/modelReferenceTrait";
import objectArrayTrait from "../Decorators/objectArrayTrait";
import primitiveArrayTrait from "../Decorators/primitiveArrayTrait";
import primitiveTrait from "../Decorators/primitiveTrait";
import ModelReference from "../ModelReference";
import ModelTraits from "../ModelTraits";

export class BaseMapTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Image",
    description: "Path to the basemap image"
  })
  image?: string;

  @modelReferenceTrait({
    factory: CatalogMemberFactory,
    name: "Base map item",
    description: "Base map item definition"
  })
  item?: ModelReference;
}

export class BaseMapsTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "defaultBaseMapId",
    description:
      "ID of the base map to use as default. This wil be used **before** `defaultBaseMapName`"
  })
  defaultBaseMapId?: string;

  @primitiveTrait({
    type: "string",
    name: "defaultBaseMapName",
    description: "Name of the base map to use as default"
  })
  defaultBaseMapName?: string;

  @primitiveTrait({
    type: "string",
    name: "previewBaseMapId",
    description: "ID of the base map to use for data preview"
  })
  previewBaseMapId?: string = "basemap-positron";

  @objectArrayTrait<BaseMapTraits>({
    type: BaseMapTraits,
    idProperty: "item",
    name: "items",
    description:
      "Array of catalog items definitions that can be used as a Base map."
  })
  items?: BaseMapTraits[];

  @primitiveArrayTrait({
    type: "string",
    name: "useBaseMaps",
    description:
      "Array of base maps ids that is available to user. Use this do define order of the base maps in settings panel. Leave undefined to show all basemaps."
  })
  useBaseMaps?: string[];
}
