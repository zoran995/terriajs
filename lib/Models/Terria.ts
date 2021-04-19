import i18next from "i18next";
import { action, computed, observable, runInAction, toJS, when } from "mobx";
import { createTransformer } from "mobx-utils";
import Clock from "terriajs-cesium/Source/Core/Clock";
import defaultValue from "terriajs-cesium/Source/Core/defaultValue";
import defined from "terriajs-cesium/Source/Core/defined";
import DeveloperError from "terriajs-cesium/Source/Core/DeveloperError";
import CesiumEvent from "terriajs-cesium/Source/Core/Event";
import queryToObject from "terriajs-cesium/Source/Core/queryToObject";
import RequestScheduler from "terriajs-cesium/Source/Core/RequestScheduler";
import RuntimeError from "terriajs-cesium/Source/Core/RuntimeError";
import Entity from "terriajs-cesium/Source/DataSources/Entity";
import ImagerySplitDirection from "terriajs-cesium/Source/Scene/ImagerySplitDirection";
import URI from "urijs";
import AsyncLoader from "../Core/AsyncLoader";
import Class from "../Core/Class";
import ConsoleAnalytics from "../Core/ConsoleAnalytics";
import CorsProxy from "../Core/CorsProxy";
import filterOutUndefined from "../Core/filterOutUndefined";
import getDereferencedIfExists from "../Core/getDereferencedIfExists";
import GoogleAnalytics from "../Core/GoogleAnalytics";
import hashEntity from "../Core/hashEntity";
import instanceOf from "../Core/instanceOf";
import isDefined from "../Core/isDefined";
import JsonValue, {
  isJsonBoolean,
  isJsonNumber,
  isJsonObject,
  isJsonString,
  JsonArray,
  JsonObject
} from "../Core/Json";
import { isLatLonHeight } from "../Core/LatLonHeight";
import loadJson5 from "../Core/loadJson5";
import ServerConfig from "../Core/ServerConfig";
import TerriaError from "../Core/TerriaError";
import { Complete } from "../Core/TypeModifiers";
import { getUriWithoutPath } from "../Core/uriHelpers";
import PickedFeatures, {
  featureBelongsToCatalogItem,
  isProviderCoordsMap
} from "../Map/PickedFeatures";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import GroupMixin from "../ModelMixins/GroupMixin";
import MappableMixin, { isDataSource } from "../ModelMixins/MappableMixin";
import ReferenceMixin from "../ModelMixins/ReferenceMixin";
import TimeVarying from "../ModelMixins/TimeVarying";
import { HelpContentItem } from "../ReactViewModels/defaultHelpContent";
import { defaultTerms, Term } from "../ReactViewModels/defaultTerms";
import { Notification } from "../ReactViewModels/ViewState";
import { shareConvertNotification } from "../ReactViews/Notification/shareConvertNotification";
import ShowableTraits from "../Traits/ShowableTraits";
import { BaseMapViewModel } from "../ViewModels/BaseMapViewModel";
import TerriaViewer from "../ViewModels/TerriaViewer";
import { BaseMapModel, processBaseMaps } from "./BaseMaps/BaseMapModel";
import { defaultBaseMaps } from "./BaseMaps/defaultBaseMaps";
import CameraView from "./CameraView";
import CatalogGroup from "./CatalogGroupNew";
import CatalogMemberFactory from "./CatalogMemberFactory";
import Catalog from "./CatalogNew";
import CommonStrata from "./CommonStrata";
import Feature from "./Feature";
import GlobeOrMap from "./GlobeOrMap";
import hasTraits from "./hasTraits";
import IElementConfig from "./IElementConfig";
import InitSource, {
  isInitData,
  isInitDataPromise,
  isInitOptions,
  isInitUrl
} from "./InitSource";
import Internationalization, {
  I18nStartOptions,
  LanguageConfiguration
} from "./Internationalization";
import MagdaReference, { MagdaReferenceHeaders } from "./MagdaReference";
import MapInteractionMode from "./MapInteractionMode";
import { BaseModel } from "./Model";
import NoViewer from "./NoViewer";
import openGroup from "./openGroup";
import raiseErrorToUser, { wrapErrorMessage } from "./raiseErrorToUser";
import ShareDataService from "./ShareDataService";
import SplitItemReference from "./SplitItemReference";
import TimelineStack from "./TimelineStack";
import updateModelFromJson from "./updateModelFromJson";
import upsertModelFromJson from "./upsertModelFromJson";
import ViewerMode from "./ViewerMode";
import Workbench from "./Workbench";
// import overrides from "../Overrides/defaults.jsx";

