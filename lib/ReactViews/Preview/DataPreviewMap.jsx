"use strict";

import classNames from "classnames";
import { action, autorun, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import PropTypes from "prop-types";
import React from "react";
import { withTranslation } from "react-i18next";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import filterOutUndefined from "../../Core/filterOutUndefined";
import MappableMixin, { ImageryParts } from "../../ModelMixins/MappableMixin";
import CommonStrata from "../../Models/CommonStrata";
import CreateModel from "../../Models/CreateModel";
import GeoJsonCatalogItem from "../../Models/GeoJsonCatalogItem";
import ViewerMode from "../../Models/ViewerMode";
import MappableTraits from "../../Traits/MappableTraits";
import TerriaViewer from "../../ViewModels/TerriaViewer";
import Styles from "./data-preview-map.scss";

class AdaptForPreviewMap extends MappableMixin(CreateModel(MappableTraits)) {
  previewed;

  async forceLoadMapItems() {}

  // Make all imagery 0 or 100% opacity
  @computed
  get mapItems() {
    return (
      this.previewed?.mapItems.map(m =>
        ImageryParts.is(m)
          ? {
              ...m,
              alpha: m.alpha !== 0.0 ? 1.0 : 0.0,
              show: true
            }
          : m
      ) ?? []
    );
  }
}

/**
 * Leaflet-based preview map that sits within the preview.
 */

/**
 * @typedef {object} Props
 * @prop {Terria} terria
 * @prop {Mappable} previewed
 * @prop {boolean} showMap
 *
 */

// TODO: Can this.props.previewed be undefined?
/**
 *
 * @extends {React.Component<Props>}
 */
@observer
class DataPreviewMap extends React.Component {
  @observable
  isZoomedToExtent = false;

  /**
   * @type {TerriaViewer}
   * @readonly
   */
  previewViewer;

  /**
   * @type {string}
   */
  @observable
  previewBadgeState = "";

  static propTypes = {
    terria: PropTypes.object.isRequired,
    previewed: PropTypes.object,
    showMap: PropTypes.bool,
    t: PropTypes.func.isRequired
  };

  @action
  setPreviewBadgeState(text) {
    this.previewBadgeState = text;
  }

  constructor(props) {
    super(props);

    /**
     * @param {HTMLElement | null} container
     */
    this.containerRef = action(container => {
      this.previewViewer.attached && this.previewViewer.detach();
      if (container !== null) {
        this.initPreview(container);
      }
    });
    this.previewViewer = new TerriaViewer(
      this.props.terria,
      computed(() => {
        const previewItem = new AdaptForPreviewMap();
        previewItem.previewed = this.props.previewed;
        // Can previewed be undefined?
        return filterOutUndefined([
          previewItem,
          this.boundingRectangleCatalogItem
        ]);
      })
    );
    runInAction(() => {
      this.previewViewer.viewerMode = ViewerMode.Leaflet;
      this.previewViewer.disableInteraction = true;
      this.previewViewer.homeCamera = this.props.terria.mainViewer.homeCamera;
    });
    // Not yet implemented
    // previewViewer.hideTerriaLogo = true;
    // previewViewer.homeView = terria.homeView;
    // previewViewer.initialView = terria.homeView;
  }

  /**
   * @param {HTMLElement} container
   */
  @action
  initPreview(container) {
    console.log(
      "Initialising preview map. This might be expensive, so this should only show up when the preview map disappears and reappears"
    );
    this.isZoomedToExtent = false;

    // Find preview basemap using `terria.previewBaseMapId`
    const initPreviewBaseMap = this.props.terria.baseMaps.find(
      baseMap =>
        baseMap.mappable.uniqueId === this.props.terria.previewBaseMapId
    );
    if (initPreviewBaseMap !== undefined) {
      this.previewViewer.setBaseMap(initPreviewBaseMap.mappable);
    } else {
      this.previewViewer.setBaseMap(
        this.props.terria.baseMaps.length > 0
          ? this.props.terria.baseMaps[0].mappable
          : undefined
      );
    }

    this.previewViewer.attach(container);
    this._disposePreviewBadgeStateUpdater = autorun(() => {
      if (this.props.showMap && this.props.previewed !== undefined) {
        this.setPreviewBadgeState("loading");
        this.props.previewed.loadMapItems().then(() => {
          this.setPreviewBadgeState("dataPreview");
        });
      }
    });
    this._disposeZoomToExtentSubscription = autorun(() => {
      if (this.isZoomedToExtent) {
        this.previewViewer.currentViewer.zoomTo(this.props.previewed);
      } else {
        this.previewViewer.currentViewer.zoomTo(this.previewViewer.homeCamera);
      }
    });

    // this._unsubscribeErrorHandler = this.terriaPreview.addErrorEventListener(
    //   e => {
    //     if (
    //       e.sender === this.props.previewedCatalogItem ||
    //       (e.sender &&
    //         e.sender.nowViewingCatalogItem ===
    //           this.props.previewedCatalogItem)
    //     ) {
    //       this._errorPreviewingCatalogItem = true;
    //       this.setState({
    //         previewBadgeText: "NO PREVIEW AVAILABLE"
    //       });
    //     }
    //   }
    // );
  }

  componentWillUnmount() {
    this._disposePreviewBadgeStateUpdater &&
      this._disposePreviewBadgeStateUpdater();
    this._disposeZoomToExtentSubscription &&
      this._disposeZoomToExtentSubscription();
    this.previewViewer.detach();

    if (this._unsubscribeErrorHandler) {
      this._unsubscribeErrorHandler();
      this._unsubscribeErrorHandler = undefined;
    }
  }

  @computed
  get boundingRectangleCatalogItem() {
    const rectangle = this.props.previewed.rectangle;
    if (rectangle === undefined) {
      return undefined;
    }

    let west = rectangle.west;
    let south = rectangle.south;
    let east = rectangle.east;
    let north = rectangle.north;

    if (
      west === undefined ||
      south === undefined ||
      east === undefined ||
      north === undefined
    ) {
      return undefined;
    }

    if (!this.isZoomedToExtent) {
      // When zoomed out, make sure the dataset rectangle is at least 5% of the width and height
      // the home view, so that it is actually visible.
      const minimumFraction = 0.05;
      const homeView = this.previewViewer.homeCamera;
      const minimumWidth =
        CesiumMath.toDegrees(homeView.rectangle.width) * minimumFraction;
      if (east - west < minimumWidth) {
        const center = (east + west) * 0.5;
        west = center - minimumWidth * 0.5;
        east = center + minimumWidth * 0.5;
      }

      const minimumHeight =
        CesiumMath.toDegrees(homeView.rectangle.height) * minimumFraction;
      if (north - south < minimumHeight) {
        const center = (north + south) * 0.5;
        south = center - minimumHeight * 0.5;
        north = center + minimumHeight * 0.5;
      }
    }

    const rectangleCatalogItem = new GeoJsonCatalogItem(
      "__preview-data-extent",
      this.props.terria
    );
    rectangleCatalogItem.setTrait(CommonStrata.user, "geoJsonData", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            stroke: "#08ABD5",
            "stroke-width": 2,
            "stroke-opacity": 1
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [west, south],
              [west, north],
              [east, north],
              [east, south],
              [west, south]
            ]
          }
        }
      ]
    });
    rectangleCatalogItem.loadMapItems();
    return rectangleCatalogItem;
  }

  @action.bound
  clickMap(evt) {
    this.isZoomedToExtent = !this.isZoomedToExtent;
  }

  render() {
    const { t } = this.props;
    const previewBadgeLabels = {
      loading: t("preview.loading"),
      noPreviewAvailable: t("preview.noPreviewAvailable"),
      dataPreview: t("preview.dataPreview"),
      dataPreviewError: t("preview.dataPreviewError")
    };
    return (
      <div className={Styles.map} onClick={this.clickMap}>
        <Choose>
          <When condition={this.props.showMap}>
            <div
              className={classNames(Styles.terriaPreview)}
              ref={this.containerRef}
            />
          </When>
          <Otherwise>
            <div
              className={classNames(Styles.terriaPreview, Styles.placeholder)}
            />
          </Otherwise>
        </Choose>

        <label className={Styles.badge}>
          {previewBadgeLabels[this.previewBadgeState]}
        </label>
      </div>
    );
  }
}

