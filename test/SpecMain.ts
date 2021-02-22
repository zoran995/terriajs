/*global require*/
/// <reference types="jasmine" />
import "../lib/Core/prerequisites";
import "jasmine-ajax";
import { configure, spy } from "mobx";
import i18next from "i18next";
import registerCatalogMembers from "../lib/Models/registerCatalogMembers";

configure({
  enforceActions: true,
  computedRequiresReaction: true
});

registerCatalogMembers();

// Fail the test if a MobX computed property throws an exception.
spy(event => {
  if (event.type === "error") {
    fail(event.message);
  }
});

beforeEach(function() {
  i18next.init({
    lng: "cimode",
    fallbackLng: "cimode",
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
