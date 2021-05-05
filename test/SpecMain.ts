/// <reference types="jasmine" />
import "../lib/Core/prerequisites";
import "jasmine-ajax";
import { configure, spy } from "mobx";
import i18next from "i18next";
import registerCatalogMembers from "../lib/Models/registerCatalogMembers";
import Enzyme from "enzyme";
import Adapter from "enzyme-adapter-react-16";

configure({
  enforceActions: true,
  computedRequiresReaction: true,
  computedConfigurable: true // so that we can spy on computed items
});

registerCatalogMembers();

Enzyme.configure({ adapter: new Adapter() });

// Fail the test if a MobX computed property throws an exception.
spy(event => {
  if (event.type === "error") {
    fail(event.message);
  }
});

beforeAll(async function() {
  await i18next.init({
    lng: "cimode",
    debug: false
  });
});

jasmine.getEnv().addReporter({
  specDone: result =>
    (result.failedExpectations || []).forEach(expectation =>
      console.warn(expectation.stack)
    )
});

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
