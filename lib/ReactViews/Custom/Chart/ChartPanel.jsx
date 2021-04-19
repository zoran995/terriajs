"use strict";

import { observer } from "mobx-react";
import { computed } from "mobx";
import PropTypes from "prop-types";
import React from "react";
import { withTranslation } from "react-i18next";
import defined from "terriajs-cesium/Source/Core/defined";
import raiseErrorOnRejectedPromise from "../../../Models/raiseErrorOnRejectedPromise";
import Icon from "../../../Styled/Icon";
import ChartPanelDownloadButton from "./ChartPanelDownloadButton";
import Loader from "../../Loader";
import Styles from "./chart-panel.scss";
import Chart from "./BottomDockChart";
import ChartView from "../../../Charts/ChartView.ts";

const height = 300;

@observer
class ChartPanel extends React.Component {
  static displayName = "ChartPanel";

  static propTypes = {
    terria: PropTypes.object.isRequired,
    onHeightChange: PropTypes.func,
    viewState: PropTypes.object.isRequired,
    animationDuration: PropTypes.number,
    t: PropTypes.func.isRequired
  };

  @computed
  get chartView() {
    return new ChartView(this.props.terria);
  }

  closePanel() {
    this.chartView.chartItems.forEach(chartItem => {
      chartItem.updateIsSelectedInWorkbench(false);
    });
  }

  componentDidUpdate() {
    if (defined(this.props.onHeightChange)) {
      this.props.onHeightChange();
    }
  }

  render() {
    const chartItems = this.chartView.chartItems.filter(
      c => c.showInChartPanel
    );
    this.props.terria.currentViewer.notifyRepaintRequired();
    if (chartItems.length === 0) {
      return null;
    }

    const isLoading = false;
    // const isLoading =
    //   chartableItems.length > 0 &&
    //   chartableItems[chartableItems.length - 1].isLoading;

    let loader;
    let chart;
    if (isLoading) {
      loader = <Loader className={Styles.loader} />;
    }
    const items = this.props.terria.workbench.items;
    if (items.length > 0) {
      const loadPromises = items.map(
        item => item.loadMapItems && item.loadMapItems()
      );
      raiseErrorOnRejectedPromise(this.props.terria, Promise.all(loadPromises));

      chart = (
        <Chart
          terria={this.props.terria}
          chartItems={chartItems}
          xAxis={this.chartView.xAxis}
          height={height - 34}
        />
      );
    }
    const { t } = this.props;
    return (
      <div className={Styles.holder}>
        <div className={Styles.inner}>
          <div className={Styles.chartPanel} style={{ height: height }}>
            <div className={Styles.body}>
              <div className={Styles.header}>
                <label className={Styles.sectionLabel}>
                  {loader || t("chart.sectionLabel")}
                </label>
                <ChartPanelDownloadButton chartableItems={chartItems} />
                <button
                  type="button"
                  title={t("chart.closePanel")}
                  className={Styles.btnCloseChartPanel}
                  onClick={() => this.closePanel()}
                >
                  <Icon glyph={Icon.GLYPHS.close} />
                </button>
              </div>
              <div className={Styles.chart}>{chart}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default withTranslation()(ChartPanel);