interface ConfigParameters {
  /**
   * TerriaJS uses this name whenever it needs to display the name of the application.
   */
  appName?: string;
  /**
   * The email address shown when things go wrong.
   */
  supportEmail?: string;
  /**
   * The maximum number of "feature info" boxes that can be displayed when clicking a point.
   */
  defaultMaximumShownFeatureInfos?: number;
  /**
   * URL of the JSON file that defines region mapping for CSV files.
   */
  regionMappingDefinitionsUrl: string;
  /**
   * URL of OGR2OGR conversion service (part of TerriaJS-Server).
   */
  conversionServiceBaseUrl?: string;
  /**
   * URL of Proj4 projection lookup service (part of TerriaJS-Server).
   */
  proj4ServiceBaseUrl?: string;
  /**
   * URL of CORS proxy service (part of TerriaJS-Server)
   */
  corsProxyBaseUrl?: string;
  /**
   * @deprecated
   */
  proxyableDomainsUrl?: string;
  serverConfigUrl?: string;
  shareUrl?: string;
  /**
   * URL of the service used to send feedback.  If not specified, the "Give Feedback" button will not appear.
   */
  feedbackUrl?: string;
  /**
   * An array of base paths to use to try to use to resolve init fragments in the URL.  For example, if this property is `[ "init/", "http://example.com/init/"]`, then a URL with `#test` will first try to load `init/test.json` and, if that fails, next try to load `http://example.com/init/test.json`.
   */
  initFragmentPaths: string[];
  /**
   * Whether the story is enabled. If false story function button won't be available.
   */
  storyEnabled: boolean;
  /**
   * True (the default) to intercept the browser's print feature and use a custom one accessible through the Share panel.
   */
  interceptBrowserPrint?: boolean;
  /**
   * True to create a separate explorer panel tab for each top-level catalog group to list its items in.
   */
  tabbedCatalog?: boolean;
  /**
   * True to use Cesium World Terrain from Cesium ion. False to use terrain from the URL specified with the `"cesiumTerrainUrl"` property. If this property is false and `"cesiumTerrainUrl"` is not specified, the 3D view will use a smooth ellipsoid instead of a terrain surface. Defaults to true.
   */
  useCesiumIonTerrain?: boolean;
  /**
   * The URL to use for Cesium terrain in the 3D Terrain viewer, in quantized mesh format. This property is ignored if "useCesiumIonTerrain" is set to true.
   */
  cesiumTerrainUrl?: string;
  /**
   * The access token to use with Cesium ion. If `"useCesiumIonTerrain"` is true and this property is not specified, the Cesium default Ion key will be used. It is a violation of the Ion terms of use to use the default key in a deployed application.
   */
  cesiumIonAccessToken?: string;
  /**
   * True to use Bing Maps from Cesium ion (Cesium World Imagery). By default, Ion will be used, unless the `bingMapsKey` property is specified, in which case that will be used instead. To disable the Bing Maps layers entirely, set this property to false and set `bingMapsKey` to null.
   */
  useCesiumIonBingImagery?: boolean;
  /**
   * A [Bing Maps API key](https://msdn.microsoft.com/en-us/library/ff428642.aspx) used for requesting Bing Maps base maps and using the Bing Maps geocoder for searching. It is your responsibility to request a key and comply with all terms and conditions.
   */
  bingMapsKey?: string;
  hideTerriaLogo?: boolean;
  /**
   * An array of strings of HTML that fill up the top left logo space.
   */
  brandBarElements?: string[];
  /**
   * Index of which brandBarElements to show for mobile header.
   */
  displayOneBrand?: number;
  /**
   * True to disable the "Centre map at your current location" button.
   */
  disableMyLocation?: boolean;
  disableSplitter?: boolean;

  disablePedestrianMode?: boolean;

  experimentalFeatures?: boolean;
  magdaReferenceHeaders?: MagdaReferenceHeaders;
  locationSearchBoundingBox?: number[];
  /**
   * A Google API key for [Google Analytics](https://analytics.google.com).  If specified, TerriaJS will send various events about how it's used to Google Analytics.
   */
  googleAnalyticsKey?: string;
  /**
   * Your `post_client_item` from Rollbar - as of right now, TerriaMap also needs to be modified such that you construct `RollbarErrorProvider` in `index.js`
   */
  rollbarAccessToken?: string;
  globalDisclaimer?: any;
  /**
   * True to display welcome message on startup.
   */
  showWelcomeMessage?: boolean;
  /**
   * Video to show in welcome message.
   */
  welcomeMessageVideo?: any;
  /**
   * True to display in-app guides.
   */
  showInAppGuides?: boolean;
  /**
   * The content to be displayed in the help panel.
   */
  helpContent?: HelpContentItem[];
  helpContentTerms?: Term[];
  /**
   *
   */
  languageConfiguration?: LanguageConfiguration;
  /**
   * Custom concurrent request limits for domains in Cesium's RequestScheduler. Cesium's default is 6 per domain (the maximum allowed by browsers unless the server supports http2). For servers supporting http2 try 12-24 to have more parallel requests. Setting this too high will undermine Cesium's prioritised request scheduling and important data may load slower. Format is {"domain_without_protocol:port": number}.
   */
  customRequestSchedulerLimits?: Record<string, number>;

  /**
   * Whether to load persisted viewer mode from local storage.
   */
  persistViewerMode?: boolean;

  /**
   * Whether to open the add data explorer panel on load.
   */
  openAddData?: boolean;
}

interface StartOptions {
  configUrl: string;
  configUrlHeaders?: {
    [key: string]: string;
  };
  applicationUrl?: Location;
  shareDataService?: ShareDataService;
  /**
   * i18nOptions is explicitly a separate option from `languageConfiguration`,
   * as `languageConfiguration` can be serialised, but `i18nOptions` may have
   * some functions that are passed in from a TerriaMap
   *  */
  i18nOptions?: I18nStartOptions;
}

type Analytics = any;

interface TerriaOptions {
  baseUrl?: string;
  analytics?: Analytics;
}

interface ApplyInitDataOptions {
  initData: JsonObject;
  replaceStratum?: boolean;
  // When feature picking state is missing from the initData, unset the state only if this flag is true
  // This is for eg, set to true when switching through story slides.
  canUnsetFeaturePickingState?: boolean;
}

interface HomeCameraInit {
  [key: string]: HomeCameraInit[keyof HomeCameraInit];
  north: number;
  east: number;
  south: number;
  west: number;
}

export default class Terria {
  private models = observable.map<string, BaseModel>();
  /** Map from share key -> id */
  readonly shareKeysMap = observable.map<string, string>();
  /** Map from id -> share keys */
  readonly modelIdShareKeysMap = observable.map<string, string[]>();

  readonly baseUrl: string = "build/TerriaJS/";
  readonly notification = new CesiumEvent();
  readonly error = new CesiumEvent();
  readonly tileLoadProgressEvent = new CesiumEvent();
  readonly workbench = new Workbench();
  readonly overlays = new Workbench();
  readonly catalog = new Catalog(this);
  readonly timelineClock = new Clock({ shouldAnimate: false });
  // readonly overrides: any = overrides; // TODO: add options.functionOverrides like in master

  readonly elements = observable.map<string, IElementConfig>();

  @observable
  readonly mainViewer = new TerriaViewer(
    this,
    computed(() =>
      filterOutUndefined(
        this.overlays.items
          .map(item => (MappableMixin.isMixedInto(item) ? item : undefined))
          .concat(
            this.workbench.items.map(item =>
              MappableMixin.isMixedInto(item) ? item : undefined
            )
          )
      )
    )
  );

