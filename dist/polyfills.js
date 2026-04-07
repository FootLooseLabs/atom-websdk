Muffin.Service = class ElementWebService {
  static name = null;
  static lockedInterfaces = [];
  static lockedSubscriptions = [];

  // ----------------------
  // Cache
  // ----------------------
  static _cache = new Map();
  static _defaultTTL = 60 * 1000; // 1 minute
  static _cacheCleanerInterval = null;

  static initCacheCleaner() {
    if (!this._cacheCleanerInterval) {
      this._cacheCleanerInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, { expiry }] of this._cache.entries()) {
          if (expiry < now) {
            this._cache.delete(key);
          }
        }
      }, 30 * 1000); // cleanup every 30 seconds
    }
  }

  static getCached(key) {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (entry.expiry < Date.now()) {
      this._cache.delete(key);
      return null;
    }
    return entry.value;
  }

  static setCached(key, value, ttl = this._defaultTTL) {
    this._cache.set(key, { value, expiry: Date.now() + ttl });
    this.initCacheCleaner(); // ensure cleaner is running
  }

  static clearCache(key) {
    if (key) this._cache.delete(key);
    else this._cache.clear();
  }

  // ----------------------
  // Interface locking
  // ----------------------
  static async lockInterface(interfaceName, INTERFACE_THROTTLE_INTERVAL = 500) {
    while (this.lockedInterfaces.includes(interfaceName)) {
      await new Promise((resolve) =>
        setTimeout(resolve, INTERFACE_THROTTLE_INTERVAL),
      );
    }
    this.lockedInterfaces.push(interfaceName);
  }

  static unlockInterface(interfaceName) {
    const index = this.lockedInterfaces.indexOf(interfaceName);
    if (index > -1) {
      this.lockedInterfaces.splice(index, 1);
    }
  }

  // ----------------------
  // Subscription locking
  // ----------------------
  static async lockSubscription(
    subscriptionInterface,
    SUBSCRIPTION_THROTTLE_INTERVAL = 200,
  ) {
    while (this.lockedSubscriptions.includes(subscriptionInterface)) {
      await new Promise((resolve) =>
        setTimeout(resolve, SUBSCRIPTION_THROTTLE_INTERVAL),
      );
    }
    this.lockedSubscriptions.push(subscriptionInterface);
  }

  static unlockSubscription(subscriptionInterface) {
    const index = this.lockedSubscriptions.indexOf(subscriptionInterface);
    if (index > -1) {
      this.lockedSubscriptions.splice(index, 1);
    }
  }

  constructor(boardObj) {
    this.pubKey = generateRandomString(6);
    if (this.constructor.name) {
      this.interface = Muffin.PostOffice.getOrCreateInterface(
        this.constructor.name,
      );
    }
  }
};

Muffin.DOMComponent.prototype.getElement = function (_filter) {
  const _domNode = this._getDomNode();
  return _domNode ? _domNode.querySelector(_filter) : null;
};

Muffin.DOMComponent.prototype.getElements = function (_filter) {
  const _domNode = this._getDomNode();
  return _domNode ? _domNode.querySelectorAll(_filter) : [];
};

Muffin.Router.prototype.updateHistory = function (historyTitle, historyUrl) {
  const historyData = {
    name: historyTitle,
    url: historyUrl,
  };
  window.history.pushState(historyData, historyTitle, historyUrl);
};

Muffin.DOMComponent.prototype.toggleBtnBusyState = function (
  btnEl,
  _state = "busy",
) {
  if (_state == "busy") {
    btnEl.classList.add("busy");
    btnEl.setAttribute("disabled", true);
  } else {
    btnEl.classList.remove("busy");
    btnEl.removeAttribute("disabled");
  }
};

// Muffin.DOMComponent.prototype.requestFeatureAccess = async function (srcEl) {
//     if(!srcEl.dataset.feature){
//         console.warn("No Feature Declaration. Skipping.");
//         return;
//     }
//     if(!this.constructor.featuresMap){
//         console.warn("No Feature Map. Skipping.");
//         return;
//     }
//     let featureRefInMap = this.constructor.featuresMap[srcEl.dataset.feature];

//     if(!featureRefInMap){
//         console.warn("Invalid Feature Declaration. Skipping.");
//         return;
//     }

//     let featureRequestSessionVarName = `requested-feature-${featureRefInMap}`;

//     this.toggleBtnBusyState(srcEl, "busy");

//     try{
//         let requestedFeatureSessionVar = await Muffin.AccountManagerService.getSessionProp(featureRequestSessionVarName);
//         if(requestedFeatureSessionVar){
//             console.debug(`DEBUG: Feature already Requested by user - ${(new Date(requestedFeatureSessionVar)).toLocaleString()}`);
//             this.notifyUser("Already Requested", 1500);
//         }else{
//             await Muffin.AccountManagerService.updateSessionProp(featureRequestSessionVarName, Date.now());
//             this.notifyUser("Access Request Sent", 1500);
//         }
//     }catch(e){
//         console.warn("WARN: Failed to Request Feature Access - ", e);
//         this.notifyUser("Uh Oh. Failed to Request Feature Access.");
//     };

