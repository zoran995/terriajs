import { JsonObject } from "../Core/Json";
import anyTrait from "./anyTrait";
import CatalogMemberTraits from "./CatalogMemberTraits";
import DiffableTraits from "./DiffableTraits";
import ExportableTraits from "./ExportableTraits";
import FeatureInfoTraits from "./FeatureInfoTraits";
import GetCapabilitiesTraits from "./GetCapabilitiesTraits";
import LayerOrderingTraits from "./LayerOrderingTraits";
import LegendTraits from "./LegendTraits";
import MappableTraits from "./MappableTraits";
import mixTraits from "./mixTraits";
import ModelTraits from "./ModelTraits";
import objectArrayTrait from "./objectArrayTrait";
import objectTrait from "./objectTrait";
import primitiveArrayTrait from "./primitiveArrayTrait";
import primitiveTrait from "./primitiveTrait";
import RasterLayerTraits from "./RasterLayerTraits";
import SplitterTraits from "./SplitterTraits";
import TimeFilterTraits from "./TimeFilterTraits";
import UrlTraits from "./UrlTraits";

export const SUPPORTED_CRS_3857 = ["EPSG:3857", "EPSG:900913"];
export const SUPPORTED_CRS_4326 = ["EPSG:4326", "CRS:84", "EPSG:4283"];

export class WebMapServiceAvailableStyleTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Style Name",
    description: "The name of the style."
  })
  name?: string;

  @primitiveTrait({
    type: "string",
    name: "Title",
    description: "The title of the style."
  })
  title?: string;

  @primitiveTrait({
    type: "string",
    name: "Abstract",
    description: "The abstract describing the style."
  })
  abstract?: string;

  @objectTrait({
    type: LegendTraits,
    name: "Style Name",
    description: "The name of the style."
  })
  legend?: LegendTraits;
}

export class WebMapServiceAvailableLayerStylesTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Layer Name",
    description: "The name of the layer for which styles are available."
  })
  layerName?: string;

  @objectArrayTrait({
    type: WebMapServiceAvailableStyleTraits,
    name: "Styles",
    description: "The styles available for this layer.",
    idProperty: "name"
  })
  styles?: WebMapServiceAvailableStyleTraits[];
}

export class WebMapServiceAvailableDimensionTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Dimension Name",
    description: "The name of the dimension."
  })
  name?: string;

  @primitiveArrayTrait({
    type: "string",
    name: "Dimension values",
    description: "Possible dimension values."
  })
  values?: string[];

  @primitiveTrait({
    type: "string",
    name: "Units",
    description: "The units of the dimension."
  })
  units?: string;

  @primitiveTrait({
    type: "string",
    name: "Unit Symbol",
    description: "The unitSymbol of the dimension."
  })
  unitSymbol?: string;

  @primitiveTrait({
    type: "string",
    name: "Default",
    description: "The default value for the dimension."
  })
  default?: string;

  @primitiveTrait({
    type: "boolean",
    name: "Multiple Values",
    description: "Can the dimension support multiple values."
  })
  multipleValues?: boolean;

  @primitiveTrait({
    type: "boolean",
    name: "Nearest Value",
    description: "The nearest value of the dimension."
  })
  nearestValue?: boolean;
}

export class WebMapServiceAvailableLayerDimensionsTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "Layer Name",
    description: "The name of the layer for which dimensions are available."
  })
  layerName?: string;

  @objectArrayTrait({
    type: WebMapServiceAvailableDimensionTraits,
    name: "Dimensions",
    description: "The dimensions available for this layer.",
    idProperty: "name"
  })
  dimensions?: WebMapServiceAvailableDimensionTraits[];
}

/**
 * Creates a single item in the catalog from one or many WMS layers.<br/>
 * <strong>Note:</strong> <i>To present all layers in an available WMS as individual items in the catalog use the \`WebMapServiceCatalogGroup\`.</i>
 * @example
 * {
 *   "type": "wms",
 *   "name": "Mangrove Cover",
 *   "url": "https://ows.services.dea.ga.gov.au",
 *   "layers": "mangrove_cover_v2_0_2"
 * }
 */
