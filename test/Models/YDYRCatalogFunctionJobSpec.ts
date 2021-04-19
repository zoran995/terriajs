import { configure, reaction } from "mobx";
import CommonStrata from "../../lib/Models/CommonStrata";
import CsvCatalogItem from "../../lib/Models/CsvCatalogItem";
import Terria from "../../lib/Models/Terria";
import YDYRCatalogFunctionJob from "../../lib/Models/YDYRCatalogFunctionJob";
import "../SpecHelpers";

// For more tests see - test\Models\YDYRCatalogFunctionSpec.ts

const regionMapping = JSON.stringify(
  require("../../wwwroot/data/regionMapping.json")
);
configure({
  enforceActions: "observed",
  computedRequiresReaction: true
});

describe("YDYRCatalogFunctionJob", function() {
  let terria: Terria;
  let job: YDYRCatalogFunctionJob;

  beforeEach(async function() {
    jasmine.Ajax.install();

    jasmine.Ajax.stubRequest(
      "http://example.com/api/v1/download/someResultKey?format=csv"
    ).andReturn({
      responseText: `SA4_code_2016,Negative Binomial: Lower (10%),Negative Binomial: Upper (90%),Negative Binomial: Average
313,0,1,0
316,0,1,0
`
    });

    let logCounter = 0;
    jasmine.Ajax.stubRequest(
      "http://example.com/api/v1/status/someStatusId"
    ).andCallFunction(req => {
      if (logCounter < 1) {
        req.respondWith({ responseText: `"Some Log ${logCounter}"` });
        console.log(`"Some Log ${logCounter}"`);

        logCounter++;
      } else {
        req.respondWith({
          responseText: `{"key":"someResultKey","report":{"Quality Control":"OK (Model is performing better than baseline), providing full result"}}`
        });
      }
    });

    jasmine.Ajax.stubRequest(
      "build/TerriaJS/data/regionMapping.json"
    ).andReturn({ responseText: regionMapping });

    terria = new Terria();

    job = new YDYRCatalogFunctionJob("testYdyr", terria);
    job.setTrait(CommonStrata.definition, "parameters", {
      apiUrl: "http://example.com/api/v1/",
      "Negative Binomial": true,
      "Population Weighted": false,
      "Poisson Linear": false,
      "Ridge Regressor": false,
      "Output Geography": "ABS - 2016 Statistical Areas Level 4"
    });
    job.setTrait(CommonStrata.user, "jobStatus", "running");
    job.setTrait(CommonStrata.user, "refreshEnabled", true);
    job.setTrait(CommonStrata.definition, "jobId", "someStatusId");
  });

  afterEach(function() {
    jasmine.Ajax.uninstall();
  });

  it("has a type & typeName", function() {
    expect(YDYRCatalogFunctionJob.type).toBe("ydyr-job");
    expect(job.typeName).toBe("YourDataYourRegions Job");
  });

  describe("start polling after added to workbench", async function() {
    let dispose: () => void;
    beforeEach(() => {
      terria.workbench.add(job);
      dispose = reaction(
        () => job.mapItems,
        () => {}
      );
    });
    afterEach(() => {
      dispose();
    });

    it("should be in workbench", async function() {
      expect(job.inWorkbench).toBeTruthy();
    });

    it("polls twice - and creates 2 log entries", async function() {
      // Wait until job finished
      await new Promise(resolve => {
        reaction(
          () => job.jobStatus,
          status => (status === "finished" ? resolve() : undefined)
        );
      });

      expect(job.logs.length).toBe(2);
      expect(job.logs).toEqual([
        "Some Log 0",
        `{"key":"someResultKey","report":{"Quality Control":"OK (Model is performing better than baseline), providing full result"}}`
      ]);

      expect(job.resultId).toBe("someResultKey");
    });
    it("downloads results and creates CSVCatalogItem", async function() {
      // Wait until job finished downloading results
      await new Promise(resolve => {
        reaction(
          () => job.downloadedResults,
          downloadedResults => (downloadedResults ? resolve() : undefined)
        );
      });

      expect(job.results.length).toBe(1);
      expect(job.results[0].type).toBe(CsvCatalogItem.type);
      const result = job.results[0] as CsvCatalogItem;

      await result.loadMapItems();

      expect(result.tableColumns.length).toBe(4);
      expect(result.activeStyle).toBe("Negative Binomial: Lower (10%)");
      expect(result.regionProviderDimensions?.selectedId).toBe("SA4_2016");
      expect(result.enableManualRegionMapping).toBeTruthy();
      expect(result.inWorkbench).toBeTruthy();
    });
  });
});
