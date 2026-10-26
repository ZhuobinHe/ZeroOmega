import Toastify from "../../../lib/zero-dependencies/toastify/toastify-es.js";
import { tr } from "../../network/js/utils.js";
import {
  createProfileSelect,
  createProfileIcon,
  profileText,
} from "./profile_select.js";

const FALLBACKS = {
  quickRules_title: "Quick Rules",
  quickRules_currentProfile: "Current profile: $PROFILE$",
  quickRules_domainCount: "$COUNT$ domains on this page",
  quickRules_searchPlaceholder: "Search domains",
  quickRules_onlyUnmatched: "Only unmatched",
  quickRules_mainFrame: "Main document",
  quickRules_requestCount: "$COUNT$ requests",
  quickRules_unmatched: "No domain rule matched",
  quickRules_defaultLabel: "default:",
  quickRules_edit: "Edit",
  quickRules_add: "Add",
  quickRules_collapse: "Collapse",
  quickRules_patternLabel: "Domain",
  quickRules_patternExact: "exact match",
  quickRules_patternRequired: "Please enter a domain.",
  quickRules_targetLabel: "Result profile",
  quickRules_sharedWarning: "$COUNT$ domains on this page share this rule; saving will change all of them.",
  quickRules_tempRuleHint: "Handled by a temp rule; not managed here.",
  quickRules_otherRuleHint: "Matched by a $TYPE$ rule; not managed here.",
  quickRules_ownerHint: "Rule belongs to $PROFILE$",
  quickRules_openInOptions: "Open in options",
  quickRules_saved: "Rule saved",
  quickRules_added: "Rule added",
  quickRules_saveFailed: "Failed to save the rule.",
  quickRules_stale: "The rule has changed, the list has been refreshed.",
  quickRules_loadFailed: "Failed to read requests: $ERROR$",
  quickRules_noTab: "Cannot find the current tab.",
  quickRules_notSupported: "The current profile does not support rules. Switch to an auto switch profile to edit.",
  quickRules_loading: "Reading requests on this page…",
  quickRules_empty: "No requests recorded on this page yet.",
  quickRules_emptyHelp: "For single-page apps, press refresh. Data is lost after the extension restarts.",
  quickRules_noMatch: "No domain matches the filter.",
};

const substitute = (message, args) => {
  if (!args || !args.length) return message;
  let index = 0;
  return message.replace(/\$(\d+:)?(\w+)\$/g, () => {
    const value = args[index++];
    return value == null ? "" : String(value);
  });
};

const t = (key, args) => {
  let message = "";
  try {
    message = (chrome?.i18n?.getMessage?.(key, args)) || "";
  } catch (_) {
    message = "";
  }
  if (message) return message;
  return substitute(FALLBACKS[key] || key, args);
};

const REFRESH_INTERVAL = 1500;

const state = (window.OmegaPopup && window.OmegaPopup.state) || {};
const tabId = window.OmegaPopup ? window.OmegaPopup.tabId : null;
const availableProfiles = state.availableProfiles || {};
const validResultProfiles = (state.validResultProfiles || [])
  .filter((name) => name.indexOf("__") !== 0)
  .map((name) => availableProfiles["+" + name])
  .filter(Boolean);
const canAddRule =
  !!state.currentProfileCanAddRule && validResultProfiles.length > 0;
const defaultResultProfileName =
  validResultProfiles.find((profile) => profile.name === "direct")?.name ||
  validResultProfiles[0]?.name ||
  "";

const els = {
  title: document.getElementById("qr-title"),
  subtitle: document.getElementById("qr-subtitle"),
  refresh: document.getElementById("qr-refresh"),
  options: document.getElementById("qr-options"),
  search: document.getElementById("qr-search"),
  onlyUnmatched: document.getElementById("qr-only-unmatched"),
  onlyUnmatchedLabel: document.getElementById("qr-only-unmatched-label"),
  notice: document.getElementById("qr-notice"),
  list: document.getElementById("qr-list"),
  empty: document.getElementById("qr-empty"),
};

let domains = [];
let loading = true;
let loadError = null;
let searchText = "";
let onlyUnmatched = false;
let expandedHost = null;
let expandedMode = null;
let lastRenderKey = "";