export default withTranslation()(DataPreviewMap);

// Unported code

//   componentWillUnmount() {
//     this.destroyPreviewMap();

//     if (this._unsubscribeErrorHandler) {
//       this._unsubscribeErrorHandler();
//       this._unsubscribeErrorHandler = undefined;
//     }
//   },

//   /* eslint-disable-next-line camelcase */
//   UNSAFE_componentWillReceiveProps(newProps) {
//     if (newProps.showMap && !this.props.showMap) {
//       this.initMap(newProps.previewedCatalogItem);
//     } else {
//       this.updatePreview(newProps.previewedCatalogItem);
//     }
//   },

//   updatePreview(previewedCatalogItem) {
//     if (this.lastPreviewedCatalogItem === previewedCatalogItem) {
//       return;
//     }

//     if (previewedCatalogItem) {
//       this.props.terria.analytics.logEvent(
//         "dataSource",
//         "preview",
//         previewedCatalogItem.name
//       );
//     }

//     this.lastPreviewedCatalogItem = previewedCatalogItem;

//     this.setState({
//       previewBadgeText: "DATA PREVIEW LOADING..."
//     });

//     this.isZoomedToExtent = false;
//     this.terriaPreview.currentViewer.zoomTo(this.terriaPreview.homeView);

//     if (defined(this.removePreviewFromMap)) {
//       this.removePreviewFromMap();
//       this.removePreviewFromMap = undefined;
//     }

