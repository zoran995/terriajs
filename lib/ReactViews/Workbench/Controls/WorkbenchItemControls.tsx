import { observer } from "mobx-react";
import React from "react";
import hasTraits from "../../../Models/Definition/hasTraits";
import { BaseModel } from "../../../Models/Definition/Model";
import { DEFAULT_PLACEMENT } from "../../../Models/SelectableDimensions/SelectableDimensions";
import ViewState from "../../../ReactViewModels/ViewState";
import WebMapServiceCatalogItemTraits from "../../../Traits/TraitsClasses/WebMapServiceCatalogItemTraits";
import ChartItemSelector from "./ChartItemSelector";
import ColorScaleRangeSection from "./ColorScaleRangeSection";
import DateTimeSelectorSection from "./DateTimeSelectorSection";
import DimensionSelectorSection from "./DimensionSelectorSection";
import FilterSection from "./FilterSection";
import Legend from "./Legend";
import OpacitySection from "./OpacitySection";
import SatelliteImageryTimeFilterSection from "./SatelliteImageryTimeFilterSection";
import { ScaleWorkbenchInfo } from "./ScaleWorkbenchInfo";
import ShortReport from "./ShortReport";
import TimerSection from "./TimerSection";
import ViewingControls from "./ViewingControls";
import { Complete } from "../../../Core/TypeModifiers";
import DiscretelyTimeVaryingMixin from "../../../ModelMixins/DiscretelyTimeVaryingMixin";

type WorkbenchControls = {
  viewingControls?: boolean;
  opacity?: boolean;
  scaleWorkbench?: boolean;
  timer?: boolean;
  chartItems?: boolean;
  filter?: boolean;
  dateTime?: boolean;
  timeFilter?: boolean;
  selectableDimensions?: boolean;
  colorScaleRange?: boolean;
  shortReport?: boolean;
  legend?: boolean;
};

type WorkbenchItemControlsProps = {
  item: BaseModel;
  viewState: ViewState;
  /** Flag to show each control - defaults to all true */
  controls?: WorkbenchControls;
};

export const defaultControls: Complete<WorkbenchControls> = {
  viewingControls: true,
  opacity: true,
  scaleWorkbench: true,
  timer: true,
  chartItems: true,
  filter: true,
  dateTime: true,
  timeFilter: true,
  selectableDimensions: true,
  colorScaleRange: true,
  shortReport: true,
  legend: true
};

export const hideAllControls: Complete<WorkbenchControls> = {
  viewingControls: false,
  opacity: false,
  scaleWorkbench: false,
  timer: false,
  chartItems: false,
  filter: false,
  dateTime: false,
  timeFilter: false,
  selectableDimensions: false,
  colorScaleRange: false,
  shortReport: false,
  legend: false
};

const WorkbenchItemControls: React.FC<WorkbenchItemControlsProps> = observer(
  ({ item, viewState, controls: controlsWithoutDefaults }) => {
    const controls = { ...defaultControls, ...controlsWithoutDefaults };

    return (
      <>
        {controls?.viewingControls ? (
          <ViewingControls item={item} viewState={viewState} />
        ) : null}
        {controls?.opacity ? <OpacitySection item={item} /> : null}
        {controls?.scaleWorkbench ? <ScaleWorkbenchInfo item={item} /> : null}
        {controls?.timer ? <TimerSection item={item} /> : null}
        {controls?.chartItems ? <ChartItemSelector item={item} /> : null}
        {controls?.filter ? <FilterSection item={item} /> : null}
        {controls?.dateTime && DiscretelyTimeVaryingMixin.isMixedInto(item) ? (
          <DateTimeSelectorSection item={item} />
        ) : null}
        {controls?.timeFilter ? (
          <SatelliteImageryTimeFilterSection item={item} />
        ) : null}
        {controls?.selectableDimensions ? (
          <DimensionSelectorSection item={item} placement={DEFAULT_PLACEMENT} />
        ) : null}
        {/* TODO: remove min max props and move the checks to
      ColorScaleRangeSection to keep this component simple. */}
        {controls?.colorScaleRange &&
          hasTraits(
            item,
            WebMapServiceCatalogItemTraits,
            "colorScaleMinimum"
          ) &&
          hasTraits(
            item,
            WebMapServiceCatalogItemTraits,
            "colorScaleMaximum"
          ) && (
            <ColorScaleRangeSection
              item={item}
              minValue={item.colorScaleMinimum}
              maxValue={item.colorScaleMaximum}
            />
          )}
        {controls?.shortReport ? <ShortReport item={item} /> : null}
        {controls?.legend ? <Legend item={item} /> : null}
        {controls?.selectableDimensions ? (
          <DimensionSelectorSection item={item} placement={"belowLegend"} />
        ) : null}
      </>
    );
  }
);

export default WorkbenchItemControls;