const toast = (text, isError) => {
  Toastify({
    text: text,
    position: "center",
    duration: isError ? 3000 : 1600,
    style: isError ? { background: "#a94442" } : undefined,
  }).showToast();
};

const createBadge = (text, className) => {
  const badge = document.createElement("span");
  badge.className = "qr-badge " + className;
  badge.textContent = text;
  return badge;
};

const createArrow = () => {
  const arrow = document.createElement("span");
  arrow.className = "qr-arrow";
  arrow.textContent = "→";
  return arrow;
};

const createProfileChip = (name) => {
  const chip = document.createElement("span");
  chip.className = "qr-profile-chip";
  const profile = availableProfiles["+" + name];
  if (profile) {
    chip.appendChild(createProfileIcon(profile, availableProfiles));
    chip.appendChild(document.createTextNode(profileText(profile)));
  } else {
    chip.textContent = name || "";
  }
  return chip;
};

const conditionLabel = (conditionType) =>
  tr("condition_" + conditionType) || conditionType;

const actionFor = (domain) => {
  if (!canAddRule) return null;
  if (domain.rule) {
    return domain.rule.editable
      ? { mode: "edit", label: t("quickRules_edit") }
      : null;
  }
  if (domain.tempRuleProfileName) return null;
  return { mode: "add", label: t("quickRules_add") };
};

const openOptions = (hash) => {
  const url = chrome.runtime.getURL("options.html") + (hash || "");
  chrome.tabs.create({ url: url });
};

const renderMatch = (domain) => {
  const match = document.createElement("div");
  match.className = "qr-match";
  const rule = domain.rule || domain.otherRule;
  if (rule) {
    match.appendChild(
      createBadge(
        conditionLabel(rule.conditionType),
        domain.rule ? "qr-badge-rule" : "qr-badge-other"
      )
    );
    if (rule.pattern) {
      const pattern = document.createElement("code");
      pattern.className = "qr-pattern";
      pattern.textContent = rule.pattern;
      match.appendChild(pattern);
    }
    match.appendChild(createArrow());
    match.appendChild(createProfileChip(rule.targetProfileName));
  } else {
    match.appendChild(
      createBadge(t("quickRules_unmatched"), "qr-badge-none")
    );
    if (domain.defaultProfileName) {
      const label = document.createElement("span");
      label.textContent = t("quickRules_defaultLabel") + " ";
      match.appendChild(label);
      match.appendChild(createProfileChip(domain.defaultProfileName));
    }
  }
  return match;
};

const createHint = (text, link) => {
  const hint = document.createElement("div");
  hint.className = "qr-hint";
  const icon = document.createElement("span");
  icon.className = "glyphicon glyphicon-info-sign";
  hint.appendChild(icon);
  hint.appendChild(document.createTextNode(text));
  if (link) {
    const anchor = document.createElement("a");
    anchor.href = "#";
    anchor.textContent = link.label;
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      openOptions(link.hash);
    });
    hint.appendChild(anchor);
  }
  return hint;
};

const renderHints = (domain) => {
  const hints = [];
  if (domain.tempRuleProfileName) {
    hints.push(createHint(t("quickRules_tempRuleHint")));
  }
  if (domain.otherRule) {
    hints.push(
      createHint(
        t("quickRules_otherRuleHint", [
          conditionLabel(domain.otherRule.conditionType),
        ])
      )
    );
  }
  if (domain.rule && !domain.rule.editable) {
    hints.push(
      createHint(t("quickRules_ownerHint", [domain.rule.ownerProfileName]), {
        label: t("quickRules_openInOptions"),
        hash: "#!/profile/" + encodeURIComponent(domain.rule.ownerProfileName),
      })
    );
  }
  return hints;
};

