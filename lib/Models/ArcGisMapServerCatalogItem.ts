import i18next from "i18next";
import uniqWith from "lodash-es/uniqWith";
import { computed, runInAction } from "mobx";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import WebMercatorTilingScheme from "terriajs-cesium/Source/Core/WebMercatorTilingScheme";
import ArcGisMapServerImageryProvider from "terriajs-cesium/Source/Scene/ArcGisMapServerImageryProvider";
import ImageryProvider from "terriajs-cesium/Source/Scene/ImageryProvider";
import URI from "urijs";
import createDiscreteTimesFromIsoSegments from "../Core/createDiscreteTimes";
import createTransformerAllowUndefined from "../Core/createTransformerAllowUndefined";
import filterOutUndefined from "../Core/filterOutUndefined";
import isDefined from "../Core/isDefined";
import loadJson from "../Core/loadJson";
import replaceUnderscores from "../Core/replaceUnderscores";
import TerriaError from "../Core/TerriaError";
import proj4definitions from "../Map/Proj4Definitions";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import DiscretelyTimeVaryingMixin from "../ModelMixins/DiscretelyTimeVaryingMixin";
import MappableMixin, { ImageryParts } from "../ModelMixins/MappableMixin";
import UrlMixin from "../ModelMixins/UrlMixin";
import ArcGisMapServerCatalogItemTraits from "../Traits/ArcGisMapServerCatalogItemTraits";
import { InfoSectionTraits } from "../Traits/CatalogMemberTraits";
import DiscreteTimeTraits from "../Traits/DiscreteTimeTraits";
import LegendTraits, { LegendItemTraits } from "../Traits/LegendTraits";
import { RectangleTraits } from "../Traits/MappableTraits";
import CreateModel from "./CreateModel";
import createStratumInstance from "./createStratumInstance";
import getToken from "./getToken";
import LoadableStratum from "./LoadableStratum";
import { BaseModel } from "./Model";
import proxyCatalogItemUrl from "./proxyCatalogItemUrl";
import StratumFromTraits from "./StratumFromTraits";
import StratumOrder from "./StratumOrder";

const proj4 = require("proj4").default;

interface RectangleExtent {
  east: number;
  south: number;
  west: number;
  north: number;
}

interface DocumentInfo {
  Author?: string;
  Title?: string;
}

interface TimeInfo {
  timeExtent: [number, number];
}

interface MapServer {
  documentInfo?: DocumentInfo;
  description?: string;
  copyrightText?: string;
  mapName?: string;
  timeInfo?: TimeInfo;
  layers: Layer[];
  fullExtent: Extent;
}

interface SpatialReference {
  wkid?: number;
}

interface Extent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: SpatialReference;
}

interface Layer {
  id: number;
  name: string;
  maxScale: number;

  // The following is pulled from <mapservice-url>/layers or <mapservice-url>/<layerOrTableId>
  description?: string;
  copyrightText?: string;
  extent?: Extent;
}

interface Legend {
  label?: string;
  contentType: string;
  imageData: string;
  width: number;
  height: number;
}

interface Legends {
  layers?: { layerId: number; layerName: string; legend: Legend[] }[];
}