//     if (defined(this.rectangleCatalogItem)) {
//       this.rectangleCatalogItem.isEnabled = false;
//     }

//     const previewed = previewedCatalogItem;
//     if (previewed && defined(previewed.type) && previewed.isMappable) {
//       const that = this;
//       return when(previewed.load())
//         .then(() => {
//           // If this item has a separate now viewing item, load it before continuing.
//           let nowViewingItem;
//           let loadNowViewingItemPromise;
//           if (defined(previewed.nowViewingCatalogItem)) {
//             nowViewingItem = previewed.nowViewingCatalogItem;
//             loadNowViewingItemPromise = when(nowViewingItem.load());
//           } else {
//             nowViewingItem = previewed;
//             loadNowViewingItemPromise = when();
//           }

//           return loadNowViewingItemPromise.then(() => {
//             // Now that the item is loaded, add it to the map.
//             // Unless we've started previewing something else in the meantime!
//             if (
//               !that._unsubscribeErrorHandler ||
//               previewed !== that.lastPreviewedCatalogItem
//             ) {
//               return;
//             }

//             if (defined(nowViewingItem.showOnSeparateMap)) {
//               if (
//                 defined(nowViewingItem.clock) &&
//                 defined(nowViewingItem.clock.currentTime)
//               ) {
//                 that.terriaPreview.clock.currentTime =
//                   nowViewingItem.clock.currentTime;
//               }

//               this._errorPreviewingCatalogItem = false;
//               that.removePreviewFromMap = nowViewingItem.showOnSeparateMap(
//                 that.terriaPreview.currentViewer
//               );

//               if (this._errorPreviewingCatalogItem) {
//                 this.setState({
//                   previewBadgeText: "NO PREVIEW AVAILABLE"
//                 });
//               } else if (that.removePreviewFromMap) {
//                 this.setState({
//                   previewBadgeText: "DATA PREVIEW"
//                 });
//               } else {
//                 this.setState({
//                   previewBadgeText: "NO PREVIEW AVAILABLE"
//                 });
//               }
//             } else {
//               this.setState({
//                 previewBadgeText: "NO PREVIEW AVAILABLE"
//               });
//             }

//             that.updateBoundingRectangle(previewed);
//           });
//         })
//         .otherwise(err => {
//           console.error(err);

//           this.setState({
//             previewBadgeText: "DATA PREVIEW ERROR"
//           });
//         });
//     }
//   },

//   clickMap() {
//     if (!defined(this.props.previewedCatalogItem)) {
//       return;
//     }

//     this.isZoomedToExtent = !this.isZoomedToExtent;

//     if (this.isZoomedToExtent) {
//       const catalogItem = defaultValue(
//         this.props.previewedCatalogItem.nowViewingCatalogItem,
//         this.props.previewedCatalogItem
//       );
//       if (defined(catalogItem.rectangle)) {
//         this.terriaPreview.currentViewer.zoomTo(catalogItem.rectangle);
//       }
//     } else {
//       this.terriaPreview.currentViewer.zoomTo(this.terriaPreview.homeView);
//     }

//     this.updateBoundingRectangle(this.props.previewedCatalogItem);
//   },