const renderForm = (domain, mode) => {
  const form = document.createElement("div");
  form.className = "qr-form";

  const errorEl = document.createElement("div");
  errorEl.className = "qr-form-error";
  errorEl.style.display = "none";
  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.style.display = "block";
  };

  const patternField = document.createElement("div");
  patternField.className = "qr-field";
  const patternLabel = document.createElement("label");
  patternLabel.textContent = t("quickRules_patternLabel");
  const patternInput = document.createElement("input");
  patternInput.type = "text";
  patternInput.className = "form-control qr-pattern";
  patternInput.spellcheck = false;
  const isEdit = mode === "edit";
  patternInput.value = isEdit ? domain.rule.pattern : domain.hostname;
  patternField.appendChild(patternLabel);
  patternField.appendChild(patternInput);
  if (!isEdit) {
    const exact = document.createElement("span");
    exact.className = "qr-field-hint";
    exact.textContent = t("quickRules_patternExact");
    patternField.appendChild(exact);
  }

  const profileField = document.createElement("div");
  profileField.className = "qr-field";
  const profileLabel = document.createElement("label");
  profileLabel.textContent = t("quickRules_targetLabel");
  const profileSelect = createProfileSelect({
    profiles: validResultProfiles,
    options: availableProfiles,
    selectedName: isEdit
      ? domain.rule.targetProfileName
      : defaultResultProfileName,
  });
  profileField.appendChild(profileLabel);
  profileField.appendChild(profileSelect.element);

  form.appendChild(errorEl);
  form.appendChild(patternField);
  form.appendChild(profileField);

  if (isEdit && (domain.rule.sharedHostCount || 0) > 1) {
    const warning = document.createElement("div");
    warning.className = "qr-warning";
    warning.textContent =
      "⚠ " + t("quickRules_sharedWarning", [domain.rule.sharedHostCount]);
    form.appendChild(warning);
  }

  const actions = document.createElement("div");
  actions.className = "qr-form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn-default btn-sm";
  cancel.textContent = tr("dialog_cancel") || "Cancel";
  cancel.addEventListener("click", () => {
    expandedHost = null;
    expandedMode = null;
    render();
  });
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "btn btn-primary btn-sm";
  submit.textContent = isEdit
    ? tr("dialog_save") || "Save"
    : t("quickRules_add");
  submit.addEventListener("click", () => {
    const pattern = patternInput.value.trim();
    if (!pattern) {
      showError(t("quickRules_patternRequired"));
      patternInput.focus();
      return;
    }
    const targetName = profileSelect.getValue();
    const buttons = form.querySelectorAll("button");
    const setBusy = (busy) => {
      buttons.forEach((button) => {
        button.disabled = busy;
      });
    };
    const done = (err) => {
      setBusy(false);
      if (err) {
        const message = err.message || t("quickRules_saveFailed");
        if (/changed|no longer|stale/i.test(message)) {
          showError(t("quickRules_stale"));
          loadDomains();
        } else {
          showError(message);
        }
        return;
      }
      OmegaTargetPopup.setState("lastProfileNameForCondition", targetName);
      toast(isEdit ? t("quickRules_saved") : t("quickRules_added"));
      expandedHost = null;
      expandedMode = null;
      loadDomains();
    };
    setBusy(true);
    if (isEdit) {
      OmegaTargetPopup.updateRule(
        domain.rule.ownerProfileName,
        domain.rule.ruleIndex,
        { pattern: pattern, profileName: targetName },
        domain.rule.tag,
        done
      );
    } else {
      OmegaTargetPopup.addCondition(
        { conditionType: "HostWildcardCondition", pattern: pattern },
        targetName,
        done
      );
    }
  });
  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(actions);

  return { element: form, patternInput: patternInput };
};

const renderRow = (domain) => {
  const row = document.createElement("li");
  row.className = "qr-row";
  row.dataset.hostname = domain.hostname;

  const main = document.createElement("div");
  main.className = "qr-row-main";
  const hostname = document.createElement("span");
  hostname.className = "qr-hostname";
  hostname.title = domain.hostname;
  if (domain.hasMainFrame) {
    const icon = document.createElement("span");
    icon.className = "glyphicon glyphicon-home";
    icon.title = t("quickRules_mainFrame");
    hostname.appendChild(icon);
  }
  hostname.appendChild(document.createTextNode(domain.hostname));
  const count = document.createElement("span");
  count.className = "qr-count";
  count.textContent = t("quickRules_requestCount", [domain.requestCount]);
  main.appendChild(hostname);
  main.appendChild(count);

  const action = actionFor(domain);
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-default btn-xs qr-action";
    const isExpanded = expandedHost === domain.hostname;
    button.textContent = isExpanded ? t("quickRules_collapse") : action.label;
    button.addEventListener("click", () => {
      if (isExpanded) {
        expandedHost = null;
        expandedMode = null;
      } else {
        expandedHost = domain.hostname;
        expandedMode = action.mode;
      }
      render();
      focusExpandedInput();
    });
    main.appendChild(button);
  }

  row.appendChild(main);
  row.appendChild(renderMatch(domain));
  renderHints(domain).forEach((hint) => row.appendChild(hint));
  if (expandedHost === domain.hostname && expandedMode) {
    const form = renderForm(domain, expandedMode);
    row.appendChild(form.element);
  }
  return row;
};

