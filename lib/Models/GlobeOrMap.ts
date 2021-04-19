import { Feature as GeoJSONFeature, Position } from "geojson";
import { observable, runInAction } from "mobx";
import Cartesian2 from "terriajs-cesium/Source/Core/Cartesian2";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import clone from "terriajs-cesium/Source/Core/clone";
import Color from "terriajs-cesium/Source/Core/Color";
import DeveloperError from "terriajs-cesium/Source/Core/DeveloperError";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import CesiumEvent from "terriajs-cesium/Source/Core/Event";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import ColorMaterialProperty from "terriajs-cesium/Source/DataSources/ColorMaterialProperty";
import ConstantPositionProperty from "terriajs-cesium/Source/DataSources/ConstantPositionProperty";
import ConstantProperty from "terriajs-cesium/Source/DataSources/ConstantProperty";
import Entity from "terriajs-cesium/Source/DataSources/Entity";
import ImageryLayerFeatureInfo from "terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo";
import ImagerySplitDirection from "terriajs-cesium/Source/Scene/ImagerySplitDirection";
import isDefined from "../Core/isDefined";
import LatLonHeight from "../Core/LatLonHeight";
import featureDataToGeoJson from "../Map/featureDataToGeoJson";
import MapboxVectorTileImageryProvider from "../Map/MapboxVectorTileImageryProvider";
import { ProviderCoordsMap } from "../Map/PickedFeatures";
import MappableMixin from "../ModelMixins/MappableMixin";
import MouseCoords from "../ReactViewModels/MouseCoords";
import CameraView from "./CameraView";
import Cesium3DTilesCatalogItem from "./Cesium3DTilesCatalogItem";
import CommonStrata from "./CommonStrata";
import Feature from "./Feature";
import GeoJsonCatalogItem from "./GeoJsonCatalogItem";
import Terria from "./Terria";

require("./ImageryLayerFeatureInfo"); // overrides Cesium's prototype.configureDescriptionFromProperties

export default abstract class GlobeOrMap {
  abstract readonly type: string;
  abstract readonly terria: Terria;
  protected static _featureHighlightName = "___$FeatureHighlight&__";

  private _removeHighlightCallback?: () => Promise<void> | void;
  private _highlightPromise: Promise<void> | undefined;
  private _tilesLoadingCountMax: number = 0;
  protected supportsPolylinesOnTerrain?: boolean;

  // Fired when zoomTo is called
  zoomToEvent: CesiumEvent = new CesiumEvent();

  // This is updated by Leaflet and Cesium objects.
  // Avoid duplicate mousemove events.  Why would we get duplicate mousemove events?  I'm glad you asked:
  // http://stackoverflow.com/questions/17818493/mousemove-event-repeating-every-second/17819113
  // I (Kevin Ring) see this consistently on my laptop when Windows Media Player is running.
  @observable mouseCoords: MouseCoords = new MouseCoords();

  abstract destroy(): void;

  abstract doZoomTo(
    viewOrExtent: CameraView | Rectangle | MappableMixin.MappableMixin,
    flightDurationSeconds: number
  ): void;

  zoomTo(
    viewOrExtent: CameraView | Rectangle | MappableMixin.MappableMixin,
    flightDurationSeconds: number
  ): void {
    this.zoomToEvent.raiseEvent();
    this.doZoomTo(viewOrExtent, flightDurationSeconds);
  }

  abstract getCurrentCameraView(): CameraView;

  /* Gets the current container element.
   */
  abstract getContainer(): Element | undefined;

  abstract pauseMapInteraction(): void;
  abstract resumeMapInteraction(): void;

  abstract notifyRepaintRequired(): void;

  /**
   * Picks features based off a latitude, longitude and (optionally) height.
   * @param latLngHeight The position on the earth to pick.
   * @param providerCoords A map of imagery provider urls to the coords used to get features for those imagery
   *     providers - i.e. x, y, level
   * @param existingFeatures An optional list of existing features to concatenate the ones found from asynchronous picking to.
   */
  abstract pickFromLocation(
    latLngHeight: LatLonHeight,
    providerCoords: ProviderCoordsMap,
    existingFeatures: Feature[]
  ): void;

  /**
   * Return features at a latitude, longitude and (optionally) height for the given imagery layers.
   * @param latLngHeight The position on the earth to pick
   * @param providerCoords A map of imagery provider urls to the tile coords used to get features for those imagery
   * @returns A flat array of all the features for the given tiles that are currently on the map
   */
  abstract getFeaturesAtLocation(
    latLngHeight: LatLonHeight,
    providerCoords: ProviderCoordsMap
  ): Promise<Entity[] | undefined> | void;