//     setTimeout(()=>{
//         this.initFeatureRequestButtonStates.call(this);
//     },1000);

// }

// Muffin.DOMComponent.prototype.initFeatureRequestButtonStates = async function () {
//     if(!this.constructor.featuresMap){
//         console.warn("No Feature Map. Skipping.");
//         return;
//     }
//     let featureRequestBtns = Array.from(this._getDomNode().querySelectorAll(`[data-feature][on-click="requestFeatureAccess"]`));
//     featureRequestBtns.map(async (_featureReqBtn)=>{
//         let featureRefInMap = this.constructor.featuresMap[_featureReqBtn.dataset.feature];
//         if(featureRefInMap){
//            let featureRequestSessionVarName = `requested-feature-${featureRefInMap}`;
//             try{
//                 let requestedFeatureSessionVar = await Muffin.AccountManagerService.getSessionProp(featureRequestSessionVarName);
//                 if(requestedFeatureSessionVar){
//                     _featureReqBtn.setAttribute("disabled",true);
//                     _featureReqBtn.classList.add("btn-light");
//                     _featureReqBtn.style.opacity = 0.7;
//                     _featureReqBtn.style.pointerEvents = "none";
//                     _featureReqBtn.innerText = "Your feature access request is in Review";
//                 }else{
//                     _featureReqBtn.removeAttribute("disabled");
//                     _featureReqBtn.classList.remove("btn-light");
//                     _featureReqBtn.style.opacity = 1;
//                     _featureReqBtn.style.pointerEvents = "unset";
//                     _featureReqBtn.innerText = "Request access to this feature";
//                 }
//             }catch(e){
//                 console.warn(`WARN: Could not Init Feature Request Btn State of ${featureRefInMap} (proceeding without it) - `, e)
//             };
//         }
//     });
// }

Muffin.DOMComponent.prototype.callParent = function (srcEl, ev) {
  var args = [srcEl, ev, {}, {}];

  if (srcEl.hasAttribute("pass-data")) {
    var dataToPass = {};
    srcEl
      .getAttribute("pass-data")
      .split(",")
      .forEach((k) => {
        let key = k.trim();
        dataToPass[key] = this.data[key];
      });
    args[2] = dataToPass;
  }

  if (srcEl.hasAttribute("pass-uivars")) {
    var uiVarsToPass = {};
    srcEl
      .getAttribute("pass-uivars")
      .split(",")
      .forEach((k) => {
        let key = k.trim();
        uiVarsToPass[key] = this.uiVars[key];
      });
    args[3] = uiVarsToPass;
  }

  let _parent = this.getParent();
  _parent[srcEl.dataset.function].call(_parent, ...args);
};

Muffin.DOMComponent.prototype.callGrandParent = function (srcEl, ev) {
  var args = [srcEl, ev, {}, {}];

  if (srcEl.hasAttribute("pass-data")) {
    var dataToPass = {};
    srcEl
      .getAttribute("pass-data")
      .split(",")
      .forEach((k) => {
        let key = k.trim();
        dataToPass[key] = this.data[key];
      });
    args[2] = dataToPass;
  }

  if (srcEl.hasAttribute("pass-uivars")) {
    var uiVarsToPass = {};
    srcEl
      .getAttribute("pass-uivars")
      .split(",")
      .forEach((k) => {
        let key = k.trim();
        uiVarsToPass[key] = this.uiVars[key];
      });
    args[3] = uiVarsToPass;
  }

  let _grandParent = this.getParent().getParent();
  _grandParent[srcEl.dataset.function].call(_grandParent, ...args);
};

Muffin.DOMComponent.prototype.awaitChildLoad = function (
  _childName,
  _timeout = 3000,
) {
  return new Promise((resolve, reject) => {
    if (this.composedScope[_childName]) {
      return resolve(this.composedScope[_childName]);
    }
    this.interface.on("child-composed", (_child) => {
      if (_child == _childName) {
        return resolve(this.composedScope[_childName]);
      }
    });
    setTimeout(() => {
      return reject("Error: child loading timed out");
    }, _timeout);
  });
};

Muffin.DOMComponent.prototype.initSubscriptions = function (_subcriptionsObj) {
  return Promise.all(
    _subcriptionsObj.map((_subscription) => {
      try {
        return Muffin.WebInterface.subscribe(
          `${_subscription.host}|||${_subscription.interface}`,
          this.interface.name,
          `${_subscription.localInterfaceEvent}`,
        );
      } catch (e) {
        throw e;
      }
    }),
  );
};

Muffin.DOMComponent.prototype.copyToClipboard = function (srcEl, ev) {
  navigator.clipboard.writeText(srcEl.dataset.text);
  this.notifyUser(
    `<i class='fas fa-check-circle grey-text text-darken-3 pr-3'></i> Copied`,
  );
};