export default class WebMapServiceCatalogItemTraits extends mixTraits(
  ExportableTraits,
  DiffableTraits,
  FeatureInfoTraits,
  LayerOrderingTraits,
  SplitterTraits,
  TimeFilterTraits,
  GetCapabilitiesTraits,
  RasterLayerTraits,
  UrlTraits,
  MappableTraits,
  CatalogMemberTraits
) {
  @primitiveTrait({
    type: "string",
    name: "Layer(s)",
    description: "The layer or layers to display (comma separated values)."
  })
  layers?: string;

  @primitiveTrait({
    type: "string",
    name: "Style(s)",
    description:
      "The styles to use with each of the `Layer(s)` (comma separated values). This maps one-to-one with `Layer(s)`"
  })
  styles?: string;

  @primitiveTrait({
    type: "string",
    name: "Style(s)",
    description: `CRS to use with WMS layers. We support Web Mercator (${SUPPORTED_CRS_3857.join(
      ", "
    )}) and WGS 84 (${SUPPORTED_CRS_4326.join(", ")})`
  })
  crs?: string;

  @anyTrait({
    name: "Dimensions",
    description:
      "Dimension parameters used to request a particular layer along one or more dimensional axes (including elevation, excluding time). Do not include `_dim` prefx for parameter keys. These dimensions will be applied to all layers (if applicable)"
  })
  dimensions?: { [key: string]: string };

  @objectArrayTrait({
    type: WebMapServiceAvailableLayerStylesTraits,
    name: "Available Styles",
    description: "The available styles.",
    idProperty: "layerName"
  })
  availableStyles?: WebMapServiceAvailableLayerStylesTraits[];

  @objectArrayTrait({
    type: WebMapServiceAvailableLayerDimensionsTraits,
    name: "Available Dimensions",
    description: "The available dimensions.",
    idProperty: "layerName"
  })
  availableDimensions?: WebMapServiceAvailableLayerDimensionsTraits[];

  @anyTrait({
    name: "Parameters",
    description:
      "Additional parameters to pass to the MapServer when requesting images. Style parameters are stored as CSV in `styles`, dimension parameters are stored in `dimensions`."
  })
  parameters?: JsonObject;

  @primitiveTrait({
    type: "number",
    name: "Tile width (in pixels)",
    description:
      "Tile width in pixels. This will be added to `GetMap` requests for map tiles using the `width` parameter. Default value is 256 pixels"
  })
  tileWidth: number = 256;

  @primitiveTrait({
    type: "number",
    name: "Tile height (in pixels)",
    description:
      "Tile height in pixels. This will be added to `GetMap` requests for map tiles using the `height` parameter. Default value is 256 pixels"
  })
  tileHeight: number = 256;

  @primitiveTrait({
    type: "number",
    name: "Minimum Scale Denominator",
    description:
      "The denominator of the largest scale (smallest denominator) for which tiles should be requested. " +
      "For example, if this value is 1000, then tiles representing a scale larger than 1:1000 (i.e. " +
      "numerically smaller denominator, when zooming in closer) will not be requested.  Instead, tiles of " +
      "the largest-available scale, as specified by this property, will be used and will simply get " +
      "blurier as the user zooms in closer."
  })
  minScaleDenominator?: number;

  @primitiveTrait({
    type: "boolean",
    name: "Hide Layer After Minimum Scale Denominator",
    description:
      "True to hide tiles when the `Minimum Scale Denominator` is exceeded. If false, we can zoom in arbitrarily close to the (increasingly blurry) layer."
  })
  hideLayerAfterMinScaleDenominator: boolean = false;

  @primitiveTrait({
    type: "number",
    name: "Maximum Refresh Intervals",
    description:
      "The maximum number of discrete times that can be created by a single " +
      "date range, when specified in the format time/time/periodicity. E.g. " +
      "`2015-04-27T16:15:00/2015-04-27T18:45:00/PT15M` has 11 times."
  })
  maxRefreshIntervals: number = 1000;

  @primitiveTrait({
    type: "boolean",
    name: "Disable dimension selectors",
    description: "When true, disables the dimension selectors in the workbench."
  })
  disableDimensionSelectors = false;

  @primitiveTrait({
    type: "string",
    name: "Linked WCS URL",
    description:
      "Gets or sets the URL of a WCS that enables clip-and-ship for this WMS item."
  })
  linkedWcsUrl?: string;

  @primitiveTrait({
    type: "string",
    name: "Linked WCS Coverage Name",
    description:
      "Gets or sets the coverage name for linked WCS for clip-and-ship."
  })
  linkedWcsCoverage?: string;

  @primitiveTrait({
    type: "string",
    name: "Is GeoServer",
    description: "True if this WMS is a GeoServer; otherwise, false."
  })
  isGeoServer: boolean = false;

  @primitiveTrait({
    type: "string",
    name: "Is Esri",
    description: "True if this WMS is from Esri; otherwise, false."
  })
  isEsri: boolean = false;

  @primitiveTrait({
    type: "boolean",
    name: "Is Thredds",
    description: "True if this WMS is from a THREDDS server; otherwise, false."
  })
  isThredds: boolean = false;

  @primitiveTrait({
    type: "boolean",
    name: "Is NcWMS",
    description: "True if this WMS supports NcWMS."
  })
  isNcWMS: boolean = false;

  @primitiveTrait({
    type: "boolean",
    name: "Supports color scale range",
    description:
      "Gets or sets whether this WMS server has been identified as supporting the COLORSCALERANGE parameter."
  })
  supportsColorScaleRange: boolean = false;

  @primitiveTrait({
    type: "boolean",
    name: "Supports GetLegendGraphic requests",
    description:
      "Gets or sets whether this WMS server supports GetLegendGraphic requests."
  })
  supportsGetLegendGraphic: boolean = false;

  @primitiveTrait({
    type: "number",
    name: "Color scale minimum",
    description:
      "The minumum of the color scale range. Because COLORSCALERANGE is a non-standard property supported by ncWMS servers, this property is ignored unless WebMapServiceCatalogItem's supportsColorScaleRange is true. WebMapServiceCatalogItem's colorScaleMaximum must be set as well."
  })
  colorScaleMinimum: number = -50;

  @primitiveTrait({
    type: "number",
    name: "Color scale maximum",
    description:
      "The maximum of the color scale range. Because COLORSCALERANGE is a non-standard property supported by ncWMS servers, this property is ignored unless WebMapServiceCatalogItem's supportsColorScaleRange is true. WebMapServiceCatalogItem's colorScaleMinimum must be set as well."
  })
  colorScaleMaximum: number = 50;
}