class MapServerStratum extends LoadableStratum(
  ArcGisMapServerCatalogItemTraits
) {
  static stratumName = "mapServer";

  constructor(
    private readonly _item: ArcGisMapServerCatalogItem,
    private readonly _mapServer: MapServer,
    private readonly _allLayers: Layer[],
    private readonly _legends: Legends | undefined,
    readonly token: string | undefined
  ) {
    super();
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new MapServerStratum(
      newModel as ArcGisMapServerCatalogItem,
      this._mapServer,
      this._allLayers,
      this._legends,
      this.token
    ) as this;
  }

  get mapServerData() {
    return this._mapServer;
  }

  static async load(item: ArcGisMapServerCatalogItem) {
    if (!isDefined(item.uri)) {
      throw new TerriaError({
        title: i18next.t("models.arcGisMapServerCatalogItem.invalidUrlTitle"),
        message: i18next.t(
          "models.arcGisMapServerCatalogItem.invalidUrlMessage"
        )
      });
    }

    let token: string | undefined;
    if (isDefined(item.tokenUrl)) {
      token = await getToken(item.terria, item.tokenUrl, item.url);
    }

    let layerId;
    const lastSegment = item.uri.segment(-1);
    if (lastSegment && lastSegment.match(/\d+/)) {
      // URL is a single REST layer, like .../arcgis/rest/services/Society/Society_SCRC/MapServer/16
      layerId = lastSegment;
    }

    let serviceUri = getBaseURI(item);
    let layersUri = getBaseURI(item).segment(layerId || "layers"); // either 'layers' or a number
    let legendUri = getBaseURI(item).segment("legend");

    if (isDefined(token)) {
      serviceUri = serviceUri.addQuery("token", token);
      layersUri = layersUri.addQuery("token", token);
      legendUri = legendUri.addQuery("token", token);
    }

    // TODO: if tokenUrl, fetch and pass token as parameter
    const serviceMetadata = await getJson(item, serviceUri);

    if (!isDefined(serviceMetadata)) {
      throw new TerriaError({
        title: i18next.t("models.arcGisService.invalidServerTitle"),
        message: i18next.t("models.arcGisService.invalidServerMessage", {
          cors: '<a href="http://enable-cors.org/" target="_blank">CORS</a>',
          appName: item.terria.appName,
          email:
            '<a href="mailto:' +
            item.terria.supportEmail +
            '">' +
            item.terria.supportEmail +
            "</a>"
        })
      });
    }

    let layersMetadataResponse = await getJson(item, layersUri);
    const legendMetadata = await getJson(item, legendUri);

    // TODO: some error handling on these requests would be nice

    let layers: Layer[] | undefined;

    // Use the slightly more basic layer metadata
    if (
      isDefined(layersMetadataResponse) &&
      isDefined(serviceMetadata.layers)
    ) {
      layers = serviceMetadata.layers;
    } else {
      if (isDefined(layersMetadataResponse.layers)) {
        layers = layersMetadataResponse.layers;
        // If layersMetadata is only a single layer -> shove into an array
      } else if (isDefined(layersMetadataResponse.id)) {
        layers = [layersMetadataResponse];
      }
    }

    if (!isDefined(layers) || layers.length === 0) {
      throw new TerriaError({
        title: i18next.t(
          "models.arcGisMapServerCatalogItem.noLayersFoundMessage"
        ),
        message: i18next.t(
          "models.arcGisMapServerCatalogItem.noLayersFoundMessage",
          item
        )
      });
    }

    const stratum = new MapServerStratum(
      item,
      serviceMetadata,
      layers,
      legendMetadata,
      token
    );
    return stratum;
  }

  @computed get allLayers() {
    return filterOutUndefined(findLayers(this._allLayers, this._item.layers));
  }

  @computed get maximumScale() {
    return Math.min(
      ...filterOutUndefined(this.allLayers.map(({ maxScale }) => maxScale))
    );
  }

  @computed get name() {
    // single layer
    if (
      this.allLayers.length === 1 &&
      this.allLayers[0].name &&
      this.allLayers[0].name.length > 0
    ) {
      return replaceUnderscores(this.allLayers[0].name);
    }

    // group of layers
    else if (
      this._mapServer.documentInfo &&
      this._mapServer.documentInfo.Title &&
      this._mapServer.documentInfo.Title.length > 0
    ) {
      return replaceUnderscores(this._mapServer.documentInfo.Title);
    } else if (this._mapServer.mapName && this._mapServer.mapName.length > 0) {
      return replaceUnderscores(this._mapServer.mapName);
    }
  }

  @computed get dataCustodian() {
    if (
      this._mapServer.documentInfo &&
      this._mapServer.documentInfo.Author &&
      this._mapServer.documentInfo.Author.length > 0
    ) {
      return this._mapServer.documentInfo.Author;
    }
  }

  @computed get rectangle() {
    const rectangle: RectangleExtent = {
      west: Infinity,
      south: Infinity,
      east: -Infinity,
      north: -Infinity
    };
    // If we only have the summary layer info
    if (!("extent" in this._allLayers[0])) {
      getRectangleFromLayer(this.mapServerData.fullExtent, rectangle);
    } else {
      getRectangleFromLayers(rectangle, this._allLayers);
    }
    if (rectangle.west === Infinity) return undefined;
    return createStratumInstance(RectangleTraits, rectangle);
  }

  @computed get discreteTimes() {
    if (this._mapServer.timeInfo === undefined) return undefined;
    // Add union type - as `time` is always defined
    const result: (StratumFromTraits<DiscreteTimeTraits> & {
      time: string;
    })[] = [];

    createDiscreteTimesFromIsoSegments(
      result,
      new Date(this._mapServer.timeInfo.timeExtent[0]).toISOString(),
      new Date(this._mapServer.timeInfo.timeExtent[1]).toISOString(),
      undefined,
      this._item.maxRefreshIntervals
    );
    return result;
  }

  @computed get info() {
    const layer = this.allLayers[0];
    if (!isDefined(layer)) {
      return [];
    }

    return [
      createStratumInstance(InfoSectionTraits, {
        name: i18next.t("models.arcGisMapServerCatalogItem.dataDescription"),
        content: layer.description
      }),
      createStratumInstance(InfoSectionTraits, {
        name: i18next.t("models.arcGisMapServerCatalogItem.serviceDescription"),
        content: this._mapServer.description
      }),
      createStratumInstance(InfoSectionTraits, {
        name: i18next.t("models.arcGisMapServerCatalogItem.copyrightText"),
        content:
          isDefined(layer.copyrightText) && layer.copyrightText.length > 0
            ? layer.copyrightText
            : this._mapServer.copyrightText
      })
    ];
  }

  @computed get legends() {
    const layers = isDefined(this._item.layers)
      ? this._item.layers.split(",")
      : [];
    const noDataRegex = /^No[\s_-]?Data$/i;
    const labelsRegex = /_Labels$/;

    let items: StratumFromTraits<LegendItemTraits>[] = [];

    (this._legends?.layers || []).forEach(l => {
      if (noDataRegex.test(l.layerName) || labelsRegex.test(l.layerName)) {
        return;
      }
      if (
        layers.length > 0 &&
        layers.indexOf(l.layerId.toString()) < 0 &&
        layers.indexOf(l.layerName) < 0
      ) {
        // layer not selected
        return;
      }

      l.legend.forEach(leg => {
        const title = replaceUnderscores(
          leg.label !== "" ? leg.label : l.layerName
        );
        const dataUrl = "data:" + leg.contentType + ";base64," + leg.imageData;
        items.push(
          createStratumInstance(LegendItemTraits, {
            title,
            imageUrl: dataUrl,
            imageWidth: leg.width,
            imageHeight: leg.height
          })
        );
      });
    });

    items = uniqWith(items, (a, b) => a.imageUrl === b.imageUrl);

    return [createStratumInstance(LegendTraits, { items })];
  }
}