Muffin.DOMComponent.prototype.toggleRootAttr = function (
  _attrName,
  _attrValue,
) {
  if (_attrValue) {
    this._getDomNode().setAttribute(_attrName, _attrValue);
  } else {
    this._getDomNode().removeAttribute(_attrName);
  }
};

Muffin.DOMComponent.prototype.toggleSurface = function (
  _surfaceName,
  _state = "switch",
  _toggleClass = "_active",
) {
  let _targetSurface = this._getDomNode().querySelector(
    `[surface='${_surfaceName}']`,
  );
  if (!_targetSurface) {
    console.warn("WARN: Surface to toggle Not Found - ", _surfaceName);
    return;
  }

  var TOGGLE_STATES = {
    show: "add",
    hide: "remove",
    switch: "toggle",
  };

  // let _onBeforeOpen = targetTabToggleElToBeActive.getAttribute("on-before-open");
  // let _onAfterOpen = targetTabToggleElToBeActive.getAttribute("on-after-open");
  // let _onBeforeClose = targetTabToggleElToBeActive.getAttribute("on-before-close");
  // let _onAfterClose = targetTabToggleElToBeActive.getAttribute("on-after-close");
  // let _targetSurfaceStateToBe = _targetSurface.classList.contains(_toggleClass) ? "" : "";

  // if(_onBeforeOpen){
  //     if(this[_onAfterSwitchTab]){
  //         this[_onAfterSwitchTab].call(this, this.uiVars.activeTab);
  //     }
  // }

  _targetSurface.classList[TOGGLE_STATES[_state]](_toggleClass);
};

Muffin.DOMComponent.prototype.isSurfaceActive = function (
  _surfaceName,
  _toggleClass = "_active",
) {
  let _targetSurface = this._getDomNode().querySelector(
    `[surface='${_surfaceName}']`,
  );
  return _targetSurface
    ? _targetSurface.classList.contains(_toggleClass)
    : false;
};

Muffin.DOMComponent.prototype.toggleTargetSurface = async function (srcEl) {
  // if(srcEl.dataset.dragging && srcEl.dataset.dragging == true){return;} //NOTE - tmp to allow draggable buttons that otherwise toggle surfaces
  let beforeToggleHook = srcEl.getAttribute("before-toggle-hook");
  let afterToggleHook = srcEl.getAttribute("after-toggle-hook");

  if (beforeToggleHook) {
    this[beforeToggleHook](srcEl);
    await delayTime(10);
  }
  this.toggleSurface(
    srcEl.dataset.target,
    srcEl.dataset.state,
    srcEl.dataset["toggle-class"],
  );

  if (afterToggleHook) {
    setTimeout(() => {
      this[afterToggleHook](srcEl);
    }, 10);
  }
};

Muffin.DOMComponent.prototype.toggleTargetTab = function (srcEl) {
  let _targetTab = srcEl.dataset.targettab;
  if (!_targetTab) {
    return;
  }
  let _targetTabGroup = srcEl.dataset.tabgroup; //NOTE - added to handle cases of multiple tab groups within a component (not tested for such multiple groups yet though)
  let targetTabToggleElToBeActive;
  if (!this._getDomNode()) {
    return;
  }

  const parentControlled = srcEl.hasAttribute
    ? srcEl.hasAttribute("parent-controlled")
    : false;

  this._getDomNode()
    .querySelectorAll(`[data-tabgroup="${_targetTabGroup}"][data-targettab]`)
    .forEach((_tabToggleEl) => {
      if (_tabToggleEl.dataset.targettab == _targetTab) {
        _tabToggleEl.classList.add("_active");
        this.toggleSurface(_tabToggleEl.dataset.targettab, "show");

        if (!_tabToggleEl.hasAttribute("disabled")) {
          targetTabToggleElToBeActive = _tabToggleEl;
        }
      } else {
        _tabToggleEl.classList.remove("_active");
        this.toggleSurface(_tabToggleEl.dataset.targettab, "hide");
      }
    });

  if (!parentControlled) {
    if (
      _targetTab == this.uiVars.activeTab &&
      _targetTabGroup == this.uiVars.activeTabGroup
    ) {
      return;
    } //NOTE #CAUTION - to prevent circular infinite calls caused in on-open cb function render call if present as in this case
  }

  this.uiVars.activeTab = _targetTab;
  this.uiVars.activeTabGroup = _targetTabGroup;

  if (targetTabToggleElToBeActive) {
    //NOTE - this check is useful for cases when toggleTargetTab is called without srcEl with object input via some function
    let _onAfterSwitchTab = targetTabToggleElToBeActive.getAttribute("on-open");
    if (targetTabToggleElToBeActive && _onAfterSwitchTab) {
      if (this[_onAfterSwitchTab]) {
        this[_onAfterSwitchTab].call(this, this.uiVars.activeTab, srcEl);
      }
    }
  }
};

