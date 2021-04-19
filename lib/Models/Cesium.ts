import i18next from "i18next";
import { autorun, computed, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import BoundingSphere from "terriajs-cesium/Source/Core/BoundingSphere";
import Cartesian2 from "terriajs-cesium/Source/Core/Cartesian2";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumTerrainProvider from "terriajs-cesium/Source/Core/CesiumTerrainProvider";
import Clock from "terriajs-cesium/Source/Core/Clock";
import createWorldTerrain from "terriajs-cesium/Source/Core/createWorldTerrain";
import Credit from "terriajs-cesium/Source/Core/Credit";
import defaultValue from "terriajs-cesium/Source/Core/defaultValue";
import defined from "terriajs-cesium/Source/Core/defined";
import destroyObject from "terriajs-cesium/Source/Core/destroyObject";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import EllipsoidTerrainProvider from "terriajs-cesium/Source/Core/EllipsoidTerrainProvider";
import EventHelper from "terriajs-cesium/Source/Core/EventHelper";
import FeatureDetection from "terriajs-cesium/Source/Core/FeatureDetection";
import HeadingPitchRange from "terriajs-cesium/Source/Core/HeadingPitchRange";
import Ion from "terriajs-cesium/Source/Core/Ion";
import KeyboardEventModifier from "terriajs-cesium/Source/Core/KeyboardEventModifier";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Matrix4 from "terriajs-cesium/Source/Core/Matrix4";
import PerspectiveFrustum from "terriajs-cesium/Source/Core/PerspectiveFrustum";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import sampleTerrain from "terriajs-cesium/Source/Core/sampleTerrain";
import ScreenSpaceEventType from "terriajs-cesium/Source/Core/ScreenSpaceEventType";
import TerrainProvider from "terriajs-cesium/Source/Core/TerrainProvider";
import Transforms from "terriajs-cesium/Source/Core/Transforms";
import BoundingSphereState from "terriajs-cesium/Source/DataSources/BoundingSphereState";
import DataSource from "terriajs-cesium/Source/DataSources/DataSource";
import DataSourceCollection from "terriajs-cesium/Source/DataSources/DataSourceCollection";
import DataSourceDisplay from "terriajs-cesium/Source/DataSources/DataSourceDisplay";
import Entity from "terriajs-cesium/Source/DataSources/Entity";
import ImageryLayer from "terriajs-cesium/Source/Scene/ImageryLayer";
import ImageryLayerFeatureInfo from "terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo";
import ImageryProvider from "terriajs-cesium/Source/Scene/ImageryProvider";
import ImagerySplitDirection from "terriajs-cesium/Source/Scene/ImagerySplitDirection";
import Scene from "terriajs-cesium/Source/Scene/Scene";
import SceneTransforms from "terriajs-cesium/Source/Scene/SceneTransforms";
import SingleTileImageryProvider from "terriajs-cesium/Source/Scene/SingleTileImageryProvider";
import when from "terriajs-cesium/Source/ThirdParty/when";
import CesiumWidget from "terriajs-cesium/Source/Widgets/CesiumWidget/CesiumWidget";
import getElement from "terriajs-cesium/Source/Widgets/getElement";
import filterOutUndefined from "../Core/filterOutUndefined";
import flatten from "../Core/flatten";
import isDefined from "../Core/isDefined";
import LatLonHeight from "../Core/LatLonHeight";
import pollToPromise from "../Core/pollToPromise";
import CesiumRenderLoopPauser from "../Map/CesiumRenderLoopPauser";
import CesiumSelectionIndicator from "../Map/CesiumSelectionIndicator";
import MapboxVectorTileImageryProvider from "../Map/MapboxVectorTileImageryProvider";
import PickedFeatures, { ProviderCoordsMap } from "../Map/PickedFeatures";
import MappableMixin, {
  ImageryParts,
  isCesium3DTileset,
  isDataSource,
  isTerrainProvider,
  MapItem
} from "../ModelMixins/MappableMixin";
import TileErrorHandlerMixin from "../ModelMixins/TileErrorHandlerMixin";
import SplitterTraits from "../Traits/SplitterTraits";
import TerriaViewer from "../ViewModels/TerriaViewer";
import CameraView from "./CameraView";
import Feature from "./Feature";
import GlobeOrMap from "./GlobeOrMap";
import hasTraits from "./hasTraits";
import Terria from "./Terria";
import UserDrawing from "./UserDrawing";

//import Cesium3DTilesInspector from "terriajs-cesium/Source/Widgets/Cesium3DTilesInspector/Cesium3DTilesInspector";

// Intermediary
var cartesian3Scratch = new Cartesian3();
var enuToFixedScratch = new Matrix4();
var southwestScratch = new Cartesian3();
var southeastScratch = new Cartesian3();
var northeastScratch = new Cartesian3();
var northwestScratch = new Cartesian3();
var southwestCartographicScratch = new Cartographic();
var southeastCartographicScratch = new Cartographic();
var northeastCartographicScratch = new Cartographic();
var northwestCartographicScratch = new Cartographic();

export default class Cesium extends GlobeOrMap {
  readonly type = "Cesium";
  readonly terria: Terria;
  readonly terriaViewer: TerriaViewer;
  readonly cesiumWidget: CesiumWidget;
  readonly scene: Scene;
  readonly dataSources: DataSourceCollection = new DataSourceCollection();
  readonly dataSourceDisplay: DataSourceDisplay;
  readonly pauser: CesiumRenderLoopPauser;
  readonly canShowSplitter = true;
  private readonly _eventHelper: EventHelper;
  private _pauseMapInteractionCount = 0;
  private _lastTarget:
    | CameraView
    | Rectangle
    | DataSource
    | MappableMixin.MappableMixin
    | /*TODO Cesium.Cesium3DTileset*/ any;

  // When true, feature picking is paused. This is useful for temporarily
  // disabling feature picking when some other interaction mode wants to take
  // over the LEFT_CLICK behavior.
  isFeaturePickingPaused = false;

  /* Disposers */
  private readonly _selectionIndicator: CesiumSelectionIndicator;
  private readonly _disposeSelectedFeatureSubscription: () => void;
  private readonly _disposeWorkbenchMapItemsSubscription: () => void;
  private readonly _disposeTerrainReaction: () => void;
  private readonly _disposeSplitterReaction: () => void;

  private _createImageryLayer: (
    ip: ImageryProvider,
    clippingRectangle: Rectangle | undefined
  ) => ImageryLayer = computedFn((ip, clippingRectangle) => {
    return new ImageryLayer(ip, {
      rectangle: clippingRectangle
    });
  });

  constructor(terriaViewer: TerriaViewer, container: string | HTMLElement) {
    super();

    this.terriaViewer = terriaViewer;
    this.terria = terriaViewer.terria;

    if (this.terria.configParameters.cesiumIonAccessToken !== undefined) {
      Ion.defaultAccessToken = this.terria.configParameters.cesiumIonAccessToken;
    }

    //An arbitrary base64 encoded image used to populate the placeholder SingleTileImageryProvider
    const img =
      "data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAUA \
    AAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO \
    9TXL0Y4OHwAAAABJRU5ErkJggg==";

    const options = {
      dataSources: this.dataSources,
      clock: this.terria.timelineClock,
      imageryProvider: new SingleTileImageryProvider({ url: img }),
      scene3DOnly: true,
      shadows: true,
      useBrowserRecommendedResolution: !this.terria.useNativeResolution
    };

    // Workaround for Firefox bug with WebGL and printing:
    // https://bugzilla.mozilla.org/show_bug.cgi?id=976173
    const firefoxBugOptions = (<any>FeatureDetection).isFirefox()
      ? {
          contextOptions: { webgl: { preserveDrawingBuffer: true } }
        }
      : undefined;

    this.cesiumWidget = new CesiumWidget(
      container,
      Object.assign({}, options, firefoxBugOptions)
    );
    this.scene = this.cesiumWidget.scene;

    //new Cesium3DTilesInspector(document.getElementsByClassName("cesium-widget").item(0), this.scene);

    this.dataSourceDisplay = new DataSourceDisplay({
      scene: this.scene,
      dataSourceCollection: this.dataSources
    });

    this._selectionIndicator = new CesiumSelectionIndicator(this);

    this.supportsPolylinesOnTerrain = (<any>this.scene).context.depthTexture;

    this._eventHelper = new EventHelper();

    this._eventHelper.add(this.terria.timelineClock.onTick, <any>((
      clock: Clock
    ) => {
      this.dataSourceDisplay.update(clock.currentTime);
    }));

    // Progress
    this._eventHelper.add(this.scene.globe.tileLoadProgressEvent, <any>(
      ((currentLoadQueueLength: number) =>
        this._updateTilesLoadingCount(currentLoadQueueLength))
    ));

    // Disable HDR lighting for better performance and to avoid changing imagery colors.
    (<any>this.scene).highDynamicRange = false;

    this.scene.imageryLayers.removeAll();

    //catch Cesium terrain provider down and switch to Ellipsoid
    //     terrainProvider.errorEvent.addEventListener(function(err) {
    //         console.log('Terrain provider error.  ', err.message);
    //         if (viewer.scene.terrainProvider instanceof CesiumTerrainProvider) {
    //             console.log('Switching to EllipsoidTerrainProvider.');
    //             that.terria.viewerMode = ViewerMode.CesiumEllipsoid;
    //             if (!defined(that.TerrainMessageViewed)) {
    //                 that.terria.error.raiseEvent({
    //                     title : 'Terrain Server Not Responding',
    //                     message : '\
    // The terrain server is not responding at the moment.  You can still use all the features of '+that.terria.appName+' \
    // but there will be no terrain detail in 3D mode.  We\'re sorry for the inconvenience.  Please try \
    // again later and the terrain server should be responding as expected.  If the issue persists, please contact \
    // us via email at '+that.terria.supportEmail+'.'
    //                 });
    //                 that.TerrainMessageViewed = true;
    //             }
    //         }
    //     });

    if (isDefined(this._extraCredits.terria)) {
      const containerElement = getElement(container);
      const creditsElement =
        containerElement &&
        (containerElement.getElementsByClassName(
          "cesium-widget-credits"
        )[0] as HTMLElement);
      const logoContainer =
        creditsElement &&
        (creditsElement.getElementsByClassName(
          "cesium-credit-logoContainer"
        )[0] as HTMLElement);
      const expandLink =
        creditsElement &&
        creditsElement.getElementsByClassName("cesium-credit-expand-link") &&
        (creditsElement.getElementsByClassName(
          "cesium-credit-expand-link"
        )[0] as HTMLElement);
      if (creditsElement && logoContainer) {
        creditsElement.insertBefore(
          this._extraCredits.terria?.element,
          logoContainer
        );
      }
      if (expandLink) {
        let attributionToAboutPage = document.createElement("div");
        attributionToAboutPage.innerHTML = `<a href="about.html#data-attribution" target="_blank" rel="noopener noreferrer">Data attribution</a>`;
        let disclaimerToAboutPage = document.createElement("div");
        disclaimerToAboutPage.innerHTML = `<a href="about.html#disclaimer" target="_blank" rel="noopener noreferrer">Disclaimer</a>`;

        if (logoContainer && logoContainer.parentNode) {
          if (disclaimerToAboutPage && disclaimerToAboutPage.firstChild) {
            logoContainer.parentNode.insertBefore(
              disclaimerToAboutPage.firstChild,
              logoContainer.nextSibling
            );
          }

          if (attributionToAboutPage && attributionToAboutPage.firstChild) {
            logoContainer.parentNode.insertBefore(
              attributionToAboutPage.firstChild,
              logoContainer.nextSibling
            );
          }
        }

        expandLink.innerText = "Basemap";
      }
    }

    this.scene.globe.depthTestAgainstTerrain = false;

    // var d = this._getDisclaimer();
    // if (d) {
    //     scene.frameState.creditDisplay.addDefaultCredit(d);
    // }

    // if (defined(this._developerAttribution)) {
    //     scene.frameState.creditDisplay.addDefaultCredit(createCredit(this._developerAttribution.text, this._developerAttribution.link));
    // }

    // scene.frameState.creditDisplay.addDefaultCredit(new Credit('<a href="http://cesiumjs.org" target="_blank" rel="noopener noreferrer">CESIUM</a>'));

    const inputHandler = this.cesiumWidget.screenSpaceEventHandler;

    // // Add double click zoom
    // inputHandler.setInputAction(
    //     function (movement) {
    //         zoomIn(scene, movement.position);
    //     },
    //     ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    // inputHandler.setInputAction(
    //     function (movement) {
    //         zoomOut(scene, movement.position);
    //     },
    //     ScreenSpaceEventType.LEFT_DOUBLE_CLICK, KeyboardEventModifier.SHIFT);

    // Handle mouse move
    inputHandler.setInputAction(e => {
      this.mouseCoords.updateCoordinatesFromCesium(this.terria, e.endPosition);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    inputHandler.setInputAction(
      e => {
        this.mouseCoords.updateCoordinatesFromCesium(
          this.terria,
          e.endPosition
        );
      },
      ScreenSpaceEventType.MOUSE_MOVE,
      KeyboardEventModifier.SHIFT
    );

    // Handle left click by picking objects from the map.
    inputHandler.setInputAction(e => {
      if (!this.isFeaturePickingPaused)
        this.pickFromScreenPosition(e.position, false);
    }, ScreenSpaceEventType.LEFT_CLICK);

    let zoomUserDrawing: UserDrawing | undefined;

    // Handle zooming on SHIFT + MOUSE DOWN
    inputHandler.setInputAction(
      e => {
        if (!this.isFeaturePickingPaused && !isDefined(zoomUserDrawing)) {
          this.pauseMapInteraction();

          const exitZoom = () => {
            document.removeEventListener("keyup", onKeyUp);
            runInAction(() => {
              this.terria.mapInteractionModeStack.pop();
              zoomUserDrawing && zoomUserDrawing.cleanUp();
            });
            this.resumeMapInteraction();
            zoomUserDrawing = undefined;
          };

          // If the shift key is released -> exit zoom
          const onKeyUp = (e: KeyboardEvent) =>
            e.key === "Shift" && zoomUserDrawing && exitZoom();

          document.addEventListener("keyup", onKeyUp);

          let pointClickCount = 0;

          zoomUserDrawing = new UserDrawing({
            terria: this.terria,
            messageHeader: i18next.t("map.drawExtentHelper.drawExtent"),
            onPointClicked: () => {
              pointClickCount++;
              if (
                zoomUserDrawing &&
                zoomUserDrawing.pointEntities.entities.values.length >= 2
              ) {
                const rectangle = zoomUserDrawing.otherEntities.entities
                  .getById("rectangle")
                  ?.rectangle?.coordinates?.getValue(
                    this.terria.timelineClock.currentTime
                  );

                if (rectangle) this.zoomTo(rectangle, 1);

                exitZoom();

                // If more than two points are clicked but a rectangle hasn't been drawn -> exit zoom
              } else if (pointClickCount >= 2) {
                exitZoom();
              }
            },
            allowPolygon: false,
            drawRectangle: true,
            invisible: true
          });

          zoomUserDrawing.enterDrawMode();

          // Pick first point of rectangle on start
          this.pickFromScreenPosition(e.position, false);
        }
      },
      ScreenSpaceEventType.LEFT_DOWN,
      KeyboardEventModifier.SHIFT
    );

    // Handle SHIFT + CLICK for zooming

    inputHandler.setInputAction(
      e => {
        if (isDefined(zoomUserDrawing)) {
          this.pickFromScreenPosition(e.position, false);
        }
      },
      ScreenSpaceEventType.LEFT_UP,
      KeyboardEventModifier.SHIFT
    );

    this.pauser = new CesiumRenderLoopPauser(this.cesiumWidget, () => {
      // Post render, update selection indicator position
      const feature = this.terria.selectedFeature;

      // If the feature has an associated primitive and that primitive has
      // a clamped position, use that instead, because the regular
      // position doesn't take terrain clamping into account.
      if (isDefined(feature)) {
        if (
          isDefined(feature.cesiumPrimitive) &&
          isDefined(feature.cesiumPrimitive._clampedPosition)
        ) {
          this._selectionIndicator.position =
            feature.cesiumPrimitive._clampedPosition;
        } else if (
          isDefined(feature.cesiumPrimitive) &&
          isDefined(feature.cesiumPrimitive._clampedModelMatrix)
        ) {
          this._selectionIndicator.position = Matrix4.getTranslation(
            feature.cesiumPrimitive._clampedModelMatrix,
            this._selectionIndicator.position || new Cartesian3()
          );
        } else if (isDefined(feature.position)) {
          this._selectionIndicator.position = feature.position.getValue(
            this.terria.timelineClock.currentTime
          );
        }
      }

      this._selectionIndicator.update();
    });

    this._disposeSelectedFeatureSubscription = autorun(() => {
      this._selectFeature();
    });

    this._disposeWorkbenchMapItemsSubscription = this.observeModelLayer();
    this._disposeTerrainReaction = autorun(() => {
      this.scene.globe.terrainProvider = this._terrainProvider;
      this.scene.globe.splitDirection = this.terria.showSplitter
        ? this.terria.terrainSplitDirection
        : ImagerySplitDirection.NONE;
      this.scene.globe.depthTestAgainstTerrain = this.terria.depthTestAgainstTerrainEnabled;
      if (this.scene.skyAtmosphere) {
        this.scene.skyAtmosphere.splitDirection = this.scene.globe.splitDirection;
      }
    });
    this._disposeSplitterReaction = this._reactToSplitterChanges();

    autorun(() => {
      (this.cesiumWidget as any).useBrowserRecommendedResolution = !this.terria
        .useNativeResolution;
      this.cesiumWidget.scene.globe.maximumScreenSpaceError = this.terria.baseMaximumScreenSpaceError;
    });
  }

  getContainer() {
    return this.cesiumWidget.container;
  }

  pauseMapInteraction() {
    ++this._pauseMapInteractionCount;
    if (this._pauseMapInteractionCount === 1) {
      this.scene.screenSpaceCameraController.enableInputs = false;
    }
  }

  resumeMapInteraction() {
    --this._pauseMapInteractionCount;
    if (this._pauseMapInteractionCount === 0) {
      setTimeout(() => {
        if (this._pauseMapInteractionCount === 0) {
          this.scene.screenSpaceCameraController.enableInputs = true;
        }
      }, 0);
    }
  }

  destroy() {
    // Port old Cesium.prototype.destroy stuff
    // this._enableSelectExtent(cesiumWidget.scene, false);

    const inputHandler = this.cesiumWidget.screenSpaceEventHandler;
    inputHandler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
    inputHandler.removeInputAction(
      ScreenSpaceEventType.MOUSE_MOVE,
      KeyboardEventModifier.SHIFT
    );
    // inputHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    // inputHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK, KeyboardEventModifier.SHIFT);

    inputHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
    inputHandler.removeInputAction(
      ScreenSpaceEventType.LEFT_DOWN,
      KeyboardEventModifier.SHIFT
    );
    inputHandler.removeInputAction(
      ScreenSpaceEventType.LEFT_UP,
      KeyboardEventModifier.SHIFT
    );

    // if (defined(this.monitor)) {
    //     this.monitor.destroy();
    //     this.monitor = undefined;
    // }

    if (isDefined(this._selectionIndicator)) {
      this._selectionIndicator.destroy();
    }

    this.pauser.destroy();
    this.stopObserving();
    this._eventHelper.removeAll();
    this.dataSourceDisplay.destroy();

    this._disposeTerrainReaction();

    this._disposeSelectedFeatureSubscription();
    this._disposeSplitterReaction();
    this.cesiumWidget.destroy();
    destroyObject(this);
  }

  private get _allMappables() {
    const catalogItems = [
      ...this.terriaViewer.items.get(),
      this.terriaViewer.baseMap
    ];
    return flatten(
      filterOutUndefined(
        catalogItems.map(item => {
          if (isDefined(item) && MappableMixin.isMixedInto(item))
            return item.mapItems.map(mapItem => ({ mapItem, item }));
        })
      )
    );
  }

  @computed
  private get _allMapItems(): MapItem[] {
    return this._allMappables.map(({ mapItem }) => mapItem);
  }

  private observeModelLayer() {
    return autorun(() => {
      // TODO: Look up the type in a map and call the associated function.
      //       That way the supported types of map items is extensible.
      const allDataSources = this._allMapItems.filter(isDataSource);

      // Remove deleted data sources
      let dataSources = this.dataSources;
      for (let i = 0; i < dataSources.length; i++) {
        const d = dataSources.get(i);
        if (allDataSources.indexOf(d) === -1) {
          dataSources.remove(d);
          --i;
        }
      }

      // Add new data sources
      allDataSources.forEach(d => {
        if (!dataSources.contains(d)) {
          dataSources.add(d);
        }
      });

      // Ensure stacking order matches order in allDataSources - first item appears on top.
      allDataSources.forEach(d => dataSources.raiseToTop(d));

      const allImageryParts = this._allMappables
        .map(m =>
          ImageryParts.is(m.mapItem)
            ? this._makeImageryLayerFromParts(m.mapItem, m.item)
            : undefined
        )
        .filter(isDefined);

      // Delete imagery layers that are no longer in the model
      for (let i = 0; i < this.scene.imageryLayers.length; i++) {
        const imageryLayer = this.scene.imageryLayers.get(i);
        if (allImageryParts.indexOf(imageryLayer) === -1) {
          this.scene.imageryLayers.remove(imageryLayer);
          --i;
        }
      }
      // Iterate backwards so that adding multiple layers adds them in increasing cesium index order
      for (
        let modelIndex = allImageryParts.length - 1;
        modelIndex >= 0;
        modelIndex--
      ) {
        const mapItem = allImageryParts[modelIndex];

        const targetCesiumIndex = allImageryParts.length - modelIndex - 1;
        const currentCesiumIndex = this.scene.imageryLayers.indexOf(mapItem);
        if (currentCesiumIndex === -1) {
          this.scene.imageryLayers.add(mapItem, targetCesiumIndex);
        } else if (currentCesiumIndex > targetCesiumIndex) {
          for (let j = currentCesiumIndex; j > targetCesiumIndex; j--) {
            this.scene.imageryLayers.lower(mapItem);
          }
        } else if (currentCesiumIndex < targetCesiumIndex) {
          for (let j = currentCesiumIndex; j < targetCesiumIndex; j++) {
            this.scene.imageryLayers.raise(mapItem);
          }
        }
      }

      const allCesium3DTilesets = this._allMapItems.filter(isCesium3DTileset);

      // Remove deleted tilesets
      const primitives = this.scene.primitives;
      for (let i = 0; i < this.scene.primitives.length; i++) {
        const prim = primitives.get(i);
        if (
          isCesium3DTileset(prim) &&
          allCesium3DTilesets.indexOf(prim) === -1
        ) {
          this.scene.primitives.remove(prim);
        }
      }

      // Add new tilesets
      allCesium3DTilesets.forEach(tileset => {
        if (!primitives.contains(tileset)) {
          primitives.add(tileset);
        }
      });

      this.notifyRepaintRequired();
    });
  }

  stopObserving() {
    if (this._disposeWorkbenchMapItemsSubscription !== undefined) {
      this._disposeWorkbenchMapItemsSubscription();
    }
  }

  doZoomTo(
    target:
      | CameraView
      | Rectangle
      | DataSource
      | MappableMixin.MappableMixin
      | /*TODO Cesium.Cesium3DTileset*/ any,
    flightDurationSeconds?: number
  ): void {
    if (!defined(target)) {
      return;
      //throw new DeveloperError("viewOrExtent is required.");
    }
    flightDurationSeconds = defaultValue(flightDurationSeconds, 3.0);

    var that = this;
    that._lastTarget = target;
    return when()
      .then(function() {
        if (target instanceof Rectangle) {
          var camera = that.scene.camera;

          // Work out the destination that the camera would naturally fly to
          var destinationCartesian = camera.getRectangleCameraCoordinates(
            target
          );
          var destination = Ellipsoid.WGS84.cartesianToCartographic(
            destinationCartesian
          );
          var terrainProvider = that.scene.globe.terrainProvider;
          var level = 6; // A sufficiently coarse tile level that still has approximately accurate height
          var positions = [Rectangle.center(target)];

          // Perform an elevation query at the centre of the rectangle
          return sampleTerrain(terrainProvider, level, positions).then(function(
            results
          ) {
            if (that._lastTarget !== target) {
              return;
            }

            var finalDestinationCartographic = new Cartographic(
              destination.longitude,
              destination.latitude,
              destination.height + results[0].height
            );

            var finalDestination = Ellipsoid.WGS84.cartographicToCartesian(
              finalDestinationCartographic
            );

            camera.flyTo({
              duration: flightDurationSeconds,
              destination: finalDestination
            });
          });
        } else if (defined(target.entities)) {
          // Zooming to a DataSource
          if (target.isLoading && defined(target.loadingEvent)) {
            var deferred = when.defer();
            var removeEvent = target.loadingEvent.addEventListener(function() {
              removeEvent();
              deferred.resolve();
            });
            return deferred.promise.then(function() {
              if (that._lastTarget !== target) {
                return;
              }
              return zoomToDataSource(that, target, flightDurationSeconds);
            });
          }
          return zoomToDataSource(that, target);
        } else if (defined(target.readyPromise)) {
          return target.readyPromise.then(function() {
            if (defined(target.boundingSphere) && that._lastTarget === target) {
              zoomToBoundingSphere(that, target, flightDurationSeconds);
            }
          });
        } else if (defined(target.boundingSphere)) {
          return zoomToBoundingSphere(that, target, flightDurationSeconds);
        } else if (target.position !== undefined) {
          that.scene.camera.flyTo({
            duration: flightDurationSeconds,
            destination: target.position,
            orientation: {
              direction: target.direction,
              up: target.up
            }
          });
        } else if (MappableMixin.isMixedInto(target)) {
          if (isDefined(target.cesiumRectangle)) {
            return that.scene.camera.flyTo({
              duration: flightDurationSeconds,
              destination: target.cesiumRectangle
            });
          }

          if (target.mapItems.length > 0) {
            // Zoom to the first item!
            return that.doZoomTo(target.mapItems[0], flightDurationSeconds);
          }
        } else if (defined(target.rectangle)) {
          that.scene.camera.flyTo({
            duration: flightDurationSeconds,
            destination: target.rectangle
          });
        }
      })
      .then(function() {
        that.notifyRepaintRequired();
      });
  }

  notifyRepaintRequired() {
    this.pauser.notifyRepaintRequired();
  }

  _reactToSplitterChanges() {
    const disposeSplitPositionChange = autorun(() => {
      if (this.scene) {
        this.scene.imagerySplitPosition = this.terria.splitPosition;
        this.notifyRepaintRequired();
      }
    });

    const disposeSplitDirectionChange = autorun(() => {
      const items = this.terria.mainViewer.items.get();
      const showSplitter = this.terria.showSplitter;
      items.forEach(item => {
        if (
          MappableMixin.isMixedInto(item) &&
          hasTraits(item, SplitterTraits, "splitDirection")
        ) {
          const layers = this.getImageryLayersForItem(item);
          const splitDirection = item.splitDirection;

          layers.forEach(layer => {
            if (showSplitter) {
              layer.splitDirection = splitDirection;
            } else {
              layer.splitDirection = ImagerySplitDirection.NONE;
            }
          });
        }
      });
      this.notifyRepaintRequired();
    });

    return function() {
      disposeSplitPositionChange();
      disposeSplitDirectionChange();
    };
  }

  getCurrentCameraView(): CameraView {
    const scene = this.scene;
    const camera = scene.camera;

    const width = scene.canvas.clientWidth;
    const height = scene.canvas.clientHeight;

    const centerOfScreen = new Cartesian2(width / 2.0, height / 2.0);
    const pickRay = scene.camera.getPickRay(centerOfScreen);
    const center = scene.globe.pick(pickRay, scene);

    if (!center) {
      // TODO: binary search to find the horizon point and use that as the center.
      return this.terriaViewer.homeCamera; // This is just a random rectangle. Replace it when there's a home view available
      // return this.terria.homeView.rectangle;
    }

    const ellipsoid = this.scene.globe.ellipsoid;

    const frustrum = scene.camera.frustum as PerspectiveFrustum;

    const fovy = frustrum.fovy * 0.5;
    const fovx = Math.atan(Math.tan(fovy) * frustrum.aspectRatio);

    const cameraOffset = Cartesian3.subtract(
      camera.positionWC,
      center,
      cartesian3Scratch
    );
    const cameraHeight = Cartesian3.magnitude(cameraOffset);
    const xDistance = cameraHeight * Math.tan(fovx);
    const yDistance = cameraHeight * Math.tan(fovy);

    const southwestEnu = new Cartesian3(-xDistance, -yDistance, 0.0);
    const southeastEnu = new Cartesian3(xDistance, -yDistance, 0.0);
    const northeastEnu = new Cartesian3(xDistance, yDistance, 0.0);
    const northwestEnu = new Cartesian3(-xDistance, yDistance, 0.0);

    const enuToFixed = Transforms.eastNorthUpToFixedFrame(
      center,
      ellipsoid,
      enuToFixedScratch
    );
    const southwest = Matrix4.multiplyByPoint(
      enuToFixed,
      southwestEnu,
      southwestScratch
    );
    const southeast = Matrix4.multiplyByPoint(
      enuToFixed,
      southeastEnu,
      southeastScratch
    );
    const northeast = Matrix4.multiplyByPoint(
      enuToFixed,
      northeastEnu,
      northeastScratch
    );
    const northwest = Matrix4.multiplyByPoint(
      enuToFixed,
      northwestEnu,
      northwestScratch
    );

    const southwestCartographic = ellipsoid.cartesianToCartographic(
      southwest,
      southwestCartographicScratch
    );
    const southeastCartographic = ellipsoid.cartesianToCartographic(
      southeast,
      southeastCartographicScratch
    );
    const northeastCartographic = ellipsoid.cartesianToCartographic(
      northeast,
      northeastCartographicScratch
    );
    const northwestCartographic = ellipsoid.cartesianToCartographic(
      northwest,
      northwestCartographicScratch
    );

    // Account for date-line wrapping
    if (southeastCartographic.longitude < southwestCartographic.longitude) {
      southeastCartographic.longitude += CesiumMath.TWO_PI;
    }
    if (northeastCartographic.longitude < northwestCartographic.longitude) {
      northeastCartographic.longitude += CesiumMath.TWO_PI;
    }

    const rect = new Rectangle(
      CesiumMath.convertLongitudeRange(
        Math.min(
          southwestCartographic.longitude,
          northwestCartographic.longitude
        )
      ),
      Math.min(southwestCartographic.latitude, southeastCartographic.latitude),
      CesiumMath.convertLongitudeRange(
        Math.max(
          northeastCartographic.longitude,
          southeastCartographic.longitude
        )
      ),
      Math.max(northeastCartographic.latitude, northwestCartographic.latitude)
    );

    // center isn't a member variable and doesn't seem to be used anywhere else in Terria
    // rect.center = center;
    return new CameraView(
      rect,
      camera.positionWC,
      camera.directionWC,
      camera.upWC
    );
  }

  @computed
  private get _firstMapItemTerrainProviders(): TerrainProvider | undefined {
    // Get the top map item that is a terrain provider, if any are
    return this._allMapItems.find(isTerrainProvider);
  }

  // It's nice to co-locate creation of Ion TerrainProvider and Credit, but not necessary
  @computed
  private get _terrainWithCredits(): {
    terrain: TerrainProvider;
    credit?: Credit;
  } {
    if (!this.terriaViewer.viewerOptions.useTerrain) {
      return { terrain: new EllipsoidTerrainProvider() };
    }
    if (this.terria.configParameters.cesiumTerrainUrl) {
      return {
        terrain: new CesiumTerrainProvider({
          url: this.terria.configParameters.cesiumTerrainUrl
        })
      };
    }
    // Check if there's a TerrainProvider in map items and use that if there is
    else if (this._firstMapItemTerrainProviders) {
      return { terrain: this._firstMapItemTerrainProviders };
    } else if (this.terria.configParameters.useCesiumIonTerrain) {
      const logo = require("terriajs-cesium/Source/Assets/Images/ion-credit.png");
      const ionCredit = new Credit(
        '<a href="https://cesium.com/" target="_blank" rel="noopener noreferrer"><img src="' +
          logo +
          '" title="Cesium ion"/></a>',
        true
      );
      return {
        terrain: createWorldTerrain({}),
        credit: ionCredit
      };
    }
    return { terrain: new EllipsoidTerrainProvider() };
  }

  // WIP working out how to deal with credits
  // This function isn't used anywhere yet
  @computed
  get _extraCredits() {
    const credits: { cesium?: Credit; terria?: Credit } = {};
    if (this._terrainWithCredits.credit) {
      credits.cesium = this._terrainWithCredits.credit;
    }
    if (!this.terria.configParameters.hideTerriaLogo) {
      const logo = require("../../wwwroot/images/terria-watermark.svg");
      credits.terria = new Credit(
        '<a href="https://terria.io/" target="_blank" rel="noopener noreferrer"><img src="' +
          logo +
          '" title="Built with Terria"/></a>',
        true
      );
    }
    return credits;
  }

  @computed
  private get _terrainProvider(): TerrainProvider {
    return this._terrainWithCredits.terrain;
  }

  /**
   * Picks features based on coordinates relative to the Cesium window. Will draw a ray from the camera through the point
   * specified and set terria.pickedFeatures based on this.
   *
   */
  pickFromScreenPosition(screenPosition: Cartesian2, ignoreSplitter: boolean) {
    const pickRay = this.scene.camera.getPickRay(screenPosition);
    const pickPosition = this.scene.globe.pick(pickRay, this.scene);
    const pickPositionCartographic =
      pickPosition && Ellipsoid.WGS84.cartesianToCartographic(pickPosition);

    const vectorFeatures = this.pickVectorFeatures(screenPosition);

    const providerCoords = this._attachProviderCoordHooks();
    var pickRasterPromise = this.terria.allowFeatureInfoRequests
      ? this.scene.imageryLayers.pickImageryLayerFeatures(pickRay, this.scene)
      : undefined;

    const result = this._buildPickedFeatures(
      providerCoords,
      pickPosition,
      vectorFeatures,
      pickRasterPromise ? [pickRasterPromise] : [],
      undefined,
      pickPositionCartographic ? pickPositionCartographic.height : 0.0,
      ignoreSplitter
    );

    const mapInteractionModeStack = this.terria.mapInteractionModeStack;
    runInAction(() => {
      if (
        isDefined(mapInteractionModeStack) &&
        mapInteractionModeStack.length > 0
      ) {
        mapInteractionModeStack[
          mapInteractionModeStack.length - 1
        ].pickedFeatures = result;
      } else {
        this.terria.pickedFeatures = result;
      }
    });
  }

  pickFromLocation(
    latLngHeight: LatLonHeight,
    providerCoords: ProviderCoordsMap,
    existingFeatures: Feature[]
  ) {
    const pickPosition = this.scene.globe.ellipsoid.cartographicToCartesian(
      Cartographic.fromDegrees(
        latLngHeight.longitude,
        latLngHeight.latitude,
        latLngHeight.height
      )
    );
    const pickPositionCartographic = Ellipsoid.WGS84.cartesianToCartographic(
      pickPosition
    );

    const promises: (Promise<ImageryLayerFeatureInfo[]> | undefined)[] = [];
    const imageryLayers: ImageryLayer[] = [];

    if (this.terria.allowFeatureInfoRequests) {
      for (let i = this.scene.imageryLayers.length - 1; i >= 0; i--) {
        const imageryLayer = this.scene.imageryLayers.get(i);
        const imageryProvider = imageryLayer.imageryProvider;

        function hasUrl(o: any): o is { url: string } {
          return typeof o?.url === "string";
        }

        if (hasUrl(imageryProvider) && providerCoords[imageryProvider.url]) {
          var coords = providerCoords[imageryProvider.url];
          promises.push(
            imageryProvider.pickFeatures(
              coords.x,
              coords.y,
              coords.level,
              pickPositionCartographic.longitude,
              pickPositionCartographic.latitude
            )
          );
          imageryLayers.push(imageryLayer);
        }
      }
    }

    const result = this._buildPickedFeatures(
      providerCoords,
      pickPosition,
      existingFeatures,
      filterOutUndefined(promises),
      imageryLayers,
      pickPositionCartographic.height,
      false
    );

    const mapInteractionModeStack = this.terria.mapInteractionModeStack;
    if (
      defined(mapInteractionModeStack) &&
      mapInteractionModeStack.length > 0
    ) {
      mapInteractionModeStack[
        mapInteractionModeStack.length - 1
      ].pickedFeatures = result;
    } else {
      this.terria.pickedFeatures = result;
    }
  }

  /**
   * Return features at a latitude, longitude and (optionally) height for the given imagery layers.
   * @param latLngHeight The position on the earth to pick
   * @param tileCoords A map of imagery provider urls to the tile coords used to get features for those imagery
   * @returns A flat array of all the features for the given tiles that are currently on the map
   */
  async getFeaturesAtLocation(
    latLngHeight: LatLonHeight,
    providerCoords: ProviderCoordsMap
  ): Promise<Entity[]> {
    const pickPosition = this.scene.globe.ellipsoid.cartographicToCartesian(
      Cartographic.fromDegrees(
        latLngHeight.longitude,
        latLngHeight.latitude,
        latLngHeight.height
      )
    );
    const pickPositionCartographic = Ellipsoid.WGS84.cartesianToCartographic(
      pickPosition
    );

    const promises = [];
    const imageryLayers: ImageryLayer[] = [];

    for (let i = this.scene.imageryLayers.length - 1; i >= 0; i--) {
      const imageryLayer = <ImageryLayer>this.scene.imageryLayers.get(i);
      const imageryProvider = imageryLayer.imageryProvider;
      // @ts-ignore
      const imageryProviderUrl = imageryProvider.url;
      if (imageryProviderUrl && providerCoords[imageryProviderUrl]) {
        var tileCoords = providerCoords[imageryProviderUrl];
        const pickPromise = imageryProvider.pickFeatures(
          tileCoords.x,
          tileCoords.y,
          tileCoords.level,
          pickPositionCartographic.longitude,
          pickPositionCartographic.latitude
        );

        if (pickPromise) {
          promises.push(pickPromise);
        }
        imageryLayers.push(imageryLayer);
      }
    }

    const pickedFeatures = this._buildPickedFeatures(
      providerCoords,
      pickPosition,
      [],
      promises,
      imageryLayers,
      pickPositionCartographic.height,
      true
    );

    await pickedFeatures.allFeaturesAvailablePromise;
    return pickedFeatures.features;
  }

  /**
   * Picks all *vector* features (e.g. GeoJSON) shown at a certain position on the screen, ignoring raster features
   * (e.g. WMS). Because all vector features are already in memory, this is synchronous.
   *
   * @param screenPosition position on the screen to look for features
   * @returns The features found.
   */
  pickVectorFeatures(screenPosition: Cartesian2) {
    // Pick vector features
    const vectorFeatures = [];
    const pickedList = this.scene.drillPick(screenPosition);
    for (let i = 0; i < pickedList.length; ++i) {
      const picked = pickedList[i];
      let id = picked.id;

      if (
        id &&
        id.entityCollection &&
        id.entityCollection.owner &&
        id.entityCollection.owner.name === GlobeOrMap._featureHighlightName
      ) {
        continue;
      }

      if (!defined(id) && defined(picked.primitive)) {
        id = picked.primitive.id;
      }

      if (id instanceof Entity && vectorFeatures.indexOf(id) === -1) {
        const feature = Feature.fromEntityCollectionOrEntity(id);
        if (picked.primitive) {
          feature.cesiumPrimitive = picked.primitive;
        }
        vectorFeatures.push(feature);
      } else if (
        picked.primitive &&
        picked.primitive._catalogItem &&
        picked.primitive._catalogItem.getFeaturesFromPickResult
      ) {
        const result = picked.primitive._catalogItem.getFeaturesFromPickResult(
          screenPosition,
          picked
        );
        if (result) {
          if (Array.isArray(result)) {
            vectorFeatures.push(...result);
          } else {
            vectorFeatures.push(result);
          }
        }
      }
    }

    return vectorFeatures;
  }

  /**
   * Hooks into the {@link ImageryProvider#pickFeatures} method of every imagery provider in the scene - when this method is
   * evaluated (usually as part of feature picking), it will record the tile coordinates used against the url of the
   * imagery provider in an object that is returned by this method. Hooks are removed immediately after being executed once.
   *
   * returns {{x, y, level}} A map of urls to the coords used by the imagery provider when picking features. Will
   *     initially be empty but will be updated as the hooks are evaluated.

   */
  private _attachProviderCoordHooks() {
    const providerCoords: ProviderCoordsMap = {};

    const pickFeaturesHook = function(
      imageryProvider: ImageryProvider,
      oldPick: (
        x: number,
        y: number,
        level: number,
        longitude: number,
        latitiude: number
      ) => Promise<ImageryLayerFeatureInfo[]> | undefined,
      x: number,
      y: number,
      level: number,
      longitude: number,
      latitude: number
    ) {
      const featuresPromise = oldPick.call(
        imageryProvider,
        x,
        y,
        level,
        longitude,
        latitude
      );

      // Use url to uniquely identify providers because what else can we do?
      if ((<any>imageryProvider).url) {
        providerCoords[(<any>imageryProvider).url] = {
          x: x,
          y: y,
          level: level
        };
      }

      imageryProvider.pickFeatures = oldPick;
      return featuresPromise;
    };

    for (let j = 0; j < this.scene.imageryLayers.length; j++) {
      const imageryProvider = this.scene.imageryLayers.get(j).imageryProvider;
      imageryProvider.pickFeatures = pickFeaturesHook.bind(
        undefined,
        imageryProvider,
        imageryProvider.pickFeatures
      );
    }

    return providerCoords;
  }

  /**
   * Builds a {@link PickedFeatures} object from a number of inputs.
   *
   * @param providerCoords A map of imagery provider urls to the coords used to get features for that provider.
   * @param  pickPosition The position in the 3D model that has been picked.
   * @param existingFeatures Existing features - the results of feature promises will be appended to this.
   * @param featurePromises Zero or more promises that each resolve to a list of {@link ImageryLayerFeatureInfo}s
   *     (usually there will be one promise per ImageryLayer. These will be combined as part of
   *     {@link PickedFeatures#allFeaturesAvailablePromise} and their results used to build the final
   *     {@link PickedFeatures#features} array.
   * @param imageryLayers An array of ImageryLayers that should line up with the one passed as featurePromises.
   * @param defaultHeight The height to use for feature position heights if none is available when picking.
   * @returns A {@link PickedFeatures} object that is a combination of everything passed.
   */
  private _buildPickedFeatures(
    providerCoords: ProviderCoordsMap,
    pickPosition: Cartesian3 | undefined,
    existingFeatures: Entity[],
    featurePromises: Promise<ImageryLayerFeatureInfo[]>[],
    imageryLayers: ImageryLayer[] | undefined,
    defaultHeight: number,
    ignoreSplitter: boolean
  ): PickedFeatures {
    const result = new PickedFeatures();

    result.providerCoords = providerCoords;
    result.pickPosition = pickPosition;

    result.allFeaturesAvailablePromise = Promise.all(featurePromises)
      .then(allFeatures => {
        runInAction(() => {
          result.isLoading = false;
          result.features = allFeatures.reduce(
            (resultFeaturesSoFar, imageryLayerFeatures, i) => {
              if (!isDefined(imageryLayerFeatures)) {
                return resultFeaturesSoFar;
              }

              let features = imageryLayerFeatures.map(feature => {
                if (isDefined(imageryLayers)) {
                  (<any>feature).imageryLayer = imageryLayers[i];
                }

                if (!isDefined(feature.position)) {
                  feature.position =
                    pickPosition &&
                    Ellipsoid.WGS84.cartesianToCartographic(pickPosition);
                }

                // If the picked feature does not have a height, use the height of the picked location.
                // This at least avoids major parallax effects on the selection indicator.
                if (
                  isDefined(feature.position) &&
                  (!isDefined(feature.position.height) ||
                    feature.position.height === 0.0)
                ) {
                  feature.position.height = defaultHeight;
                }
                return this._createFeatureFromImageryLayerFeature(feature);
              });

              if (
                this.terria.showSplitter &&
                isDefined(result.pickPosition) &&
                ignoreSplitter === false
              ) {
                // Select only features that are active on the same side or
                // both sides of the splitter
                const screenPosition = this._computePositionOnScreen(
                  result.pickPosition
                );
                const pickedSide = this._getSplitterSideForScreenPosition(
                  screenPosition
                );

                features = features.filter(feature => {
                  const splitDirection = (<any>feature).imageryLayer
                    .splitDirection;
                  return (
                    splitDirection === pickedSide ||
                    splitDirection === ImagerySplitDirection.NONE
                  );
                });
              }

              return resultFeaturesSoFar.concat(features);
            },
            defaultValue(existingFeatures, [])
          );
        });
      })
      .catch(() => {
        runInAction(() => {
          result.isLoading = false;
          result.error = "An unknown error occurred while picking features.";
        });
      });

    return result;
  }

  getImageryLayersForItem(item: MappableMixin.MappableMixin): ImageryLayer[] {
    return filterOutUndefined(
      item.mapItems.map(m => {
        if (ImageryParts.is(m)) {
          return this._makeImageryLayerFromParts(m, item) as ImageryLayer;
        }
      })
    );
  }

  private _makeImageryLayerFromParts(
    parts: ImageryParts,
    item: MappableMixin.MappableMixin
  ): ImageryLayer {
    const layer = this._createImageryLayer(
      parts.imageryProvider,
      parts.clippingRectangle
    );
    if (TileErrorHandlerMixin.isMixedInto(item)) {
      // because this code path can run multiple times, make sure we remove the
      // handler if it is already registered
      parts.imageryProvider.errorEvent.removeEventListener(
        item.onTileLoadError,
        item
      );
      parts.imageryProvider.errorEvent.addEventListener(
        item.onTileLoadError,
        item
      );
    }

    layer.alpha = parts.alpha;
    layer.show = parts.show;
    return layer;
  }

  /**
   * Computes the screen position of a given world position.
   * @param position The world position in Earth-centered Fixed coordinates.
   * @param [result] The instance to which to copy the result.
   * @return The screen position, or undefined if the position is not on the screen.
   */
  private _computePositionOnScreen(position: Cartesian3, result?: Cartesian2) {
    return SceneTransforms.wgs84ToWindowCoordinates(
      this.scene,
      position,
      result
    );
  }

  _selectFeature() {
    const feature = this.terria.selectedFeature;

    this._highlightFeature(feature);

    if (isDefined(feature) && isDefined(feature.position)) {
      this._selectionIndicator.position = feature.position.getValue(
        this.terria.timelineClock.currentTime
      );
      this._selectionIndicator.animateAppear();
    } else {
      this._selectionIndicator.animateDepart();
    }

    this._selectionIndicator.update();
  }

  captureScreenshot(): Promise<string> {
    const deferred: Promise<string> = new Promise((resolve, reject) => {
      const removeCallback = this.scene.postRender.addEventListener(() => {
        removeCallback();
        try {
          const cesiumCanvas = this.scene.canvas;

          // If we're using the splitter, draw the split position as a vertical white line.
          let canvas = cesiumCanvas;
          if (this.terria.showSplitter) {
            canvas = document.createElement("canvas");
            canvas.width = cesiumCanvas.width;
            canvas.height = cesiumCanvas.height;

            const context = canvas.getContext("2d");
            if (context !== undefined && context !== null) {
              context.drawImage(cesiumCanvas, 0, 0);

              const x = this.terria.splitPosition * cesiumCanvas.width;
              context.strokeStyle = this.terria.baseMapContrastColor;
              context.beginPath();
              context.moveTo(x, 0);
              context.lineTo(x, cesiumCanvas.height);
              context.stroke();
            }
          }

          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      }, this);
    });

    // since we're hooking into the post-render event, we want to render **right now** to ensure that the screenshot
    // image gets created. This is particularly important when showing the print view in a new tab.
    this.scene.render(this.terria.timelineClock.currentTime);

    return deferred;
  }

  _addVectorTileHighlight(
    imageryProvider: MapboxVectorTileImageryProvider,
    rectangle: Rectangle
  ): () => void {
    const result = new ImageryLayer(imageryProvider, {
      show: true,
      alpha: 1
    });
    const scene = this.scene;
    scene.imageryLayers.add(result);

    return function() {
      scene.imageryLayers.remove(result);
    };
  }
}

var boundingSphereScratch = new BoundingSphere();

function zoomToDataSource(
  cesium: Cesium,
  target: DataSource,
  flightDurationSeconds?: number
): Promise<void> {
  return pollToPromise(
    function() {
      const dataSourceDisplay = cesium.dataSourceDisplay;
      if (dataSourceDisplay === undefined) {
        return false;
      }

      var entities = target.entities.values;

      var boundingSpheres = [];
      for (var i = 0, len = entities.length; i < len; i++) {
        var state = BoundingSphereState.PENDING;
        try {
          // TODO: missing Cesium type info
          state = (<any>dataSourceDisplay).getBoundingSphere(
            entities[i],
            false,
            boundingSphereScratch
          );
        } catch (e) {}

        if (state === BoundingSphereState.PENDING) {
          return false;
        } else if (state !== BoundingSphereState.FAILED) {
          boundingSpheres.push(BoundingSphere.clone(boundingSphereScratch));
        }
      }

      // Test if boundingSpheres is empty to avoid zooming to nowhere
      if (boundingSpheres.length > 0) {
        var boundingSphere = BoundingSphere.fromBoundingSpheres(
          boundingSpheres
        );
        cesium.scene.camera.flyToBoundingSphere(boundingSphere, {
          duration: flightDurationSeconds,
          // By passing range=0, cesium calculates an appropriate zoom distance
          offset: new HeadingPitchRange(0, -0.5, 0)
        });
        cesium.scene.camera.lookAtTransform(Matrix4.IDENTITY);
      }
      return true;
    },
    {
      pollInterval: 100,
      timeout: 5000
    }
  );
}

function zoomToBoundingSphere(
  cesium: Cesium,
  target: {
    boundingSphere: BoundingSphere;
  },
  flightDurationSeconds?: number
) {
  var boundingSphere = target.boundingSphere;
  cesium.scene.camera.flyToBoundingSphere(boundingSphere, {
    // By passing range=0, cesium calculates an appropriate zoom distance
    offset: new HeadingPitchRange(0, -0.5, 0),
    duration: flightDurationSeconds
  });
}