  appName: string = "TerriaJS App";
  supportEmail: string = "support@terria.io";

  /**
   * Gets or sets the {@link this.corsProxy} used to determine if a URL needs to be proxied and to proxy it if necessary.
   * @type {CorsProxy}
   */
  corsProxy: CorsProxy = new CorsProxy();

  /**
   * Gets or sets the instance to which to report Google Analytics-style log events.
   * If a global `ga` function is defined, this defaults to `GoogleAnalytics`.  Otherwise, it defaults
   * to `ConsoleAnalytics`.
   */
  readonly analytics: Analytics;

  /**
   * Gets the stack of layers active on the timeline.
   */
  readonly timelineStack = new TimelineStack(this.timelineClock);

  @observable
  readonly configParameters: Complete<ConfigParameters> = {
    appName: "TerriaJS App",
    supportEmail: "info@terria.io",
    defaultMaximumShownFeatureInfos: 100,
    regionMappingDefinitionsUrl: "build/TerriaJS/data/regionMapping.json",
    conversionServiceBaseUrl: "convert/",
    proj4ServiceBaseUrl: "proj4/",
    corsProxyBaseUrl: "proxy/",
    proxyableDomainsUrl: "proxyabledomains/", // deprecated, will be determined from serverconfig
    serverConfigUrl: "serverconfig/",
    shareUrl: "share",
    feedbackUrl: undefined,
    initFragmentPaths: ["init/"],
    storyEnabled: true,
    interceptBrowserPrint: true,
    tabbedCatalog: false,
    useCesiumIonTerrain: true,
    cesiumTerrainUrl: undefined,
    cesiumIonAccessToken: undefined,
    useCesiumIonBingImagery: undefined,
    bingMapsKey: undefined,
    hideTerriaLogo: false,
    brandBarElements: undefined,
    displayOneBrand: 0, // index of which brandBarElements to show for mobile header
    disableMyLocation: undefined,
    disableSplitter: undefined,
    disablePedestrianMode: false,
    experimentalFeatures: undefined,
    magdaReferenceHeaders: undefined,
    locationSearchBoundingBox: undefined,
    googleAnalyticsKey: undefined,
    rollbarAccessToken: undefined,
    globalDisclaimer: undefined,
    showWelcomeMessage: false,
    welcomeMessageVideo: {
      videoTitle: "Getting started with the map",
      videoUrl: "https://www.youtube-nocookie.com/embed/FjSxaviSLhc",
      placeholderImage:
        "https://img.youtube.com/vi/FjSxaviSLhc/maxresdefault.jpg"
    },
    showInAppGuides: false,
    helpContent: [],
    helpContentTerms: defaultTerms,
    languageConfiguration: undefined,
    customRequestSchedulerLimits: undefined,
    persistViewerMode: true,
    openAddData: false
  };

  @observable
  baseMaps: BaseMapViewModel[] = [];

  /** ID of basemap pulled from initData - this wil be used **before** `initBaseMapName` */
  initBaseMapId: string | undefined;

  /** Name of basemap pulled from initData - this is for compatibility with sharelinks which use baseMapName instead of baseMapId. This will be used if `initBaseMapId` can't be resolved */
  initBaseMapName: string | undefined;

  previewBaseMapId: string = "basemap-positron";

  @observable
  pickedFeatures: PickedFeatures | undefined;

  @observable
  selectedFeature: Feature | undefined;

  @observable
  allowFeatureInfoRequests: boolean = true;

  /**
   * Gets or sets the stack of map interactions modes.  The mode at the top of the stack
   * (highest index) handles click interactions with the map
   */
  @observable
  mapInteractionModeStack: MapInteractionMode[] = [];

  baseMapContrastColor: string = "#ffffff";

  @observable
  readonly userProperties = new Map<string, any>();

  @observable
  readonly initSources: InitSource[] = [];
  private _initSourceLoader = new AsyncLoader(
    this.forceLoadInitSources.bind(this)
  );

  @observable serverConfig: any; // TODO
  @observable shareDataService: ShareDataService | undefined;

  /* Splitter controls */
  @observable showSplitter = false;
  @observable splitPosition = 0.5;
  @observable splitPositionVertical = 0.5;
  @observable terrainSplitDirection: ImagerySplitDirection =
    ImagerySplitDirection.NONE;

  @observable depthTestAgainstTerrainEnabled = false;

  @observable stories: any[] = [];

  // TODO: this is duplicated with properties on ViewState, which is
  //       kind of terrible.
  /**
   * Gets or sets the ID of the catalog member that is currently being
   * previewed.
   */
  @observable previewedItemId: string | undefined;

  /**
   * Base ratio for maximumScreenSpaceError
   * @type {number}
   */
  @observable baseMaximumScreenSpaceError = 2;

  /**
   * Gets or sets whether to use the device's native resolution (sets cesium.viewer.resolutionScale to a ratio of devicePixelRatio)
   * @type {boolean}
   */
  @observable useNativeResolution = false;

  /**
   * Whether we think all references in the catalog have been loaded
   * @type {boolean}
   */
  @observable catalogReferencesLoaded: boolean = false;

  constructor(options: TerriaOptions = {}) {
    if (options.baseUrl) {
      if (options.baseUrl.lastIndexOf("/") !== options.baseUrl.length - 1) {
        this.baseUrl = options.baseUrl + "/";
      } else {
        this.baseUrl = options.baseUrl;
      }
    }

    this.analytics = options.analytics;
    if (!defined(this.analytics)) {
      if (typeof window !== "undefined" && defined((<any>window).ga)) {
        this.analytics = new GoogleAnalytics();
      } else {
        this.analytics = new ConsoleAnalytics();
      }
    }
  }

  @computed
  get currentViewer(): GlobeOrMap {
    return this.mainViewer.currentViewer;
  }

  @computed
  get cesium(): import("./Cesium").default | undefined {
    if (
      isDefined(this.mainViewer) &&
      this.mainViewer.currentViewer.type === "Cesium"
    ) {
      return this.mainViewer.currentViewer as import("./Cesium").default;
    }
  }

