'use strict';

let Kite, DataLoader, OverlayManager, WordHoverGesture,
  screenPositionForMouseEvent,
  pixelPositionForMouseEvent, kiteUtils, CompositeDisposable,
  metrics, md5;

class Fix {
  constructor(diffs) {
    this.diffs = diffs;
    this.timestamp = new Date();
  }
}

class KiteEditor {
  constructor(editor) {
    this.editor = editor;
    this.buffer = editor.getBuffer();
    this.editorElement = atom.views.getView(editor);
    this.fixesHistory = [];

    this.subscribeToEditor();
  }

  dispose() {
    this.subscriptions && this.subscriptions.dispose();
    delete this.subscriptions;
    delete this.editorElement;
    delete this.editor;
    delete this.buffer;
  }

  subscribeToEditor() {
    if (!CompositeDisposable) {
      ({CompositeDisposable} = require('atom'));
      ({screenPositionForMouseEvent, pixelPositionForMouseEvent} = require('./utils'));
      WordHoverGesture = require('./gestures/word-hover');
      DataLoader = require('./data-loader');
    }

    const editor = this.editor;
    const subs = new CompositeDisposable();

    this.subscriptions = subs;

    this.hoverGesture = new WordHoverGesture(editor, {
      ignoredSelector: 'atom-overlay, atom-overlay *',
    });
    subs.add(this.hoverGesture);

    subs.add(this.hoverGesture.onDidActivate(({position}) => {
      if (atom.config.get('kite.enableHoverUI')) {
        if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
        OverlayManager.showHoverAtPositionWithDelay(editor, position);
      }
    }));
    subs.add(this.hoverGesture.onDidDeactivate(() => {
      if (atom.config.get('kite.enableHoverUI')) {
        if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
        OverlayManager.dismissWithDelay();
      }
    }));

    subs.add(editor.onDidChangeCursorPosition(() => {
      if (!Kite) { Kite = require('./kite'); }
      if (typeof Kite.setStatusLabel === 'function') { Kite.setStatusLabel(this); }
      if (atom.config.get('kite.enableHoverUI')) {
        if (!OverlayManager) { OverlayManager = require('./overlay-manager'); }
        OverlayManager.dismissWithDelay();
      }
    }));

    subs.add(editor.onDidDestroy(() => {
      if (!Kite) { Kite = require('./kite'); }
      Kite.unsubscribeFromEditor(editor);
    }));

    subs.add(editor.getBuffer().onWillSave(() => {
      if (!Kite) { Kite = require('./kite'); }
      if (Kite.isEditorWhitelisted(this.editor)) {
        return this.willSaveHook();
      }
      return null;
    }));
  }

  initialize() {
    if (!kiteUtils) {
      ({utils: kiteUtils} = require('kite-installer'));
    }

    return this.editor === atom.workspace.getActivePaneItem()
      ? DataLoader.isEditorAuthorized(this.editor)
      : Promise.resolve();
  }