  /**
   * Creates a {@see Feature} (based on an {@see Entity}) from a {@see ImageryLayerFeatureInfo}.
   * @param imageryFeature The imagery layer feature for which to create an entity-based feature.
   * @return The created feature.
   */
  protected _createFeatureFromImageryLayerFeature(
    imageryFeature: ImageryLayerFeatureInfo
  ) {
    const feature = new Feature({
      id: imageryFeature.name
    });
    feature.name = imageryFeature.name;
    if (imageryFeature.description) {
      feature.description = new ConstantProperty(imageryFeature.description); // already defined by the new Entity
    }
    feature.properties = imageryFeature.properties;
    feature.data = imageryFeature.data;
    feature.imageryLayer = imageryFeature.imageryLayer;

    if (imageryFeature.position) {
      feature.position = new ConstantPositionProperty(
        Ellipsoid.WGS84.cartographicToCartesian(imageryFeature.position)
      );
    }

    (<any>feature).coords = (<any>imageryFeature).coords;

    return feature;
  }

  /**
   * Adds loading progress for cesium
   */
  protected _updateTilesLoadingCount(tilesLoadingCount: number): void {
    if (tilesLoadingCount > this._tilesLoadingCountMax) {
      this._tilesLoadingCountMax = tilesLoadingCount;
    } else if (tilesLoadingCount === 0) {
      this._tilesLoadingCountMax = 0;
    }

    this.terria.tileLoadProgressEvent.raiseEvent(
      tilesLoadingCount,
      this._tilesLoadingCountMax
    );
  }

  /**
   * Returns the side of the splitter the `position` lies on.
   *
   * @param The screen position.
   * @return The side of the splitter on which `position` lies.
   */
  protected _getSplitterSideForScreenPosition(
    position: Cartesian2 | Cartesian3
  ): ImagerySplitDirection | undefined {
    const container = this.terria.currentViewer.getContainer();
    if (!isDefined(container)) {
      return;
    }

    const splitterX = container.clientWidth * this.terria.splitPosition;
    if (position.x <= splitterX) {
      return ImagerySplitDirection.LEFT;
    } else {
      return ImagerySplitDirection.RIGHT;
    }
  }

  abstract _addVectorTileHighlight(
    imageryProvider: MapboxVectorTileImageryProvider,
    rectangle: Rectangle
  ): () => void;