  @computed
  get leaflet(): import("./Leaflet").default | undefined {
    if (
      isDefined(this.mainViewer) &&
      this.mainViewer.currentViewer.type === "Leaflet"
    ) {
      return this.mainViewer.currentViewer as import("./Leaflet").default;
    }
  }

  @computed
  get modelIds() {
    return Array.from(this.models.keys());
  }

  getModelById<T extends BaseModel>(type: Class<T>, id: string): T | undefined {
    const model = this.models.get(id);
    if (instanceOf(type, model)) {
      return model;
    }

    // Model does not have the requested type.
    return undefined;
  }

  @action
  addModel(model: BaseModel, shareKeys?: string[]) {
    if (model.uniqueId === undefined) {
      throw new DeveloperError("A model without a `uniqueId` cannot be added.");
    }

    if (this.models.has(model.uniqueId)) {
      throw new RuntimeError("A model with the specified ID already exists.");
    }

    this.models.set(model.uniqueId, model);
    shareKeys?.forEach(shareKey => this.addShareKey(model.uniqueId!, shareKey));
  }

  /**
   * Remove references to a model from Terria.
   */
  @action
  removeModelReferences(model: BaseModel) {
    this.removeSelectedFeaturesForModel(model);
    this.workbench.remove(model);
    if (model.uniqueId) {
      this.models.delete(model.uniqueId);
    }
  }

  @action
  removeSelectedFeaturesForModel(model: BaseModel) {
    const pickedFeatures = this.pickedFeatures;
    if (pickedFeatures) {
      // Remove picked features that belong to the catalog item
      pickedFeatures.features.forEach((feature, i) => {
        if (featureBelongsToCatalogItem(<Feature>feature, model)) {
          pickedFeatures?.features.splice(i, 1);
          if (this.selectedFeature === feature)
            this.selectedFeature = undefined;
        }
      });
    }
  }

  getModelIdByShareKey(shareKey: string): string | undefined {
    return this.shareKeysMap.get(shareKey);
  }

  getModelByIdOrShareKey<T extends BaseModel>(
    type: Class<T>,
    id: string
  ): T | undefined {
    let model = this.getModelById(type, id);
    if (model) {
      return model;
    } else {
      const idFromShareKey = this.getModelIdByShareKey(id);
      return idFromShareKey !== undefined
        ? this.getModelById(type, idFromShareKey)
        : undefined;
    }
  }

  @action
  addShareKey(id: string, shareKey: string) {
    if (id === shareKey || this.shareKeysMap.has(shareKey)) return;
    this.shareKeysMap.set(shareKey, id);
    this.modelIdShareKeysMap.get(id)?.push(shareKey) ??
      this.modelIdShareKeysMap.set(id, [shareKey]);
  }

  setupInitializationUrls(baseUri: uri.URI, config: any) {
    const initializationUrls: string[] = config?.initializationUrls || [];
    const initSources = initializationUrls.map(url =>
      generateInitializationUrl(
        baseUri,
        this.configParameters.initFragmentPaths,
        url
      )
    );

    // look for v7 catalogs -> push v7-v8 conversion to initSources
    if (Array.isArray(config?.v7initializationUrls)) {
      this.initSources.push(
        ...(config.v7initializationUrls as JsonArray)
          .filter(isJsonString)
          .map(async (v7initUrl: string) => {
            const [{ convertCatalog }, catalog] = await Promise.all([
              import("catalog-converter"),
              loadJson5(v7initUrl)
            ]);
            const convert = convertCatalog(catalog, { generateIds: false });
            console.log(
              `WARNING: ${v7initUrl} is a v7 catalog - it has been upgraded to v8\nMessages:\n`
            );
            convert.messages.forEach(message =>
              console.log(`- ${message.path.join(".")}: ${message.message}`)
            );
            return { data: (convert.result as JsonObject | null) || {} };
          })
      );
    }
    this.initSources.push(...initSources);
  }

  async start(options: StartOptions) {
    this.shareDataService = options.shareDataService;

    const baseUri = new URI(options.configUrl).filename("");

    const launchUrlForAnalytics =
      options.applicationUrl?.href || getUriWithoutPath(baseUri);

    try {
      const config = await loadJson5(
        options.configUrl,
        options.configUrlHeaders
      );
      // If it's a magda config, we only load magda config and parameters should never be a property on the direct
      // config aspect (it would be under the `terria-config` aspect)
      if (isJsonObject(config) && config.aspects) {
        await this.loadMagdaConfig(options.configUrl, config, baseUri);
      }
      runInAction(() => {
        if (isJsonObject(config) && isJsonObject(config.parameters)) {
          this.updateParameters(config.parameters);
        }
        this.setupInitializationUrls(baseUri, config);
      });
    } catch (error) {
      raiseErrorToUser(
        this,
        new TerriaError({
          sender: this,
          title: { key: "models.terria.loadConfigErrorTitle" },
          message: wrapErrorMessage(
            this,
            `Couldn't load ${options.configUrl}:\n${
              error instanceof TerriaError
                ? error.message
                : typeof error === "object"
                ? error?.toString()
                : undefined
            }`
          )
        })
      );
    } finally {
      if (!options.i18nOptions?.skipInit) {
        Internationalization.initLanguage(
          this.configParameters.languageConfiguration,
          options.i18nOptions
        );
      }
    }
    setCustomRequestSchedulerDomainLimits(
      this.configParameters.customRequestSchedulerLimits
    );

    this.analytics?.start(this.configParameters);
    this.analytics?.logEvent("launch", "url", launchUrlForAnalytics);
    this.serverConfig = new ServerConfig();
    const serverConfig = await this.serverConfig.init(
      this.configParameters.serverConfigUrl
    );
    await this.initCorsProxy(this.configParameters, serverConfig);
    if (this.shareDataService && this.serverConfig.config) {
      this.shareDataService.init(this.serverConfig.config);
    }
    if (options.applicationUrl) {
      await this.updateApplicationUrl(options.applicationUrl.href);
    }
    this.loadPersistedMapSettings();
  }