StratumOrder.addLoadStratum(MapServerStratum.stratumName);

export default class ArcGisMapServerCatalogItem extends MappableMixin(
  UrlMixin(
    DiscretelyTimeVaryingMixin(
      CatalogMemberMixin(CreateModel(ArcGisMapServerCatalogItemTraits))
    )
  )
) {
  static readonly type = "esri-mapServer";
  get typeName() {
    return i18next.t("models.arcGisMapServerCatalogItem.name");
  }

  readonly supportsSplitting = true;
  readonly canZoomTo = true;

  get type() {
    return ArcGisMapServerCatalogItem.type;
  }

  protected forceLoadMetadata(): Promise<void> {
    return MapServerStratum.load(this).then(stratum => {
      runInAction(() => {
        this.strata.set(MapServerStratum.stratumName, stratum);
      });
    });
  }

  protected forceLoadMapItems(): Promise<void> {
    return Promise.resolve();
  }

  @computed get cacheDuration(): string {
    if (isDefined(super.cacheDuration)) {
      return super.cacheDuration;
    }
    return "1d";
  }

  @computed
  get discreteTimes() {
    const mapServerStratum: MapServerStratum | undefined = this.strata.get(
      MapServerStratum.stratumName
    ) as MapServerStratum;
    return mapServerStratum?.discreteTimes;
  }

  @computed
  private get _currentImageryParts(): ImageryParts | undefined {
    const dateAsUnix: string | undefined =
      this.currentDiscreteTimeTag === undefined
        ? undefined
        : new Date(this.currentDiscreteTimeTag).getTime().toString();

    const imageryProvider = this._createImageryProvider(dateAsUnix);
    if (imageryProvider === undefined) {
      return undefined;
    }
    return {
      imageryProvider,
      alpha: this.opacity,
      show: this.show,
      clippingRectangle: this.clipToRectangle ? this.cesiumRectangle : undefined
    };
  }

  @computed
  private get _nextImageryParts(): ImageryParts | undefined {
    if (this.nextDiscreteTimeTag) {
      const dateAsUnix: number = new Date(this.nextDiscreteTimeTag).getTime();
      const imageryProvider = this._createImageryProvider(
        dateAsUnix.toString()
      );
      if (imageryProvider === undefined) {
        return undefined;
      }

      imageryProvider.enablePickFeatures = false;

      return {
        imageryProvider,
        alpha: 0.0,
        show: true,
        clippingRectangle: this.clipToRectangle
          ? this.cesiumRectangle
          : undefined
      };
    } else {
      return undefined;
    }
  }

  private _createImageryProvider = createTransformerAllowUndefined(
    (time: string | undefined): ArcGisMapServerImageryProvider | undefined => {
      const stratum = <MapServerStratum>(
        this.strata.get(MapServerStratum.stratumName)
      );

      if (!isDefined(this.url) || !isDefined(stratum)) {
        return;
      }

      const params: any = Object.assign({}, this.parameters);
      if (time !== undefined) {
        params.time = time;
      }

      const maximumLevel = maximumScaleToLevel(this.maximumScale);
      const dynamicRequired = this.layers && this.layers.length > 0;
      const layers = this.layerIds || this.layers;
      const imageryProvider = new ArcGisMapServerImageryProvider({
        url: cleanAndProxyUrl(this, getBaseURI(this).toString()),
        layers: layers,
        tilingScheme: new WebMercatorTilingScheme(),
        maximumLevel: maximumLevel,
        parameters: params,
        enablePickFeatures: this.allowFeaturePicking,
        usePreCachedTilesIfAvailable: !dynamicRequired,
        mapServerData: stratum.mapServerData,
        token: stratum.token,
        credit: this.attribution
      });

      const maximumLevelBeforeMessage = maximumScaleToLevel(
        this.maximumScaleBeforeMessage
      );

      if (isDefined(maximumLevelBeforeMessage)) {
        const realRequestImage = imageryProvider.requestImage;
        let messageDisplayed = false;

        imageryProvider.requestImage = (x, y, level) => {
          if (level > maximumLevelBeforeMessage) {
            if (!messageDisplayed) {
              this.terria.error.raiseEvent(
                new TerriaError({
                  title: "Dataset will not be shown at this scale",
                  message:
                    'The "' +
                    this.name +
                    '" dataset will not be shown when zoomed in this close to the map because the data custodian has ' +
                    "indicated that the data is not intended or suitable for display at this scale.  Click the dataset's Info button on the " +
                    "Now Viewing tab for more information about the dataset and the data custodian."
                })
              );
              messageDisplayed = true;
            }

            if (!this.showTilesAfterMessage) {
              return (<any>ImageryProvider.loadImage)(
                imageryProvider,
                this.terria.baseUrl + "images/blank.png"
              );
            }
          }
          return realRequestImage.call(imageryProvider, x, y, level);
        };
      }

      return imageryProvider;
    }
  );

  @computed
  get mapItems() {
    const result = [];

    const current = this._currentImageryParts;
    if (current) {
      result.push(current);
    }

    const next = this._nextImageryParts;
    if (next) {
      result.push(next);
    }

    return result;
  }

  @computed get layers() {
    if (super.layers) {
      return super.layers;
    }

    if (isDefined(this.uri)) {
      const lastSegment = this.uri.segment(-1);
      if (isDefined(lastSegment) && lastSegment.match(/\d+/)) {
        return lastSegment;
      }
    }
  }

  @computed
  get layerIds(): string | undefined {
    const stratum = <MapServerStratum>(
      this.strata.get(MapServerStratum.stratumName)
    );
    const ids = stratum ? stratum.allLayers.map(l => l.id) : [];
    return ids.length === 0 ? undefined : ids.join(",");
  }

  @computed get allSelectedLayers() {
    const stratum = <MapServerStratum>(
      this.strata.get(MapServerStratum.stratumName)
    );
    if (!isDefined(stratum)) {
      return [];
    }

    if (!isDefined(this.layers)) {
      // if no layer is specified, return all layers
      return stratum.allLayers;
    }

    const layerIds = this.layers.split(",");
    return stratum.allLayers.filter(({ id }) =>
      layerIds.find(x => x == id.toString())
    );
  }
}

