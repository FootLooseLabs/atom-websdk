/**
 * DOMComponent prototype extensions — promoted from per-project polyfills.
 * Applied once when atom-websdk loads. Safe to call even if already applied.
 */

function applyDOMExtensions(Muffin) {
    const proto = Muffin.DOMComponent.prototype;

    if (proto.__domExtensionsApplied) return;
    proto.__domExtensionsApplied = true;

    // ─── DOM queries ──────────────────────────────────────────────────────────

    proto.getElement = function(filter) {
        const node = this._getDomNode();
        return node ? node.querySelector(filter) : null;
    };

    proto.getElements = function(filter) {
        const node = this._getDomNode();
        return node ? node.querySelectorAll(filter) : [];
    };

    // ─── Button busy state ────────────────────────────────────────────────────

    proto.toggleBtnBusyState = function(btnEl, state = "busy") {
        if (state === "busy") {
            btnEl.classList.add("busy");
            btnEl.setAttribute("disabled", true);
        } else {
            btnEl.classList.remove("busy");
            btnEl.removeAttribute("disabled");
        }
    };

    // ─── Root attribute toggle ────────────────────────────────────────────────

    proto.toggleRootAttr = function(attrName, attrValue) {
        const node = this._getDomNode();
        if (!node) return;
        if (attrValue) node.setAttribute(attrName, attrValue);
        else node.removeAttribute(attrName);
    };

    // ─── Surface helpers ──────────────────────────────────────────────────────

    proto.toggleSurface = function(surfaceName, state = "switch", toggleClass = "_active") {
        const node = this._getDomNode();
        if (!node) return;
        const el = node.querySelector(`[surface='${surfaceName}']`);
        if (!el) { console.warn(`Muffin: surface "${surfaceName}" not found`); return; }
        const ops = { show: "add", hide: "remove", switch: "toggle" };
        el.classList[ops[state] || "toggle"](toggleClass);
    };

    proto.isSurfaceActive = function(surfaceName, toggleClass = "_active") {
        const node = this._getDomNode();
        if (!node) return false;
        const el = node.querySelector(`[surface='${surfaceName}']`);
        return el ? el.classList.contains(toggleClass) : false;
    };

    proto.toggleTargetSurface = async function(srcEl) {
        const beforeHook = srcEl.getAttribute("before-toggle-hook");
        const afterHook  = srcEl.getAttribute("after-toggle-hook");
        if (beforeHook) { this[beforeHook]?.(srcEl); await _delay(10); }
        this.toggleSurface(srcEl.dataset.target, srcEl.dataset.state, srcEl.dataset["toggle-class"]);
        if (afterHook) setTimeout(() => this[afterHook]?.(srcEl), 10);
    };

    // ─── Tab helpers ──────────────────────────────────────────────────────────

    proto.toggleTargetTab = function(srcEl) {
        const targetTab   = srcEl.dataset.targettab;
        const tabGroup    = srcEl.dataset.tabgroup;
        if (!targetTab || !this._getDomNode()) return;

        const parentControlled = srcEl.hasAttribute("parent-controlled");

        let activeToggleEl;
        this._getDomNode()
            .querySelectorAll(`[data-tabgroup="${tabGroup}"][data-targettab]`)
            .forEach(el => {
                if (el.dataset.targettab === targetTab) {
                    el.classList.add("_active");
                    this.toggleSurface(el.dataset.targettab, "show");
                    if (!el.hasAttribute("disabled")) activeToggleEl = el;
                } else {
                    el.classList.remove("_active");
                    this.toggleSurface(el.dataset.targettab, "hide");
                }
            });

        if (!parentControlled &&
            targetTab === this.uiVars.activeTab &&
            tabGroup  === this.uiVars.activeTabGroup) return;

        this.uiVars.activeTab      = targetTab;
        this.uiVars.activeTabGroup = tabGroup;

        if (activeToggleEl) {
            const onOpen = activeToggleEl.getAttribute("on-open");
            if (onOpen && this[onOpen]) this[onOpen].call(this, this.uiVars.activeTab, srcEl);
        }
    };

    // ─── Child load awaiter ───────────────────────────────────────────────────

    proto.awaitChildLoad = function(childName, timeout = 3000) {
        return new Promise((resolve, reject) => {
            if (this.composedScope[childName]) return resolve(this.composedScope[childName]);
            this.interface.on("child-composed", child => {
                if (child === childName) resolve(this.composedScope[childName]);
            });
            setTimeout(() => reject(new Error(`Muffin: awaitChildLoad timed out for "${childName}"`)), timeout);
        });
    };

    // ─── Batch subscriptions ──────────────────────────────────────────────────

    proto.initSubscriptions = function(subscriptionsArr) {
        return Promise.all(subscriptionsArr.map(sub => {
            return Muffin.WebInterface.subscribe(
                `${sub.host}|||${sub.interface}`,
                this.interface.name,
                sub.localInterfaceEvent
            );
        }));
    };

    // ─── Clipboard ────────────────────────────────────────────────────────────

    proto.copyToClipboard = function(srcEl) {
        navigator.clipboard.writeText(srcEl.dataset.text);
        this.notifyUser(`<i class='fas fa-check-circle'></i> Copied`);
    };

    // ─── Notifications ────────────────────────────────────────────────────────

    proto.notifyUser = function(msgTxt, duration = 4000, interfaceSuffix = ":::notify-foreground") {
        const text = (msgTxt instanceof HTMLElement) ? msgTxt.dataset.msg : msgTxt;
        Muffin.PostOffice.publishToInterface(`NotificationManager${interfaceSuffix}`, {
            msgTxt: text,
            duration
        });
    };

    // ─── Session user ─────────────────────────────────────────────────────────

    proto.getSessionUser = async function() {
        try {
            const { user_details } = await Muffin.AccountManagerService.getAccountDetails();
            const { name, email } = user_details;
            return { firstName: name.split(" ")[0], fullName: name, email };
        } catch(e) {
            console.error("Muffin: getSessionUser failed —", e);
            return {};
        }
    };

    // ─── Parent/grandparent delegation ───────────────────────────────────────

    proto.callParent = function(srcEl, ev) {
        const args = [srcEl, ev, _extractPassData(srcEl, this.data), _extractPassUiVars(srcEl, this.uiVars)];
        const parent = this.getParent();
        parent[srcEl.dataset.function].call(parent, ...args);
    };

    proto.callGrandParent = function(srcEl, ev) {
        const args = [srcEl, ev, _extractPassData(srcEl, this.data), _extractPassUiVars(srcEl, this.uiVars)];
        const gp = this.getParent()?.getParent();
        if (gp) gp[srcEl.dataset.function].call(gp, ...args);
    };

    // ─── Router ───────────────────────────────────────────────────────────────

    Muffin.Router.prototype.updateHistory = function(title, url) {
        window.history.pushState({ name: title, url }, title, url);
    };
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function _extractPassData(srcEl, data) {
    if (!srcEl.hasAttribute("pass-data")) return {};
    return srcEl.getAttribute("pass-data").split(",").reduce((acc, k) => {
        const key = k.trim(); acc[key] = data[key]; return acc;
    }, {});
}

function _extractPassUiVars(srcEl, uiVars) {
    if (!srcEl.hasAttribute("pass-uivars")) return {};
    return srcEl.getAttribute("pass-uivars").split(",").reduce((acc, k) => {
        const key = k.trim(); acc[key] = uiVars[key]; return acc;
    }, {});
}

// ─── Array / String / JSON utilities ─────────────────────────────────────────
// Applied once globally — these are pure utilities with no Muffin dependency

function applyGlobalUtilities() {
    if (Array.prototype.splitIntoMultipleArrays) return;

    Object.defineProperty(Array.prototype, "splitIntoMultipleArrays", {
        value(chunkSize) {
            const result = [];
            for (let i = 0; i < this.length; i += chunkSize) result.push(this.slice(i, i + chunkSize));
            return result;
        },
        enumerable: false
    });

    Object.defineProperty(String.prototype, "ellipsify", {
        value(threshold = 9, fromStart = 6, fromEnd = 6) {
            return this.length > threshold
                ? `${this.substr(0, fromStart)}......${this.substr(-fromEnd)}`
                : this;
        },
        enumerable: false
    });
}

// ─── Standalone utility exports ───────────────────────────────────────────────

const delayTime = ms => new Promise(r => setTimeout(r, ms));
const reloadPage = () => window.location.reload();
const generateSlug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const getSanitisedTextForSpeech = (text, maxSlice = 2) =>
    text.replace(/[^a-zA-Z ]/g, " ").split(" ").slice(0, maxSlice).join(" ").toLowerCase();

export { applyDOMExtensions, applyGlobalUtilities, delayTime, reloadPage, generateSlug, getSanitisedTextForSpeech };