  loadPersistedMapSettings(): void {
    const persistViewerMode = this.configParameters.persistViewerMode;
    const mainViewer = this.mainViewer;
    const viewerMode = this.getLocalProperty("viewermode");
    if (persistViewerMode && defined(viewerMode)) {
      if (viewerMode === "3d" || viewerMode === "3dsmooth") {
        mainViewer.viewerMode = ViewerMode.Cesium;
        mainViewer.viewerOptions.useTerrain = viewerMode === "3d";
      } else if (viewerMode === "2d") {
        mainViewer.viewerMode = ViewerMode.Leaflet;
      } else {
        console.error(
          `Trying to select ViewerMode ${viewerMode} that doesn't exist`
        );
      }
    }
  }

  async loadPersistedOrInitBaseMap() {
    // Set baseMap fallback to first option
    let baseMap = this.baseMaps[0].mappable;
    const persistedBaseMapId = this.getLocalProperty("basemap");
    const baseMapSearch = this.baseMaps.find(
      baseMap => baseMap.mappable.uniqueId === persistedBaseMapId
    );
    if (baseMapSearch) {
      baseMap = baseMapSearch.mappable;
    } else {
      // Try to find basemap using initBaseMapId and initBaseMapName
      const baseMapSearch =
        this.baseMaps.find(
          baseMap => baseMap.mappable.uniqueId === this.initBaseMapId
        ) ??
        this.baseMaps.find(
          baseMap =>
            CatalogMemberMixin.isMixedInto(baseMap.mappable) &&
            baseMap.mappable.name === this.initBaseMapName
        );
      if (baseMapSearch) {
        baseMap = baseMapSearch.mappable;
      }
    }

    await this.mainViewer.setBaseMap(baseMap);
  }

  get isLoadingInitSources(): boolean {
    return this._initSourceLoader.isLoading;
  }

  /**
   * Asynchronously loads init sources
   */
  loadInitSources(): Promise<void> {
    return this._initSourceLoader.load();
  }

  dispose() {
    this._initSourceLoader.dispose();
  }

  updateFromStartData(startData: any) {
    interpretStartData(this, startData);
    return this.loadInitSources();
  }

  async updateApplicationUrl(newUrl: string) {
    const uri = new URI(newUrl);
    const hash = uri.fragment();
    const hashProperties = queryToObject(hash);

    await interpretHash(
      this,
      hashProperties,
      this.userProperties,
      new URI(newUrl)
        .filename("")
        .query("")
        .hash("")
    );

    await this.loadInitSources();
  }

  @action
  updateParameters(parameters: ConfigParameters | JsonObject): void {
    Object.entries(parameters).forEach(([key, value]) => {
      if (this.configParameters.hasOwnProperty(key)) {
        (this.configParameters as any)[key] = value;
      }
    });

    this.appName = defaultValue(this.configParameters.appName, this.appName);
    this.supportEmail = defaultValue(
      this.configParameters.supportEmail,
      this.supportEmail
    );
  }

  protected async forceLoadInitSources(): Promise<void> {
    const loadInitSource = createTransformer(
      async (initSource: InitSource): Promise<JsonObject | undefined> => {
        let jsonValue: JsonValue | undefined;
        if (isInitUrl(initSource)) {
          try {
            jsonValue = await loadJson5(initSource.initUrl);
          } catch (e) {
            raiseErrorToUser(
              this,
              new TerriaError({
                sender: this,
                title: { key: "models.terria.loadingInitSourceErrorTitle" },
                message: {
                  key: "models.terria.loadingInitSourceError2Message",
                  parameters: { loadSource: initSource.initUrl }
                }
              })
            );
          }
        } else if (isInitOptions(initSource)) {
          let error: any;
          for (const option of initSource.options) {
            try {
              jsonValue = await loadInitSource(option);
              if (jsonValue !== undefined) break;
            } catch (err) {
              error = err;
            }
          }
          if (jsonValue === undefined && error !== undefined) throw error;
        } else if (isInitData(initSource)) {
          jsonValue = initSource.data;
        } else if (isInitDataPromise(initSource)) {
          jsonValue = (await initSource).data;
        }

        if (jsonValue && isJsonObject(jsonValue)) {
          return jsonValue;
        }
        return undefined;
      }
    );

    const initSources = await Promise.all(
      this.initSources.map(async initSource => {
        try {
          return await loadInitSource(initSource);
        } catch (e) {
          raiseErrorToUser(this, e, {
            key: "models.terria.loadingInitSourceErrorTitle"
          });
        }
      })
    );

    await Promise.all(
      filterOutUndefined(initSources).map(async initSource => {
        try {
          await this.applyInitData({
            initData: initSource
          });
        } catch (e) {
          raiseErrorToUser(this, e, {
            key: "models.terria.loadingInitSourceErrorTitle"
          });
        }
      })
    );

    if (this.baseMaps.length === 0) {
      processBaseMaps(defaultBaseMaps(this), this);
    }

    if (!this.mainViewer.baseMap) {
      // Note: there is no "await" here - as basemaps can take a while to load and there is no need to wait for them to load before rendering Terria
      this.loadPersistedOrInitBaseMap();
    }
  }