  async _highlightFeature(feature: Feature | undefined) {
    if (isDefined(this._removeHighlightCallback)) {
      await this._removeHighlightCallback();
      this._removeHighlightCallback = undefined;
      this._highlightPromise = undefined;
    }

    if (isDefined(feature)) {
      let hasGeometry = false;

      if (isDefined(feature._cesium3DTileFeature)) {
        const originalColor = feature._cesium3DTileFeature.color;
        const defaultColor = Color.fromCssColorString("#fffffe");

        // Get the highlight color from the catalogItem trait or default to baseMapContrastColor
        const catalogItem = feature._catalogItem;
        let highlightColor;
        if (catalogItem instanceof Cesium3DTilesCatalogItem) {
          highlightColor =
            Color.fromCssColorString(
              runInAction(() => catalogItem.highlightColor)
            ) ?? defaultColor;
        } else {
          highlightColor =
            Color.fromCssColorString(this.terria.baseMapContrastColor) ??
            defaultColor;
        }

        // highlighting doesn't work if the highlight colour is full white
        // so in this case use something close to white instead
        feature._cesium3DTileFeature.color = Color.equals(
          highlightColor,
          Color.WHITE
        )
          ? defaultColor
          : highlightColor;

        this._removeHighlightCallback = function() {
          if (
            isDefined(feature._cesium3DTileFeature) &&
            !feature._cesium3DTileFeature.tileset.isDestroyed()
          ) {
            feature._cesium3DTileFeature.color = originalColor;
          }
        };
      } else if (isDefined(feature.polygon)) {
        hasGeometry = true;

        const cesiumPolygon = feature.cesiumEntity || feature;

        const polygonOutline = cesiumPolygon.polygon!.outline;
        const polygonOutlineColor = cesiumPolygon.polygon!.outlineColor;
        const polygonMaterial = cesiumPolygon.polygon!.material;

        cesiumPolygon.polygon!.outline = new ConstantProperty(true);
        cesiumPolygon.polygon!.outlineColor = new ConstantProperty(
          Color.fromCssColorString(this.terria.baseMapContrastColor) ??
            Color.GRAY
        );
        cesiumPolygon.polygon!.material = new ColorMaterialProperty(
          new ConstantProperty(
            (
              Color.fromCssColorString(this.terria.baseMapContrastColor) ??
              Color.LIGHTGRAY
            ).withAlpha(0.75)
          )
        );

        this._removeHighlightCallback = function() {
          if (cesiumPolygon.polygon) {
            cesiumPolygon.polygon.outline = polygonOutline;
            cesiumPolygon.polygon.outlineColor = polygonOutlineColor;
            cesiumPolygon.polygon.material = polygonMaterial;
          }
        };
      } else if (isDefined(feature.polyline)) {
        hasGeometry = true;

        const cesiumPolyline = feature.cesiumEntity || feature;

        const polylineMaterial = cesiumPolyline.polyline!.material;
        const polylineWidth = cesiumPolyline.polyline!.width;

        (<any>cesiumPolyline).polyline.material =
          Color.fromCssColorString(this.terria.baseMapContrastColor) ??
          Color.LIGHTGRAY;
        cesiumPolyline.polyline!.width = new ConstantProperty(2);

        this._removeHighlightCallback = function() {
          if (cesiumPolyline.polyline) {
            cesiumPolyline.polyline.material = polylineMaterial;
            cesiumPolyline.polyline.width = polylineWidth;
          }
        };
      }

      if (!hasGeometry) {
        if (
          feature.imageryLayer &&
          feature.imageryLayer.imageryProvider instanceof
            MapboxVectorTileImageryProvider
        ) {
          const featureId =
            feature.data?.id ?? feature.properties?.id?.getValue?.();
          if (isDefined(featureId)) {
            const highlightImageryProvider = feature.imageryLayer.imageryProvider.createHighlightImageryProvider(
              featureId
            );
            this._removeHighlightCallback = this.terria.currentViewer._addVectorTileHighlight(
              highlightImageryProvider,
              feature.imageryLayer.imageryProvider.rectangle
            );
          }
        } else if (
          !isDefined(this.supportsPolylinesOnTerrain) ||
          this.supportsPolylinesOnTerrain
        ) {
          let geoJson: GeoJSONFeature | undefined = featureDataToGeoJson(
            feature.data
          );

          // Show geometry associated with the feature.
          // Don't show points; the targeting cursor is sufficient.
          if (
            geoJson &&
            geoJson.geometry &&
            geoJson.geometry.type !== "Point"
          ) {
            // Turn Polygons into MultiLineStrings, because we're only showing the outline.
            if (
              geoJson.geometry.type === "Polygon" ||
              geoJson.geometry.type === "MultiPolygon"
            ) {
              geoJson = <GeoJSONFeature>clone(geoJson);
              geoJson.geometry = clone(geoJson.geometry);

              if (geoJson.geometry.type === "MultiPolygon") {
                const newCoordinates: Position[][] = [];
                geoJson.geometry.coordinates.forEach(polygon => {
                  newCoordinates.push(...polygon);
                });
                (<any>geoJson).geometry.coordinates = newCoordinates;
              }

              geoJson.geometry.type = "MultiLineString";
            }

            const catalogItem = new GeoJsonCatalogItem(
              GlobeOrMap._featureHighlightName,
              this.terria
            );

            catalogItem.setTrait(
              CommonStrata.user,
              "name",
              GlobeOrMap._featureHighlightName
            );
            catalogItem.setTrait(
              CommonStrata.user,
              "geoJsonData",
              <any>geoJson
            );
            catalogItem.setTrait(CommonStrata.user, "clampToGround", true);
            catalogItem.setTrait(CommonStrata.user, "style", {
              "stroke-width": 2,
              stroke: this.terria.baseMapContrastColor,
              fill: undefined,
              "fill-opacity": 0,
              "marker-color": this.terria.baseMapContrastColor,
              "marker-size": undefined,
              "marker-symbol": undefined,
              "marker-opacity": undefined,
              "stroke-opacity": undefined,
              "marker-url": undefined
            });

            const removeCallback = (this._removeHighlightCallback = () => {
              if (!isDefined(this._highlightPromise)) {
                return;
              }
              return this._highlightPromise
                .then(() => {
                  if (removeCallback !== this._removeHighlightCallback) {
                    return;
                  }
                  catalogItem.setTrait(CommonStrata.user, "show", false);
                  this.terria.overlays.remove(catalogItem);
                })
                .catch(function() {});
            });

            catalogItem.setTrait(CommonStrata.user, "show", true);

            this._highlightPromise = this.terria.overlays.add(catalogItem);
          }
        }
      }
    }
  }

  /**
   * Captures a screenshot of the map.
   * @return A promise that resolves to a data URL when the screenshot is ready.
   */
  captureScreenshot(): Promise<string> {
    throw new DeveloperError(
      "captureScreenshot must be implemented in the derived class."
    );
  }
}