function getBaseURI(item: ArcGisMapServerCatalogItem) {
  const uri = new URI(item.url);
  const lastSegment = uri.segment(-1);
  if (lastSegment && lastSegment.match(/\d+/)) {
    uri.segment(-1, "");
  }
  return uri;
}

async function getJson(item: ArcGisMapServerCatalogItem, uri: any) {
  try {
    const response = await loadJson(
      proxyCatalogItemUrl(item, uri.addQuery("f", "json").toString())
    );
    return response;
  } catch (err) {
    console.log(err);
    return undefined;
  }
}

/* Given a comma-separated string of layer names, returns the layer objects corresponding to them. */
function findLayers(layers: Layer[], names: string | undefined) {
  function findLayer(layers: Layer[], id: string) {
    var idLowerCase = id.toLowerCase();
    var foundByName;
    for (var i = 0; i < layers.length; ++i) {
      var layer = layers[i];
      if (layer.id.toString() === id) {
        return layer;
      } else if (
        isDefined(layer.name) &&
        layer.name.toLowerCase() === idLowerCase
      ) {
        foundByName = layer;
      }
    }
    return foundByName;
  }

  if (!isDefined(names)) {
    // If a list of layers is not specified, we're using all layers.
    return layers;
  }
  return names.split(",").map(function(id) {
    return findLayer(layers, id);
  });
}