  private async loadModelStratum(
    modelId: string,
    stratumId: string,
    allModelStratumData: JsonObject,
    replaceStratum: boolean
  ): Promise<BaseModel> {
    const thisModelStratumData = allModelStratumData[modelId] || {};
    if (!isJsonObject(thisModelStratumData)) {
      throw new TerriaError({
        sender: this,
        title: "Invalid model traits",
        message: "The traits of a model must be a JSON object."
      });
    }

    const cleanStratumData = { ...thisModelStratumData };
    delete cleanStratumData.dereferenced;
    delete cleanStratumData.knownContainerUniqueIds;

    const containerIds = thisModelStratumData.knownContainerUniqueIds;
    if (Array.isArray(containerIds)) {
      // Groups that contain this item must be loaded before this item.
      await Promise.all(
        containerIds.map(async containerId => {
          if (typeof containerId !== "string") {
            return;
          }
          const container = await this.loadModelStratum(
            containerId,
            stratumId,
            allModelStratumData,
            replaceStratum
          );
          const dereferenced = ReferenceMixin.is(container)
            ? container.target
            : container;
          if (GroupMixin.isMixedInto(dereferenced)) {
            await dereferenced.loadMembers();
          }
        })
      );
    }

    // If this model is a `SplitItemReference` we must load the source item first
    const splitSourceId = cleanStratumData.splitSourceItemId;
    if (
      cleanStratumData.type === SplitItemReference.type &&
      typeof splitSourceId === "string"
    ) {
      await this.loadModelStratum(
        splitSourceId,
        stratumId,
        allModelStratumData,
        replaceStratum
      );
    }
    const loadedModel = upsertModelFromJson(
      CatalogMemberFactory,
      this,
      "/",
      stratumId,
      {
        ...cleanStratumData,
        id: modelId
      },
      {
        replaceStratum,
        matchByShareKey: true
      }
    );
    if (Array.isArray(containerIds)) {
      containerIds.forEach(containerId => {
        if (
          typeof containerId === "string" &&
          loadedModel.knownContainerUniqueIds.indexOf(containerId) < 0
        ) {
          loadedModel.knownContainerUniqueIds.push(containerId);
        }
      });
    }
    // If we're replacing the stratum and the existing model is already
    // dereferenced, we need to replace the dereferenced stratum, too,
    // even if there's no trace of it in the load data.
    let dereferenced = thisModelStratumData.dereferenced;
    if (
      replaceStratum &&
      dereferenced === undefined &&
      ReferenceMixin.is(loadedModel) &&
      loadedModel.target !== undefined
    ) {
      dereferenced = {};
    }
    if (ReferenceMixin.is(loadedModel)) {
      await loadedModel.loadReference();
      if (isDefined(loadedModel.target)) {
        updateModelFromJson(
          loadedModel.target,
          stratumId,
          dereferenced || {},
          replaceStratum
        );
      }
    } else if (dereferenced) {
      throw new TerriaError({
        sender: this,
        title: "Model cannot be dereferenced",
        message:
          "The stratum has a `dereferenced` property, but the model cannot be dereferenced."
      });
    }
    const dereferencedGroup = getDereferencedIfExists(loadedModel);
    if (GroupMixin.isMixedInto(dereferencedGroup)) {
      await openGroup(dereferencedGroup, dereferencedGroup.isOpen);
    }
    return loadedModel;
  }

  @action
  async applyInitData({
    initData,
    replaceStratum = false,
    canUnsetFeaturePickingState = false
  }: ApplyInitDataOptions): Promise<void> {
    initData = toJS(initData);

    const stratumId =
      typeof initData.stratum === "string"
        ? initData.stratum
        : CommonStrata.definition;

    // Extract the list of CORS-ready domains.
    if (Array.isArray(initData.corsDomains)) {
      this.corsProxy.corsDomains.push(...(<string[]>initData.corsDomains));
    }

    if (initData.catalog !== undefined) {
      this.catalog.group.addMembersFromJson(stratumId, initData.catalog);
    }

    if (isJsonObject(initData.elements)) {
      this.elements.merge(initData.elements);
    }

    if (Array.isArray(initData.stories)) {
      this.stories = initData.stories;
    }

    if (isJsonString(initData.viewerMode)) {
      switch (initData.viewerMode.toLowerCase()) {
        case "3d".toLowerCase():
          this.mainViewer.viewerOptions.useTerrain = true;
          this.mainViewer.viewerMode = ViewerMode.Cesium;
          break;
        case "3dSmooth".toLowerCase():
          this.mainViewer.viewerOptions.useTerrain = false;
          this.mainViewer.viewerMode = ViewerMode.Cesium;
          break;
        case "2d".toLowerCase():
          this.mainViewer.viewerMode = ViewerMode.Leaflet;
          break;
      }
    }

    if (isJsonString(initData.baseMapId)) {
      this.initBaseMapId = initData.baseMapId;
    }

    if (isJsonString(initData.baseMapName)) {
      this.initBaseMapName = initData.baseMapName;
    }

    if (isJsonString(initData.previewBaseMapId)) {
      this.previewBaseMapId = initData.previewBaseMapId;
    } else if (this.initBaseMapId) {
      this.previewBaseMapId = this.initBaseMapId;
    }

    if (
      initData.baseMaps &&
      Array.isArray(initData.baseMaps) &&
      initData.baseMaps.length > 0
    ) {
      try {
        processBaseMaps(<BaseMapModel[]>(<unknown>initData.baseMaps), this);
      } catch (e) {
        raiseErrorToUser(this, e, {
          key: "models.terria.loadingBaseMapsErrorTitle"
        });
      }
    }

    if (isJsonObject(initData.homeCamera)) {
      this.loadHomeCamera(initData.homeCamera);
    }

    if (isJsonObject(initData.initialCamera)) {
      const initialCamera = CameraView.fromJson(initData.initialCamera);
      this.currentViewer.zoomTo(initialCamera, 2.0);
    }

    if (isJsonBoolean(initData.showSplitter)) {
      this.showSplitter = initData.showSplitter;
    }

    if (isJsonNumber(initData.splitPosition)) {
      this.splitPosition = initData.splitPosition;
    }

    // Copy but don't yet load the workbench.
    const workbench = Array.isArray(initData.workbench)
      ? initData.workbench.slice()
      : [];

    const timeline = Array.isArray(initData.timeline)
      ? initData.timeline.slice()
      : [];

    // NOTE: after this Promise, this function is no longer an `@action`
    const models = initData.models;
    if (isJsonObject(models)) {
      await Promise.all(
        Object.keys(models).map(async modelId => {
          try {
            await this.loadModelStratum(
              modelId,
              stratumId,
              models,
              replaceStratum
            );
          } catch (e) {
            raiseErrorToUser(this, e, {
              key: "models.terria.loadingShareDataErrorTitle"
            });
            // TODO: deal with shared models that can't be loaded because, e.g. because they are private
            console.log(e);
            return Promise.resolve();
          }
        })
      );
    }

    runInAction(() => {
      if (isJsonString(initData.previewedItemId)) {
        this.previewedItemId = initData.previewedItemId;
      }
    });

    // Set the new contents of the workbench.
    const newItems = filterOutUndefined(
      workbench.map(modelId => {
        if (typeof modelId !== "string") {
          throw new TerriaError({
            sender: this,
            title: "Invalid model ID in workbench",
            message: "A model ID in the workbench list is not a string."
          });
        }
        return this.getModelByIdOrShareKey(BaseModel, modelId);
      })
    );

    runInAction(() => (this.workbench.items = newItems));

    // For ids that don't correspond to models resolve an id by share keys
    const timelineWithShareKeysResolved = new Set(
      filterOutUndefined(
        timeline.map(modelId => {
          if (typeof modelId !== "string") {
            throw new TerriaError({
              sender: this,
              title: "Invalid model ID in timeline",
              message: "A model ID in the timneline list is not a string."
            });
          }
          if (this.getModelById(BaseModel, modelId) !== undefined) {
            return modelId;
          } else {
            return this.getModelIdByShareKey(modelId);
          }
        })
      )
    );

    // TODO: the timelineStack should be populated from the `timeline` property,
    // not from the workbench.
    runInAction(
      () =>
        (this.timelineStack.items = this.workbench.items
          .filter(item => {
            return (
              item.uniqueId && timelineWithShareKeysResolved.has(item.uniqueId)
            );
            // && TODO: what is a good way to test if an item is of type TimeVarying.
          })
          .map(item => <TimeVarying>item))
    );

    // Load the items on the workbench
    await Promise.all(
      newItems.map(async model => {
        try {
          if (ReferenceMixin.is(model)) {
            await model.loadReference();
            model = model.target || model;
          }

          if (MappableMixin.isMixedInto(model)) {
            await model.loadMapItems();
          }
        } catch (e) {
          raiseErrorToUser(this, e, {
            key: "models.terria.loadingWorkbenchItemErrorTitle",
            parameters: {
              name:
                (CatalogMemberMixin.isMixedInto(model)
                  ? model.name
                  : model.uniqueId) ?? "Unknown item"
            }
          });
        }
      })
    );

    if (isJsonObject(initData.pickedFeatures)) {
      when(() => !(this.currentViewer instanceof NoViewer)).then(() => {
        if (isJsonObject(initData.pickedFeatures)) {
          this.loadPickedFeatures(initData.pickedFeatures);
        }
      });
    } else if (canUnsetFeaturePickingState) {
      runInAction(() => {
        this.pickedFeatures = undefined;
        this.selectedFeature = undefined;
      });
    }
  }