const focusExpandedInput = () => {
  if (!expandedHost) return;
  const rows = els.list.querySelectorAll(".qr-row");
  for (const row of rows) {
    if (row.dataset.hostname === expandedHost) {
      const input = row.querySelector(".qr-pattern");
      if (input) {
        input.focus();
        if (input.select) input.select();
      }
      return;
    }
  }
};

const visibleDomains = () =>
  domains.filter((domain) => {
    if (
      searchText &&
      domain.hostname.toLowerCase().indexOf(searchText) < 0
    ) {
      return false;
    }
    if (onlyUnmatched && domain.rule) return false;
    return true;
  });

const renderEmptyState = () => {
  els.empty.innerHTML = "";
  let text = null;
  let help = null;
  let isError = false;
  if (loadError) {
    text = t("quickRules_loadFailed", [loadError]);
    isError = true;
  } else if (tabId == null) {
    text = t("quickRules_noTab");
  } else if (loading) {
    text = t("quickRules_loading");
  } else if (!domains.length) {
    text = t("quickRules_empty");
    help = t("quickRules_emptyHelp");
  } else if (!visibleDomains().length) {
    text = t("quickRules_noMatch");
  }
  if (!text) {
    els.empty.style.display = "none";
    return;
  }
  els.empty.style.display = "block";
  const message = document.createElement("div");
  if (isError) message.className = "text-danger";
  message.textContent = text;
  els.empty.appendChild(message);
  if (help) {
    const helpEl = document.createElement("span");
    helpEl.className = "qr-empty-help";
    helpEl.textContent = help;
    els.empty.appendChild(helpEl);
  }
};

const render = () => {
  const renderKey = JSON.stringify([
    loading,
    loadError,
    searchText,
    onlyUnmatched,
    expandedHost,
    expandedMode,
    canAddRule,
    domains,
  ]);
  if (renderKey === lastRenderKey) return;
  lastRenderKey = renderKey;

  els.title.textContent = t("quickRules_title");
  els.subtitle.textContent =
    t("quickRules_currentProfile", [state.currentProfileName || "—"]) +
    "  ·  " +
    t("quickRules_domainCount", [domains.length]);
  els.search.placeholder = t("quickRules_searchPlaceholder");
  els.onlyUnmatchedLabel.textContent = t("quickRules_onlyUnmatched");

  if (!canAddRule) {
    els.notice.textContent = t("quickRules_notSupported");
    els.notice.classList.add("visible");
  } else {
    els.notice.classList.remove("visible");
  }

  els.list.innerHTML = "";
  visibleDomains().forEach((domain) => {
    els.list.appendChild(renderRow(domain));
  });
  renderEmptyState();
};

const loadDomains = () => {
  if (tabId == null) {
    loading = false;
    render();
    return;
  }
  OmegaTargetPopup.getTabDomains(tabId, (err, list) => {
    loading = false;
    if (err) {
      loadError = err.message || String(err);
    } else {
      loadError = null;
      domains = list || [];
    }
    render();
  });
};

els.refresh.addEventListener("click", () => {
  expandedHost = null;
  expandedMode = null;
  loading = true;
  loadDomains();
});

els.options.addEventListener("click", () => {
  openOptions(
    state.currentProfileName
      ? "#!/profile/" + encodeURIComponent(state.currentProfileName)
      : "#!/general"
  );
});

els.search.addEventListener("input", () => {
  searchText = els.search.value.trim().toLowerCase();
  expandedHost = null;
  expandedMode = null;
  render();
});

els.onlyUnmatched.addEventListener("change", () => {
  onlyUnmatched = els.onlyUnmatched.checked;
  expandedHost = null;
  expandedMode = null;
  render();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadDomains();
});

setInterval(() => {
  if (document.hidden) return;
  // Do not rebuild the list while a form is open, it would reset its state.
  if (expandedHost) return;
  loadDomains();
}, REFRESH_INTERVAL);

loadDomains();