function maximumScaleToLevel(maximumScale: number | undefined) {
  if (!isDefined(maximumScale) || maximumScale <= 0.0) {
    return undefined;
  }

  const dpi = 96; // Esri default DPI, unless we specify otherwise.
  const centimetersPerInch = 2.54;
  const centimetersPerMeter = 100;
  const dotsPerMeter = (dpi * centimetersPerMeter) / centimetersPerInch;
  const tileWidth = 256;

  const circumferenceAtEquator = 2 * Math.PI * Ellipsoid.WGS84.maximumRadius;
  const distancePerPixelAtLevel0 = circumferenceAtEquator / tileWidth;
  const level0ScaleDenominator = distancePerPixelAtLevel0 * dotsPerMeter;

  // 1e-6 epsilon from WMS 1.3.0 spec, section 7.2.4.6.9.
  const ratio = level0ScaleDenominator / (maximumScale - 1e-6);
  const levelAtMinScaleDenominator = Math.log(ratio) / Math.log(2);
  return levelAtMinScaleDenominator | 0;
}

function updateBbox(extent: Extent, rectangle: RectangleExtent) {
  if (extent.xmin < rectangle.west) rectangle.west = extent.xmin;
  if (extent.ymin < rectangle.south) rectangle.south = extent.ymin;
  if (extent.xmax > rectangle.east) rectangle.east = extent.xmax;
  if (extent.ymax > rectangle.north) rectangle.north = extent.ymax;
}

function getRectangleFromLayer(extent: Extent, rectangle: RectangleExtent) {
  if (
    isDefined(extent) &&
    extent.spatialReference &&
    extent.spatialReference.wkid
  ) {
    const wkid = "EPSG:" + extent.spatialReference.wkid;
    if (extent.spatialReference.wkid === 4326) {
      return updateBbox(extent, rectangle);
    }

    if (!isDefined((proj4definitions as any)[wkid])) {
      return;
    }

    const source = new proj4.Proj((proj4definitions as any)[wkid]);
    const dest = new proj4.Proj("EPSG:4326");

    let p = proj4(source, dest, [extent.xmin, extent.ymin]);

    const west = p[0];
    const south = p[1];

    p = proj4(source, dest, [extent.xmax, extent.ymax]);

    const east = p[0];
    const north = p[1];

    return updateBbox(
      { xmin: west, ymin: south, xmax: east, ymax: north },
      rectangle
    );
  }
}

function getRectangleFromLayers(rectangle: RectangleExtent, layers: Layer[]) {
  layers.forEach(function(item) {
    item.extent && getRectangleFromLayer(item.extent, rectangle);
  });
}

function cleanAndProxyUrl(
  catalogItem: ArcGisMapServerCatalogItem,
  url: string
) {
  return proxyCatalogItemUrl(catalogItem, cleanUrl(url));
}

function cleanUrl(url: string) {
  // Strip off the search portion of the URL
  var uri = new URI(url);
  uri.search("");
  return uri.toString();
}