Muffin.DOMComponent.prototype.notifyUser = function (
  _msgTxt,
  _duration = 4000,
  _interface = ":::notify-foreground",
) {
  let _msgTxtToNotify;

  if (typeof _msgTxt == "HTMLElement") {
    _msgTxtToNotify = _msgTxt.dataset.msg;
  } else {
    _msgTxtToNotify = _msgTxt;
  }

  PostOffice.publishToInterface(`NotificationToastManager${_interface}`, {
    msgTxt: _msgTxtToNotify,
    duration: _duration,
  });
};

Muffin.DOMComponent.prototype.getSessionUser = async function () {
  //NOTE - doesnt throw error if fails
  try {
    const { user_details } = await Muffin.AccountManagerService.getAccountDetails();

    const { name, email } = user_details;

    const firstName = name.split(" ")[0];

    return {
      firstName,
      fullName: name,
      email,
    };
  } catch (e) {
    console.error("ERROR: Failed to get Session User - ", e);
    return {};
  }
};

const delayTime = async (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const reloadPage = () => {
  window.location.reload();
};

const getSanitisedTextForSpeech = (_text, maxSlice = 2) => {
  return _text
    .replace(/[^a-zA-Z ]/g, " ")
    .split(" ")
    .slice(0, maxSlice)
    .join(" ")
    .toLowerCase();
};

Object.defineProperty(Array.prototype, "splitIntoMultipleArrays", {
  //NOTE - Caution - dont define like Array.prototype.func as it creates an enumerable property returned as index in Array.from
  value: function (chunkSize) {
    const result = [];
    for (let i = 0; i < this.length; i += chunkSize) {
      result.push(this.slice(i, i + chunkSize));
    }
    return result;
  },
  enumerable: false,
});

Object.defineProperty(JSON.constructor.prototype, "parseStringWithHTML", {
  value: function (jsonString) {
    return JSON.parse(jsonString, (key, value) => {
      if (
        typeof value === "string" &&
        value.startsWith("<") &&
        value.endsWith(">")
      ) {
        return value; // If value looks like an HTML string, return it as is
      } else {
        return value; // Otherwise, return the value as it is
      }
    });
  },
  enumerable: false,
});

Object.defineProperty(JSON.constructor.prototype, "stringifyJsonWithHTML", {
  value: function (jsonObj) {
    return JSON.stringify(jsonObj, function (key, value) {
      // Check if the value is a string containing HTML content
      if (
        typeof value === "string" &&
        value.startsWith("<") &&
        value.endsWith(">")
      ) {
        // Escape special characters in the HTML content
        return value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      return value;
    });
  },
  enumerable: false,
});

String.prototype.ellipsify = function (
  threshold = 9,
  clipIndexFromStart = 6,
  clipIndexFromEnd = 6,
) {
  return this.length > threshold
    ? `${this.substr(0, clipIndexFromStart)}......${this.substr(-clipIndexFromEnd)}`
    : this;
};

function generateSlug(value) {
  // Convert to lowercase
  let slug = value.toLowerCase();

  // Replace non-alphanumeric characters (except for hyphens) with a hyphen
  slug = slug.replace(/[^a-z0-9]+/g, "-");

  // Trim leading and trailing hyphens
  slug = slug.replace(/^-+|-+$/g, "");

  return slug;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function StringToB64(string) {
  return btoa(unescape(encodeURIComponent(string)));
}

function B64ToString(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function validURL(str) {
  if (str.split(".").pop() === "md") {
    return false;
  }
  var pattern = new RegExp(
    "^(https?:\\/\\/)?" + // protocol
      "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
      "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
      "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
      "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
      "(\\#[-a-z\\d_]*)?$",
    "i",
  ); // fragment locator
  return !!pattern.test(str);
}

function generateRandomString(length) {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function generateRandomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
}

function getRandomNumberBetweenAndExcept(min, max, except = []) {
  // Make sure the min value is smaller than the max value
  if (min > max) {
    [min, max] = [max, min];
  }
  var randNo = min + Math.floor(Math.random() * (max - min + 1));
  while (except.includes(randNo)) {
    randNo = min + Math.floor(Math.random() * (max - min + 1));
  }
  return randNo;
}

HTMLElement.prototype.addOneTimeEventListener = function (_eventName, _cb) {
  this.addEventListener(_eventName, (ev) => {
    this.removeEventListener(_eventName, arguments.callee);
    return _cb.call(this, ev);
  });
};

function executePromisesSequentially(promises) {
  return promises.reduce((accumulator, currentPromise) => {
    return accumulator.then((results) => {
      return currentPromise().then((result) => {
        results.push(result);
        return results;
      });
    });
  }, Promise.resolve([]));
}

function getUserAgentName() {
  var userAgent = window.navigator.userAgent;

  if (userAgent.indexOf("Chrome") != -1) {
    return "chrome";
  } else if (userAgent.indexOf("Firefox") != -1) {
    return "firefox";
  } else if (userAgent.indexOf("Edge") != -1) {
    return "edge";
  } else if (userAgent.indexOf("Safari") != -1) {
    return "safari";
  } else if (
    userAgent.indexOf("Opera") != -1 ||
    userAgent.indexOf("OPR") != -1
  ) {
    return "opera";
  } else if (
    userAgent.indexOf("MSIE") != -1 ||
    userAgent.indexOf("Trident") != -1
  ) {
    return "ie";
  } else {
    return "unknown";
  }
}

function checkIfTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints;
}

function requireScript(src) {
  return new Promise((resolve, reject) => {
    var _script = document.createElement("script");
    _script.src = src;

    // IE < 7, does not support onload
    _script.onreadystatechange = function () {
      if (
        _script.readyState === "loaded" ||
        _script.readyState === "complete"
      ) {
        // no need to be notified again
        _script.onreadystatechange = null;
        // notify user
        return resolve(_script);
      }
    };

    // other browsers
    _script.onload = function () {
      return resolve(_script);
    };

    // append and execute script
    document.documentElement.firstChild.appendChild(_script);
  });
}

function requireCss(href) {
  return new Promise((resolve, reject) => {
    var _link = document.createElement("link");
    _link.href = href;
    _link.setAttribute("rel", "stylesheet");

    // IE < 7, does not support onload
    _link.onreadystatechange = function () {
      if (_link.readyState === "loaded" || _link.readyState === "complete") {
        // no need to be notified again
        _link.onreadystatechange = null;
        // notify user
        return resolve(_link);
      }
    };

    // other browsers
    _link.onload = function () {
      return resolve(_link);
    };

    // append and execute script
    document.documentElement.firstChild.appendChild(_link);
  });
}

function isCssURL(url) {
  const fileExtension = url.split(".").pop().toLowerCase();
  return fileExtension === "css";
}

function capitalizeFirstLetter(string = "") {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function unionizeArrayOfArrays(arrayOfArrays = []) {
  // Concatenate all arrayOfArrays into a single array
  const flattenedArray = arrayOfArrays.reduce(
    (acc, curr) => acc.concat(curr),
    [],
  );

  // Use Set to remove duplicates
  const uniqueValues = [...new Set(flattenedArray)];

  return uniqueValues;
}

function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === "function";
}

Muffin.DOMComponent.prototype._getMuffinScope = function (_targetEl) {
  if (!_targetEl) {
    return this;
  }
  if (!_targetEl.hasAttribute("muffin-scope")) {
    return this;
  }

  let _scope = this;
  const muffinScope = _targetEl.getAttribute("muffin-scope");
  const scopeEl = this.getElement(`[data-component='${muffinScope}']`);

  console.warn("DEBUG: Scope Element ==== ", scopeEl);
  if (scopeEl && scopeEl.constructedFrom) {
    _scope = scopeEl.constructedFrom;
  }

  return _scope;
};

Muffin.DOMComponent.prototype.renderSelectively = async function (
  _options = {},
) {
  if (!this._getDomNode()) {
    return;
  }
  let _linkedElms = this._getDomNode().querySelectorAll("[data-uivar]");
  // console.debug("DBEUG: Updating Linked Elms - ", _linkedElms);
  [..._linkedElms].forEach((_el) => {
    const renderFunc = _el.getAttribute("render-func");
    const postRenderFunc = _el.getAttribute("post-render");
    const skipEventHandlersExcept = _el.getAttribute(
      "skip-event-handlers-except",
    );
    const renderEventRequired = _el.getAttribute("render-event");

    let proceed = true;

    if (renderEventRequired) {
      if (_options.event == renderEventRequired) {
        proceed = true;
      } else {
        proceed = false;
      }
    }

    if (!proceed) {
      return;
    }

    let uiVarsToPass =
      _el.dataset.uivar == "*" ? this.uiVars : this.uiVars[_el.dataset.uivar];

    // console.debug(`DEBUG: renderSelectively --> uiVarsToPass (${_el.dataset.uiVar}) === `, uiVarsToPass);

    let updatedInnerMarkup;
    if (renderFunc) {
      if (this.constructor[renderFunc]) {
        updatedInnerMarkup = this.constructor[renderFunc].call(
          this.constructor,
          uiVarsToPass,
          this.uid,
        );
      } else {
        updatedInnerMarkup = _el[_el.dataset.relation];
      }
    } else {
      updatedInnerMarkup = uiVarsToPass;
    }

    _el[_el.dataset.relation] = updatedInnerMarkup;

    let _containerElmsToProcess = [_el];

    if (skipEventHandlersExcept) {
      _containerElmsToProcess = Array.from(
        _el.querySelectorAll(skipEventHandlersExcept),
      );
    }

    if (_containerElmsToProcess) {
      _containerElmsToProcess.forEach((_containerEl) => {
        Array.from(_containerEl.querySelectorAll("[on-click]")).map(
          (_targetEl) => {
            const _scope = this._getMuffinScope(_targetEl);
            _targetEl.onclick = (ev) => {
              // console.warn("DEBUG: On-Click Scope ==== ", _scope);
              _scope[_targetEl.attributes["on-click"].value].call(
                _scope,
                _targetEl,
                ev,
              );
            };
          },
        );
        Array.from(_containerEl.querySelectorAll("[on-input]")).map(
          (_targetEl) => {
            _targetEl.oninput = (ev) => {
              const _scope = this._getMuffinScope(_targetEl);
              // console.warn("DEBUG: On-Input Scope ==== ", _scope);
              _scope[_targetEl.attributes["on-input"].value].call(
                _scope,
                _targetEl,
                ev,
              );
            };
          },
        );
        Array.from(_containerEl.querySelectorAll("[on-change]")).map(
          (_targetEl) => {
            const _scope = this._getMuffinScope(_targetEl);
            _targetEl.onchange = (ev) => {
              console.warn("DEBUG: On-Change Scope ==== ", _scope);
              console.warn("DEBUG: On-Change This ==== ", this);
              _scope[_targetEl.attributes["on-change"].value].call(
                _scope,
                _targetEl,
                ev,
              );
            };
          },
        );
        Array.from(_containerEl.querySelectorAll("[on-contextmenu]")).map(
          (_targetEl) => {
            _targetEl.oncontextmenu = (ev) => {
              ev.preventDefault();
              const _scope = this._getMuffinScope(_targetEl);
              _scope[_targetEl.attributes["on-contextmenu"].value].call(
                _scope,
                _targetEl,
                ev,
              );
            };
          },
        );

        Array.from(_containerEl.querySelectorAll("[on-longpress]")).map(
          (_targetEl) => {
            _targetEl.onlongpress = (ev) => {
              ev.preventDefault();
              const _scope = this._getMuffinScope(_targetEl);
              _scope[_targetEl.attributes["on-longpress"].value].call(
                _scope,
                _targetEl,
                ev,
              );
            };
          },
        );

        Array.from(_containerEl.querySelectorAll("[on-longpress-end]")).map(
          (_targetEl) => {
            _targetEl.onlongpressend = (ev) => {
              ev.preventDefault();
              const _scope = this._getMuffinScope(_targetEl);
              _scope[_targetEl.attributes["on-longpress-end"].value].call(
                _scope,
                _targetEl,
                ev,
              );
            };
          },
        );
      });
    }
    // console.debug("DEBUG: updated linked el - ", _el, _el.dataset.relation, _el.dataset.uivar, this.uiVars[_el.dataset.uivar])

    if (postRenderFunc) {
      setTimeout(() => {
        this[postRenderFunc].call(this, _el);
      }, 100);
    }
  });
};

Muffin.DOMComponent.prototype._loadAllDependencies = async function (
  sequential = false,
) {
  if (!this.constructor.dependencies) {
    return;
  }

  try {
    // If sequential is true, process each dependency one after another
    if (sequential) {
      for (const _src of this.constructor.dependencies) {
        await (isCssURL(_src) ? requireCss(_src) : requireScript(_src));
      }
    } else {
      // Otherwise, load dependencies concurrently
      await Promise.all(
        this.constructor.dependencies.map((_src) => {
          return isCssURL(_src) ? requireCss(_src) : requireScript(_src);
        }),
      );
    }

    // After loading all dependencies, mark as loaded
    this.uiVars._loadedAllDependencies = true;
  } catch (e) {
    // Handle any errors during loading
    throw e;
  }
};

Muffin.DOMComponent.prototype.gotoRoute = function (srcEl) {
  // console.debug("DBEUG: gotoRoute called from - ", srcEl);
  if (!Muffin._router) {
    console.warn(
      "WARN: GoTo Route Called, But Muffin Router instance not Found...Aborting.",
    );
    return;
  }

  const _targetRoute = srcEl.dataset.target;

  if (!_targetRoute) {
    console.warn(
      "WARN: GoTo Route Called, But No Target Specified...Aborting.",
    );
    return;
  }

  if (
    _targetRoute.startsWith("https://") ||
    _targetRoute.startsWith("http://")
  ) {
    const _linkTarget = srcEl.getAttribute("target");
    if (_linkTarget == "_blank") {
      window.open(_targetRoute, _linkTarget);
    } else {
      window.location.href = _targetRoute;
    }
  } else if (_targetRoute.startsWith("event:::")) {
    const payload = {
      target: _targetRoute.split("event:::")[1],
      params: {},
    };
    for (let attr of srcEl.attributes) {
      if (attr.name.startsWith("event-")) {
        const paramKey = attr.name.slice(6); // Get part after 'event-'
        payload.params[paramKey] = attr.value;
      }
    }
    if (payload.target) {
      PostOffice.sockets.global.dispatchMessage("goto-route-event", payload);
    }
  } else {
    const _routeParams = srcEl.getAttribute("route-params");
    Muffin._router.go(_targetRoute, _routeParams);
  }

  const onAfterGotoRoute = srcEl.getAttribute("on-after");
  if (onAfterGotoRoute) {
    this[onAfterGotoRoute].call(this, srcEl, _targetRoute);
  }
};

// Muffin.DOMComponent.prototype.gotoRoute = function (srcEl) {
//     // console.debug("DBEUG: gotoRoute called from - ", srcEl);
//     if(!Muffin._router){
//         console.warn("WARN: GoTo Route Called, But Muffin Router instance not Found...Aborting.");
//         return;
//     }

//     const _targetRoute = srcEl.dataset.target;

//     if(!_targetRoute){
//         console.warn("WARN: GoTo Route Called, But No Target Specified...Aborting.");
//         return;
//     }

//     if(_targetRoute.startsWith("https://") || _targetRoute.startsWith("http://")){
//         const _linkTarget = srcEl.getAttribute("target");
//         if(_linkTarget == "_blank"){
//             window.open(_targetRoute, _linkTarget);
//         }else{
//             window.location.href = _targetRoute;
//         }
//     }else{
//         const _routeParams = srcEl.getAttribute("route-params");
//         Muffin._router.go(_targetRoute, _routeParams);
//     }

//     const onAfterGotoRoute = srcEl.getAttribute("on-after");
//     if(onAfterGotoRoute){
//         this[onAfterGotoRoute].call(this, srcEl, _targetRoute);
//     }
// }

Muffin.DOMComponent.prototype.gotoRoute = function (srcEl) {
  // console.debug("DBEUG: gotoRoute called from - ", srcEl);
  if (!Muffin._router) {
    console.warn(
      "WARN: GoTo Route Called, But Muffin Router instance not Found...Aborting.",
    );
    return;
  }

  const _targetRoute = srcEl.dataset.target;

  if (!_targetRoute) {
    console.warn(
      "WARN: GoTo Route Called, But No Target Specified...Aborting.",
    );
    return;
  }

  if (
    _targetRoute.startsWith("https://") ||
    _targetRoute.startsWith("http://")
  ) {
    const _linkTarget = srcEl.getAttribute("target");
    if (_linkTarget == "_blank") {
      window.open(_targetRoute, _linkTarget);
    } else {
      window.location.href = _targetRoute;
    }
  } else if (_targetRoute.startsWith("event:::")) {
    const payload = {
      target: _targetRoute.split("event:::")[1],
      params: {},
    };
    for (let attr of srcEl.attributes) {
      if (attr.name.startsWith("event-")) {
        const paramKey = attr.name.slice(6); // Get part after 'event-'
        payload.params[paramKey] = attr.value;
      }
    }
    if (payload.target) {
      PostOffice.sockets.global.dispatchMessage("goto-route-event", payload);
    }
  } else {
    const _routeParams = srcEl.getAttribute("route-params");
    Muffin._router.go(_targetRoute, _routeParams);
  }

  const onAfterGotoRoute = srcEl.getAttribute("on-after");
  if (onAfterGotoRoute) {
    this[onAfterGotoRoute].call(this, srcEl, _targetRoute);
  }
};

Muffin.DOMComponent.prototype.convertOnClickToOnMouseDown = function () {
  this._getDomNode()
    .querySelectorAll("on-click")
    .forEach(async (_element) => {
      if (_element && typeof _element === "object") {
        // Get the existing onclick attribute value
        var onClickValue = element.onclick;

        // If there is an onclick attribute, remove it and add onmousedown
        if (onClickValue) {
          element.onmousedown = onClickValue;
          element.onclick = null;
        }
      }
    });
};

Muffin.DOMComponent.prototype.notifyPendingRelease = function (srcEl) {
  let msg = srcEl.dataset.msg || "This is a planned Feature.";
  msg += srcEl.dataset.releasedate
    ? ` Expected release ~${srcEl.dataset.releasedate}`
    : " We'll update once its available.";
  this.notifyUser(msg);
};

Muffin.userAgent = getUserAgentName();
Muffin.isTouchDevice = checkIfTouchDevice();
// console.debug("DBEUG: ---------- userAgent -----------------", Muffin.userAgent, ", ---touch device---", Muffin.isTouchDevice);

function createThrottledFunction(callback, delay) {
  let lastExecutionTime = 0;
  let pendingPromise = null;

  return function (...args) {
    const currentTime = Date.now();

    // If there's a pending promise, return it
    if (pendingPromise) {
      return pendingPromise;
    }

    // If enough time has passed since the last execution, execute the callback
    if (currentTime - lastExecutionTime >= delay) {
      lastExecutionTime = currentTime;
      const result = callback.apply(this, args);

      // Create a new promise and set it as pending
      pendingPromise = new Promise((resolve) => {
        setTimeout(() => {
          pendingPromise = null;
          resolve(result);
        }, delay);
      });

      return pendingPromise;
    }

    // If not enough time has passed, return a resolved promise
    return Promise.resolve();
  };
}

function createThrottledFunctionWithQueue(callback, delay) {
  let isCooldown = false;
  let queue = [];

  function executeNextInQueue() {
    if (queue.length > 0) {
      const { args, resolve } = queue.shift();
      callback.apply(this, args);
      resolve(true);
      setTimeout(executeNextInQueue, delay);
    } else {
      isCooldown = false;
    }
  }

  return function (...args) {
    if (!isCooldown) {
      // If not in cooldown, execute the callback and start cooldown
      callback.apply(this, args);
      isCooldown = true;
      const promise = new Promise((resolve) => {
        setTimeout(() => {
          executeNextInQueue();
        }, delay);
        resolve(true);
      });
      return promise;
    } else {
      // If in cooldown, add the arguments to the queue
      const promise = new Promise((resolve) => {
        queue.push({ args, resolve });
      });
      return promise;
    }
  };
}

function getFutureDate(numOfDaysToAdd) {
  const currentDate = new Date();
  const futureDate = new Date(
    currentDate.getTime() + numOfDaysToAdd * 24 * 60 * 60 * 1000,
  );
  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  };
  const formattedDate = futureDate.toLocaleString("en-US", options);
  return formattedDate;
}

window._POLYFILLS_GLOBAL = {};
// NOTE - caution below is a recursive function
_POLYFILLS_GLOBAL.deepRemoveKeys = function (obj, keysToRemove = []) {
  if (typeof obj !== "object" || obj === null) {
    return obj; // Return non-object values unchanged
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => this.deepRemoveKeys(item, keysToRemove)); // Recursively remove keys from array elements
  }

  // Remove specified keys from the object
  const newObj = {};
  Object.keys(obj).forEach((key) => {
    if (!keysToRemove.includes(key)) {
      newObj[key] = this.deepRemoveKeys(obj[key], keysToRemove);
    }
  });
  return newObj;
};

_POLYFILLS_GLOBAL.getNestedDescriptor = function (obj, key) {
  // Base case: if the object is not an object or is null, return null
  if (typeof obj !== "object" || obj === null) {
    return null;
  }

  // If the key is found directly in the current object, return its descriptor
  if (obj.hasOwnProperty(key)) {
    return obj[key];
  }

  // Traverse nested objects
  for (const prop in obj) {
    const nestedDescriptor = this.getNestedDescriptor(obj[prop], key);
    if (nestedDescriptor !== null) {
      return nestedDescriptor;
    }
  }

  // If the key is not found in the object or its nested objects, return null
  return null;
};

function isScreenSmallerThanGivenInches(_inchesWidth = 10, _inchesHeight = 7) {
  //input in inches
  let dpiTmpEl = document.createElement("div");
  dpiTmpEl.style.cssText =
    "height: 1in; width: 1in; left: 100%; position: fixed; top: 100%;";
  document.body.appendChild(dpiTmpEl);
  let dpi_x = dpiTmpEl.offsetWidth;
  let dpi_y = dpiTmpEl.offsetHeight;

  let screenWidthInInches = screen.width / dpi_x;
  let screenHeightInInches = screen.height / dpi_y;

  // let screenWidthInInches = window.innerWidth / dpi_x;
  // let screenHeightInInches = window.innerHeight / dpi_y;

  document.body.removeChild(dpiTmpEl);

  return (
    screenWidthInInches < _inchesWidth || screenHeightInInches < _inchesHeight
  );
}

function areArraysEqual(arr1, arr2) {
  // Check if the arrays have the same length
  if (arr1.length !== arr2.length) {
    // Check if one array is empty and the other contains a single empty string
    if (
      (arr1.length === 0 && arr2.length === 1 && arr2[0] === "") ||
      (arr2.length === 0 && arr1.length === 1 && arr1[0] === "")
    ) {
      return true;
    }
    return false;
  }

  // Check if all elements are equal
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }

  // If all elements are equal and the lengths are equal, the arrays are equal
  return true;
}

function pluralizeSentence(input) {
  return input
    .split(" ")
    .map((word) => {
      if (word.toLowerCase() === "or") return word; // Don't pluralize 'or'

      // Add 'es' for words ending with 's', 'sh', 'ch', 'x', or 'z'
      if (/[sxz]$|[shch]$/.test(word.toLowerCase())) return word + "es";

      // Add 'ies' for words ending with 'y' preceded by a consonant
      if (
        word.toLowerCase().endsWith("y") &&
        !/[aeiou]y$/.test(word.toLowerCase())
      ) {
        return word.slice(0, -1) + "ies";
      }

      // Add 's' for general cases, except for words already ending in 's'
      if (!word.toLowerCase().endsWith("s")) return word + "s";

      return word; // Return unchanged if no rule applies
    })
    .join(" ");
}
