import { VectorTileFeature } from "@mapbox/vector-tile";
import i18next from "i18next";
import { clone } from "lodash-es";
import { action, computed, observable, runInAction } from "mobx";
import ImageryLayerFeatureInfo from "terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo";
import isDefined from "../Core/isDefined";
import MapboxVectorTileImageryProvider from "../Map/MapboxVectorTileImageryProvider";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import MappableMixin, { MapItem } from "../ModelMixins/MappableMixin";
import UrlMixin from "../ModelMixins/UrlMixin";
import LegendTraits, { LegendItemTraits } from "../Traits/LegendTraits";
import MapboxVectorTileCatalogItemTraits from "../Traits/MapboxVectorTileCatalogItemTraits";
import CreateModel from "./CreateModel";
import createStratumInstance from "./createStratumInstance";
import LoadableStratum from "./LoadableStratum";
import { BaseModel } from "./Model";
import StratumOrder from "./StratumOrder";

class MapboxVectorTileLoadableStratum extends LoadableStratum(
  MapboxVectorTileCatalogItemTraits
) {
  static stratumName = "MapboxVectorTileLoadable";

  constructor(readonly item: MapboxVectorTileCatalogItem) {
    super();
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new MapboxVectorTileLoadableStratum(
      newModel as MapboxVectorTileCatalogItem
    ) as this;
  }

  static async load(item: MapboxVectorTileCatalogItem) {
    return new MapboxVectorTileLoadableStratum(item);
  }

  @computed get legends() {
    return [
      createStratumInstance(LegendTraits, {
        items: [
          createStratumInstance(LegendItemTraits, {
            color: this.item.fillColor,
            outlineColor: this.item.lineColor,
            title: this.item.name
          })
        ]
      })
    ];
  }
}

StratumOrder.addLoadStratum(MapboxVectorTileLoadableStratum.stratumName);

class MapboxVectorTileCatalogItem extends MappableMixin(
  UrlMixin(CatalogMemberMixin(CreateModel(MapboxVectorTileCatalogItemTraits)))
) {
  @observable
  public readonly forceProxy = true;

  static readonly type = "mvt";

  get type() {
    return MapboxVectorTileCatalogItem.type;
  }

  get typeName() {
    return i18next.t("models.mapboxVectorTile.name");
  }
  readonly canZoomTo = true;

  async forceLoadMetadata() {
    const stratum = await MapboxVectorTileLoadableStratum.load(this);
    runInAction(() => {
      this.strata.set(MapboxVectorTileLoadableStratum.stratumName, stratum);
    });
  }

  @computed
  get imageryProvider(): MapboxVectorTileImageryProvider | undefined {
    if (this.url === undefined || this.layer === undefined) {
      return;
    }

    return new MapboxVectorTileImageryProvider({
      url: this.url,
      layerName: this.layer,
      styleFunc: (opts => () => ({
        ...opts,
        lineJoin: "miter" as CanvasLineJoin,
        lineWidth: 1
      }))({ fillStyle: this.fillColor, strokeStyle: this.lineColor }),
      minimumZoom: this.minimumZoom,
      maximumNativeZoom: this.maximumNativeZoom,
      maximumZoom: this.maximumZoom,
      uniqueIdProp: this.idProperty,
      featureInfoFunc: this.featureInfoFromFeature,
      credit: this.attribution
    });
  }

  protected forceLoadMapItems(): Promise<void> {
    return Promise.resolve();
  }

  @computed
  get mapItems(): MapItem[] {
    if (this.isLoadingMapItems || this.imageryProvider === undefined) {
      return [];
    }

    return [
      {
        imageryProvider: this.imageryProvider,
        show: this.show,
        alpha: this.opacity,
        clippingRectangle: this.clipToRectangle
          ? this.cesiumRectangle
          : undefined
      }
    ];
  }

  @action.bound
  featureInfoFromFeature(feature: VectorTileFeature) {
    const featureInfo = new ImageryLayerFeatureInfo();
    if (isDefined(this.nameProperty)) {
      featureInfo.name = feature.properties[this.nameProperty];
    }
    (featureInfo as any).properties = clone(feature.properties);
    featureInfo.data = {
      id: feature.properties[this.idProperty]
    }; // For highlight
    return featureInfo;
  }
}

export default MapboxVectorTileCatalogItem;
