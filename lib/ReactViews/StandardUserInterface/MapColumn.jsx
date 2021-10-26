import classNames from "classnames";
import createReactClass from "create-react-class";
import { observer } from "mobx-react";
import "mutationobserver-shim";
import PropTypes from "prop-types";
import React from "react";
import { withTranslation } from "react-i18next";
// import defined from "terriajs-cesium/Source/Core/defined";
import FeatureDetection from "terriajs-cesium/Source/Core/FeatureDetection";
import BottomDock from "../BottomDock/BottomDock";
import MapDataCount from "../BottomDock/MapDataCount";
import Loader from "../Loader";
import DistanceLegend from "../Map/Legend/DistanceLegend";
// import FeedbackButton from "../Feedback/FeedbackButton";
import LocationBar from "../Map/Legend/LocationBar";
import MenuBar from "../Map/MenuBar";
import MapNavigation from "../Map/Navigation/MapNavigation";
import TerriaViewerWrapper from "../Map/TerriaViewerWrapper";
import SlideUpFadeIn from "../Transitions/SlideUpFadeIn/SlideUpFadeIn";
import Styles from "./map-column.scss";
import Toast from "./Toast";

const chromeVersion = FeatureDetection.chromeVersion();

/**
 * Right-hand column that contains the map, controls that sit over the map and sometimes the bottom dock containing
 * the timeline and charts.
 *
 * Note that because IE9-11 is terrible the pure-CSS layout that is used in nice browsers doesn't work, so for IE only
 * we use a (usually polyfilled) MutationObserver to watch the bottom dock and resize when it changes.
 */
const MapColumn = observer(
  createReactClass({
    displayName: "MapColumn",

    propTypes: {
      terria: PropTypes.object.isRequired,
      viewState: PropTypes.object.isRequired,
      customFeedbacks: PropTypes.array.isRequired,
      allBaseMaps: PropTypes.array.isRequired,
      animationDuration: PropTypes.number.isRequired,
      customElements: PropTypes.object.isRequired,
      t: PropTypes.func.isRequired
    },

    getInitialState() {
      return {};
    },

    render() {
      const { customElements } = this.props;
      // const { t } = this.props;
      // TODO: remove? see: https://bugs.chromium.org/p/chromium/issues/detail?id=1001663
      const isAboveChrome75 =
        chromeVersion && chromeVersion[0] && Number(chromeVersion[0]) > 75;
      const mapCellClass = classNames(Styles.mapCell, {
        [Styles.mapCellChrome]: isAboveChrome75
      });
      return (
        <div
          className={classNames(Styles.mapInner, {
            [Styles.mapInnerChrome]: isAboveChrome75
          })}
        >
          <div className={Styles.mapRow}>
            <div className={classNames(mapCellClass, Styles.mapCellMap)}>
              <If condition={!this.props.viewState.hideMapUi}>
                <div
                  css={`
                    ${this.props.viewState.explorerPanelIsVisible &&
                      "opacity: 0.3;"}
                  `}
                >
                  <MenuBar
                    terria={this.props.terria}
                    viewState={this.props.viewState}
                    allBaseMaps={this.props.allBaseMaps}
                    menuItems={customElements.menu}
                    menuLeftItems={customElements.menuLeft}
                    animationDuration={this.props.animationDuration}
                    elementConfig={this.props.terria.elements.get("menu-bar")}
                  />
                  <MapNavigation
                    terria={this.props.terria}
                    viewState={this.props.viewState}
                    navItems={customElements.nav}
                    elementConfig={this.props.terria.elements.get(
                      "map-navigation"
                    )}
                  />
                </div>
              </If>
              <div
                className={Styles.mapWrapper}
                style={{
                  height: this.state.height || "100%"
                }}
              >
                <TerriaViewerWrapper
                  terria={this.props.terria}
                  viewState={this.props.viewState}
                />
              </div>
              <If condition={!this.props.viewState.hideMapUi}>
                <MapDataCount
                  terria={this.props.terria}
                  viewState={this.props.viewState}
                  elementConfig={this.props.terria.elements.get(
                    "map-data-count"
                  )}
                />
                <SlideUpFadeIn isVisible={this.props.viewState.isMapZooming}>
                  <Toast>
                    <Loader
                      message={this.props.t("toast.mapIsZooming")}
                      textProps={{
                        style: {
                          padding: "0 5px"
                        }
                      }}
                    />
                  </Toast>
                </SlideUpFadeIn>
                <div className={Styles.locationDistance}>
                  <LocationBar
                    terria={this.props.terria}
                    mouseCoords={this.props.terria.currentViewer.mouseCoords}
                  />
                  <DistanceLegend terria={this.props.terria} />
                </div>
              </If>
              <If
                condition={
                  this.props.customFeedbacks.length &&
                  this.props.terria.configParameters.feedbackUrl &&
                  !this.props.viewState.hideMapUi
                }
              >
                <For
                  each="feedbackItem"
                  of={this.props.customFeedbacks}
                  index="i"
                >
                  <div key={i}>{feedbackItem}</div>
                </For>
              </If>
            </div>
            <If condition={this.props.terria.configParameters.printDisclaimer}>
              <div className={classNames(Styles.mapCell, "print")}>
                <a
                  className={Styles.printDisclaimer}
                  href={this.props.terria.configParameters.printDisclaimer.url}
                >
                  {this.props.terria.configParameters.printDisclaimer.text}
                </a>
              </div>
            </If>
          </div>
          <If condition={!this.props.viewState.hideMapUi}>
            <div className={Styles.mapRow}>
              <div className={mapCellClass}>
                <BottomDock
                  terria={this.props.terria}
                  viewState={this.props.viewState}
                />
              </div>
            </div>
          </If>
        </div>
      );
    }
  })
);

export default withTranslation()(MapColumn);
