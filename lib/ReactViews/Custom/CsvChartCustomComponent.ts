import { ChartItemType } from "../../ModelMixins/ChartableMixin";
import CommonStrata from "../../Models/CommonStrata";
import CsvCatalogItem from "../../Models/CsvCatalogItem";
import { BaseModel } from "../../Models/Model";
import ChartCustomComponent, {
  ChartCustomComponentAttributes,
  splitStringIfDefined
} from "./ChartCustomComponent";
import { ProcessNodeContext } from "./CustomComponent";

interface CsvChartCustomComponentAttributes
  extends ChartCustomComponentAttributes {
  /** If present, the chart is updated from [poll-sources] every [poll-seconds] seconds.
   *  TODO: Returned data is merged into existing data and shown. */
  pollSeconds?: number;

  /** Comma-separated list of URLs to poll every [poll-seconds] seconds. Defaults to sources */
  pollSources?: string[];

  /** Either 'true' or 'false' (case sensitive). Pass 'true' to completely replace the data, 'false' to update the existing data. Defaults to false (updating). */
  pollReplace?: boolean;

  /** Set to a non-empty string to display a disclaimer at the top of the chart panel when this chart is expanded into the chart panel. */
  chartDisclaimer?: string;

  /** Set the chart type. Note that only "line" and "lineAndPoint" are supported. */
  chartType?: string;
}

// Any chart type not listed here won't work, because FeatureInfoPanelChart only draws line charts.
const SUPPORTED_CHART_TYPES = ["line", "lineAndPoint"];

export default class CsvChartCustomComponent extends ChartCustomComponent<
  CsvCatalogItem
> {
  get name(): string {
    // For backward compatibility reasons, since the original ChartCustomComponent assumed your catalog item was a Csv, we use the name "chart" even though "csv-chart" would be more correct
    return "chart";
  }

  get attributes(): string[] {
    return super.attributes.concat([
      "poll-seconds",
      "poll-sources",
      "poll-replace",
      "chart-disclaimer",
      "chart-type"
    ]);
  }

  protected constructCatalogItem(
    id: string | undefined,
    context: ProcessNodeContext,
    sourceReference: BaseModel | undefined
  ): CsvCatalogItem {
    return new CsvCatalogItem(id, context.terria, sourceReference);
  }

  protected setTraitsFromAttrs(
    item: CsvCatalogItem,
    attrs: CsvChartCustomComponentAttributes,
    sourceIndex: number
  ) {
    // Set url
    item.setTrait(
      CommonStrata.user,
      "url",
      attrs.sources && attrs.sources[sourceIndex]
    );

    // Set name
    let name = attrs.title;
    if (attrs.sourceNames && attrs.sourceNames[sourceIndex]) {
      name = `${name} - ${attrs.sourceNames[sourceIndex]}`;
    }
    item.setTrait(CommonStrata.user, "name", name);

    // Set polling traits
    if (attrs.pollSeconds) {
      const pollUrl = attrs.pollSources && attrs.pollSources[sourceIndex];
      item.polling.setTrait(CommonStrata.user, "seconds", attrs.pollSeconds);
      item.polling.setTrait(CommonStrata.user, "url", pollUrl);
      item.polling.setTrait(
        CommonStrata.user,
        "shouldReplaceData",
        attrs.pollReplace
      );
    }

    if (!!attrs.chartDisclaimer) {
      item.setTrait(
        CommonStrata.user,
        "chartDisclaimer",
        attrs.chartDisclaimer
      );
    }

    if (attrs.columnTitles !== undefined) {
      // Set column titles
      // there are 2 ways to set column title
      // if a {name, title} object is given, directly set the title on the column object
      // if a plain string is given, then we do not know the name of the column, so set the
      // title on the items `columnTitles` array.
      attrs.columnTitles.forEach((entry, colNumber) => {
        if (typeof entry === "string") {
          const titles = item.columnTitles.slice();
          titles[colNumber] = entry;
          item.setTrait(CommonStrata.user, "columnTitles", titles);
        } else {
          const { name, title } = entry;
          const column = item.addObject(CommonStrata.user, "columns", name)!;
          column.setTrait(CommonStrata.user, "title", title);
        }
      });
    }

    if (attrs.columnUnits !== undefined) {
      // Set column units
      // there are 2 ways to set column unit
      // if a {name, unit} object is given, directly set the unit on the column object
      // if a plain string is given, then we do not know the name of the column, so set the
      // unit on the items `columnUnits` array.
      attrs.columnUnits.forEach((entry, colNumber) => {
        if (typeof entry === "string") {
          const units = item.columnUnits.slice();
          units[colNumber] = entry;
          item.setTrait(CommonStrata.user, "columnUnits", units);
        } else {
          const { name, units } = entry;
          const column = item.addObject(CommonStrata.user, "columns", name)!;
          column.setTrait(CommonStrata.user, "units", units);
        }
      });
    }

    const chartStyle = item.addObject(CommonStrata.user, "styles", "chart")!;

    // Set chart type
    if (
      attrs.chartType !== undefined &&
      SUPPORTED_CHART_TYPES.some(supported => supported === attrs.chartType)
    ) {
      item.setTrait(
        CommonStrata.user,
        "chartType",
        attrs.chartType as ChartItemType
      );
    }

    // Set chart axes
    if (attrs.xColumn || attrs.yColumns) {
      chartStyle.chart.setTrait(
        CommonStrata.user,
        "xAxisColumn",
        attrs.xColumn
      );

      (attrs.yColumns || []).forEach(y => {
        chartStyle.chart.addObject(CommonStrata.user, "lines", y)!;
      });

      item.setTrait(CommonStrata.user, "activeStyle", "chart");
    }
  }

  setTraitsFromBody = (item: CsvCatalogItem, csvString: string) => {
    item.setTrait(CommonStrata.user, "csvString", csvString);
  };

  protected parseNodeAttrs(nodeAttrs: {
    [name: string]: string | undefined;
  }): CsvChartCustomComponentAttributes {
    const parsed: CsvChartCustomComponentAttributes = super.parseNodeAttrs(
      nodeAttrs
    );
    parsed.pollSeconds = parseIntOrUndefined(nodeAttrs["poll-seconds"]);
    parsed.pollSources = splitStringIfDefined(nodeAttrs["poll-sources"]);
    parsed.pollReplace = nodeAttrs["poll-replace"] === "true";
    parsed.chartDisclaimer = nodeAttrs["chart-disclaimer"] || undefined;
    parsed.chartType = nodeAttrs["chart-type"];
    return parsed;
  }
}

function parseIntOrUndefined(s: string | undefined): number | undefined {
  const maybeInt = parseInt(s || "");
  return isNaN(maybeInt) ? undefined : maybeInt;
}