  willSaveHook() {
    if (!Kite) { Kite = require('./kite'); }
    if (!metrics) { metrics = require('./metrics'); }

    if (!atom.config.get('kite.enableErrorRescue') || Kite.isSaveAll()) {
      return DataLoader.postSaveValidationData(this.editor).catch(() => {});
    }

    if (!md5) { md5 = require('md5'); }

    const requestStartTime = new Date();

    return Promise.all([
      DataLoader.postSaveValidationData(this.editor),
      DataLoader.getAutocorrectData(this.editor)
      .then(data => {
        const hash = md5(this.editor.getText());

        if (data.requested_buffer_hash !== hash) {
          DataLoader.postAutocorrectHashMismatchData(data, requestStartTime);
          return;
        }

        const fixes = data.diffs ? data.diffs.length : 0;

        this.lastCorrectionsData = data;

        if (fixes > 0) {
          const previousVersion = Kite.errorRescueVersion();
          const versionChanged = data.version !== previousVersion;
          const firstRunExperience = versionChanged && previousVersion === null;
          if (versionChanged && data.version != null) {
            localStorage.setItem('kite.autocorrect_model_version', data.version);
          }

          this.buffer.setTextViaDiff(data.new_buffer);
          this.fixesHistory.unshift(new Fix(data.diffs));

          metrics.featureApplied('autocorrect');

          if ((firstRunExperience || Kite.mustOpenErrorRescueSidebar()) &&
             !Kite.isErrorRescueSidebarVisible()) {
            Kite.toggleErrorRescueSidebar(true);
            if (firstRunExperience) {
              Kite.errorRescueSidebar.showFirstRunExperience();
            } else if (versionChanged) {
              Kite.errorRescueSidebar.loadModelInfo(data.version);
            }
          } else if (Kite.isErrorRescueSidebarVisible()) {
            Kite.errorRescueSidebar.renderDiffs(Kite.errorRescueSidebar.getCurrentEditorCorrectionsHistory());
            if (Kite.mustOpenErrorRescueSidebar()) {
              Kite.activateAndShowItem(Kite.errorRescueSidebar);
            }
            if (versionChanged) {
              Kite.errorRescueSidebar.loadModelInfo(data.version);
            }
          } else {
            if (versionChanged) {
              Kite.notifications.notifyErrorRescueVersionChange(data.version);
            }
          }
        }
      }),
    ]).catch(() => {});
  }

  expandRange(range) {
    if (!metrics) { metrics = require('./metrics'); }
    if (!Kite) { Kite = require('./kite'); }

    metrics.featureRequested('expand_panel');
    metrics.featureRequested('documentation');
    if (!Kite.isSidebarVisible()) { Kite.toggleSidebar(true); }

    Kite.activateAndShowItem(Kite.sidebar);
    return Kite.sidebar.showDataAtRange(this.kiteEditor.editor, range);
  }

  expandPosition(position) {
    if (!metrics) { metrics = require('./metrics'); }
    if (!Kite) { Kite = require('./kite'); }

    metrics.featureRequested('expand_panel');
    metrics.featureRequested('documentation');

    if (!Kite.isSidebarVisible()) { Kite.toggleSidebar(true); }

    return Kite.sidebar.showDataAtPosition(this.editor, position);
  }

  expandId(id) {
    if (!metrics) { metrics = require('./metrics'); }
    if (!Kite) { Kite = require('../kite'); }

    metrics.featureRequested('expand_panel');
    metrics.featureRequested('documentation');

    if (!Kite.isSidebarVisible()) { Kite.toggleSidebar(true); }
    Kite.activateAndShowItem(Kite.sidebar);
    return Kite.sidebar.showDataForSymbolId(this.editor, id);
  }

  openInWebAtRange(range) {
    return DataLoader.openInWebAtRange(this.editor, range);
  }

  openInWebAtPosition(position) {
    return DataLoader.openInWebAtPosition(this.editor, position);
  }

  openDefinitionForId(id) {
    return DataLoader.getValueReportDataForId(id)
    .then((data) => this.openDefinition(data.report.definition));
  }

  openDefinitionAtRange(range) {
    const token = this.tokensList.tokenAtRange(range);
    return this.openTokenDefinition(token);
  }

  openDefinitionAtPosition(position) {
    const token = this.tokensList.tokenAtPosition(position);
    return this.openTokenDefinition(token);
  }

  openDefinition(definition) {
    if (!metrics) { metrics = require('./metrics'); }

    if (definition.filename.trim() === '') { return Promise.resolve(false); }

    return new Promise((resolve, reject) => {
      metrics.featureRequested('definition');
      if (definition) {
        return atom.workspace.open(definition.filename)
        .then(editor => {
          metrics.featureFulfilled('definition');
          editor.setCursorBufferPosition([
            definition.line - 1, definition.column ? definition.column - 1 : 0,
          ], {
            autoscroll: true,
          });
          return true;
        });
      }
      return false;
    });
  }

  screenPositionForMouseEvent(event) {
    return screenPositionForMouseEvent(this.editorElement, event);
  }

  pixelPositionForMouseEvent(event) {
    return pixelPositionForMouseEvent(this.editorElement, event);
  }
}

module.exports = KiteEditor;