  @action
  loadHomeCamera(homeCameraInit: JsonObject | HomeCameraInit) {
    this.mainViewer.homeCamera = CameraView.fromJson(homeCameraInit);
  }

  async loadMagdaConfig(configUrl: string, config: any, baseUri: uri.URI) {
    const magdaRoot = new URI(configUrl)
      .path("")
      .query("")
      .toString();

    const aspects = config.aspects;
    const configParams = aspects["terria-config"]?.parameters;

    if (configParams) {
      this.updateParameters(configParams);
    }

    const initObj = aspects["terria-init"];
    if (isJsonObject(initObj)) {
      const { catalog, ...initObjWithoutCatalog } = initObj;
      /** Load the init data without the catalog yet, as we'll push the catalog
       * source up as an init source later */
      await this.applyInitData({
        initData: initObjWithoutCatalog
      });
    }

    if (aspects.group && aspects.group.members) {
      // force config (root group) id to be `/`
      const id = "/";
      this.removeModelReferences(this.catalog.group);

      let existingReference = this.getModelById(MagdaReference, id);
      if (existingReference === undefined) {
        existingReference = new MagdaReference(id, this);
        // Add model with terria aspects shareKeys
        this.addModel(existingReference, aspects?.terria?.shareKeys);
      }

      const reference = existingReference;

      reference.setTrait(CommonStrata.definition, "url", magdaRoot);
      reference.setTrait(CommonStrata.definition, "recordId", id);
      reference.setTrait(CommonStrata.definition, "magdaRecord", config);
      await reference.loadReference();
      if (reference.target instanceof CatalogGroup) {
        runInAction(() => {
          this.catalog.group = <CatalogGroup>reference.target;
        });
      }
    }
    this.setupInitializationUrls(baseUri, config.aspects?.["terria-config"]);
    /** Load up rest of terria catalog if one is inlined in terria-init */
    if (config.aspects?.["terria-init"]) {
      const { catalog, ...rest } = initObj;
      this.initSources.push({
        data: {
          catalog: catalog
        }
      });
    }
  }

  @action
  async loadPickedFeatures(pickedFeatures: JsonObject): Promise<void> {
    let vectorFeatures: Entity[] = [];
    let featureIndex: Record<number, Entity[] | undefined> = {};

    if (Array.isArray(pickedFeatures.entities)) {
      // Build index of terria features by a hash of their properties.
      const relevantItems = this.workbench.items.filter(
        item =>
          hasTraits(item, ShowableTraits, "show") &&
          item.show &&
          MappableMixin.isMixedInto(item)
      ) as MappableMixin.MappableMixin[];

      relevantItems.forEach(item => {
        const entities: Entity[] = item.mapItems
          .filter(isDataSource)
          .reduce((arr: Entity[], ds) => arr.concat(ds.entities.values), []);

        entities.forEach(entity => {
          const hash = hashEntity(entity, this.timelineClock);
          const feature = Feature.fromEntityCollectionOrEntity(entity);
          featureIndex[hash] = (featureIndex[hash] || []).concat([feature]);
        });
      });

      // Go through the features we've got from terria match them up to the id/name info we got from the
      // share link, filtering out any without a match.
      vectorFeatures = filterOutUndefined(
        pickedFeatures.entities.map(e => {
          if (isJsonObject(e) && typeof e.hash === "number") {
            const features = featureIndex[e.hash] || [];
            const match = features.find(f => f.name === e.name);
            return match;
          }
        })
      );
    }

    // Set the current pick location, if we have a valid coord
    const maybeCoords: any = pickedFeatures.pickCoords;
    const pickCoords = {
      latitude: maybeCoords?.lat,
      longitude: maybeCoords?.lng,
      height: maybeCoords?.height
    };
    if (
      isLatLonHeight(pickCoords) &&
      isProviderCoordsMap(pickedFeatures.providerCoords)
    ) {
      this.currentViewer.pickFromLocation(
        pickCoords,
        pickedFeatures.providerCoords,
        vectorFeatures as Feature[]
      );
    }

    if (this.pickedFeatures?.allFeaturesAvailablePromise) {
      // When feature picking is done, set the selected feature
      await this.pickedFeatures?.allFeaturesAvailablePromise;
    }

    runInAction(() => {
      this.pickedFeatures?.features.forEach((entity: Entity) => {
        const hash = hashEntity(entity, this.timelineClock);
        const feature = entity;
        featureIndex[hash] = (featureIndex[hash] || []).concat([feature]);
      });

      const current = pickedFeatures.current;
      if (
        isJsonObject(current) &&
        typeof current.hash === "number" &&
        typeof current.name === "string"
      ) {
        const selectedFeature = (featureIndex[current.hash] || []).find(
          feature => feature.name === current.name
        );
        if (selectedFeature) {
          this.selectedFeature = selectedFeature as Feature;
        }
      }
    });
  }

  async initCorsProxy(config: ConfigParameters, serverConfig: any) {
    if (config.proxyableDomainsUrl) {
      console.warn(i18next.t("models.terria.proxyableDomainsDeprecation"));
    }
    this.corsProxy.init(
      serverConfig,
      this.configParameters.corsProxyBaseUrl,
      []
    );
  }

  getUserProperty(key: string) {
    return undefined;
  }

  getLocalProperty(key: string): string | boolean | null {
    try {
      if (!defined(window.localStorage)) {
        return null;
      }
    } catch (e) {
      // SecurityError can arise if 3rd party cookies are blocked in Chrome and we're served in an iFrame
      return null;
    }
    var v = window.localStorage.getItem(this.appName + "." + key);
    if (v === "true") {
      return true;
    } else if (v === "false") {
      return false;
    }
    return v;
  }

  setLocalProperty(key: string, value: string | boolean): boolean {
    try {
      if (!defined(window.localStorage)) {
        return false;
      }
    } catch (e) {
      return false;
    }
    window.localStorage.setItem(this.appName + "." + key, value.toString());
    return true;
  }
}

function generateInitializationUrl(
  baseUri: uri.URI,
  initFragmentPaths: string[],
  url: string
): InitSource {
  if (url.toLowerCase().substring(url.length - 5) !== ".json") {
    return {
      options: initFragmentPaths.map(fragmentPath => {
        return {
          initUrl: URI.joinPaths(fragmentPath, url + ".json")
            .absoluteTo(baseUri)
            .toString()
        };
      })
    };
  }
  return {
    initUrl: new URI(url).absoluteTo(baseUri).toString()
  };
}

async function interpretHash(
  terria: Terria,
  hashProperties: any,
  userProperties: Map<string, any>,
  baseUri: uri.URI
) {
  runInAction(() => {
    Object.keys(hashProperties).forEach(function(property) {
      const propertyValue = hashProperties[property];
      if (property === "clean") {
        terria.initSources.splice(0, terria.initSources.length);
      } else if (property === "hideWelcomeMessage") {
        terria.configParameters.showWelcomeMessage = false;
      } else if (property === "start") {
        // a share link that hasn't been shortened: JSON embedded in URL (only works for small quantities of JSON)
        const startData = JSON.parse(propertyValue);
        interpretStartData(terria, startData);
      } else if (defined(propertyValue) && propertyValue.length > 0) {
        userProperties.set(property, propertyValue);
      } else {
        const initSourceFile = generateInitializationUrl(
          baseUri,
          terria.configParameters.initFragmentPaths,
          property
        );
        terria.initSources.push(initSourceFile);
      }
    });
  });

  // Resolve #share=xyz with the share data service.
  if (
    hashProperties.share !== undefined &&
    terria.shareDataService !== undefined
  ) {
    const shareProps = await terria.shareDataService.resolveData(
      hashProperties.share
    );
    if (isDefined(shareProps) && shareProps !== {}) {
      // Convert shareProps to v8 if neccessary
      const { convertShare } = await import("catalog-converter");
      const result = convertShare(shareProps);

      // Show warning messages if converted
      if (result.converted) {
        terria.notification.raiseEvent({
          title: i18next.t("share.convertNotificationTitle"),
          message: shareConvertNotification(result.messages)
        } as Notification);
      }

      if (result.result !== null) {
        interpretStartData(terria, result.result);
      }
    }
  }
}

function interpretStartData(terria: Terria, startData: any) {
  // TODO: version check, filtering, etc.

  if (startData.initSources) {
    runInAction(() => {
      terria.initSources.push(
        ...startData.initSources.map((initSource: any) => {
          return {
            data: initSource
          };
        })
      );
    });
  }

  // if (defined(startData.version) && startData.version !== latestStartVersion) {
  //   adjustForBackwardCompatibility(startData);
  // }

  // if (defined(terria.filterStartDataCallback)) {
  //   startData = terria.filterStartDataCallback(startData) || startData;
  // }

  // // Include any initSources specified in the URL.
  // if (defined(startData.initSources)) {
  //   for (var i = 0; i < startData.initSources.length; ++i) {
  //     var initSource = startData.initSources[i];
  //     // avoid loading terria.json twice
  //     if (
  //       temporaryInitSources.indexOf(initSource) < 0 &&
  //       !initFragmentExists(temporaryInitSources, initSource)
  //     ) {
  //       temporaryInitSources.push(initSource);
  //       // Only add external files to the application's list of init sources.
  //       if (
  //         typeof initSource === "string" &&
  //         persistentInitSources.indexOf(initSource) < 0
  //       ) {
  //         persistentInitSources.push(initSource);
  //       }
  //     }
  //   }
  // }
}

function setCustomRequestSchedulerDomainLimits(
  customDomainLimits: ConfigParameters["customRequestSchedulerLimits"]
) {
  if (isDefined(customDomainLimits)) {
    Object.entries(customDomainLimits).forEach(([domain, limit]) => {
      RequestScheduler.requestsByServer[domain] = limit;
    });
  }
}
