'use strict';

const {StateController, Logger} = require('kite-installer');
const {
  accountPath,
  authorizedPath,
  autocorrectFeedbackPath,
  autocorrectMetricsPath,
  autocorrectPath,
  autocorrectModelInfoPath,
  completionsPath,
  examplePath,
  hoverPath,
  hoverPositionPath,
  internalExpandURL,
  languagesPath,
  membersPath,
  onSaveValidationPath,
  openDocumentationInWebURL,
  projectDirPath,
  shouldNotifyPath,
  signaturePath,
  statusPath,
  symbolReportPath,
  usagePath,
  usagesPath,
  valueReportPath,
} = require('./urls');
const {promisifyRequest, promisifyReadResponse, head, parseJSON} = require('./utils');

const {MAX_FILE_SIZE} = require('./constants');
const {symbolId, idIsEmpty} = require('./kite-data-utils');
let Kite;
const metrics = require('./metrics');

const ensureKite = () => { if (!Kite) { Kite = require('./kite'); } };

const DataLoader = {
  isEditorAuthorized(editor) {
    ensureKite();

    const path = authorizedPath(editor);

    return promisifyRequest(StateController.client.request({path}))
    .then(resp => {
      Logger.logResponse(resp);
      Kite.handle403Response(editor, resp);

      if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp);
      }
    });
  },
  getSupportedLanguages() {
    const path = languagesPath();
    return promisifyRequest(StateController.client.request({path}))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp)
        .then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp)
        .then(json => parseJSON(json))
        .catch(() => null);
      }
    });
  },

  shouldOfferWhitelist(editor) {
    return this.projectDirForEditor(editor).then(path =>
      this.shouldNotify(editor).then(res => {
        return res
          ? path
          : null;
      })
      .catch(() => null));
  },

  projectDirForEditor(editor) {
    ensureKite();

    const filepath = editor.getPath();
    const path = projectDirPath(filepath);

    return promisifyRequest(StateController.client.request({path}))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode === 403) {
        return null;
      } else if (resp.statusCode === 404) {
        return Kite.app.getRootDirectory(editor);
      } else if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp).catch(() => null);
      }
    });
  },

  postSaveValidationData(editor) {
    ensureKite();

    const buffer = editor.getBuffer();
    const text = buffer.getText();

    if (text.length > MAX_FILE_SIZE) {
      Logger.warn('buffer contents too large, not attempting signatures');
      return Promise.resolve();
    }
    const payload = {
      metadata: this.getAutocorrectMetadata('validation_onsave'),
      buffer: text,
      filename: editor.getPath(),
      language: 'python',
    };

    return promisifyRequest(StateController.client.request({
      path: onSaveValidationPath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
      Kite.handle403Response(editor, resp);
      if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp);
      }
    })
    .catch(err => console.error(err));
  },

  postAutocorrectHashMismatchData(response, requestStartTime) {
    ensureKite();

    const payload = {
      metadata: this.getAutocorrectMetadata('metrics_hash_mismatch'),
      response,
      response_time: new Date() - requestStartTime,
    };

    return promisifyRequest(StateController.client.request({
      path: autocorrectMetricsPath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
    })
    .catch(err => console.error(err));
  },

  postAutocorrectFeedbackData(response, feedback) {
    ensureKite();

    const payload = {
      metadata: this.getAutocorrectMetadata('feedback_diffset'),
      response,
      feedback,
    };

    return promisifyRequest(StateController.client.request({
      path: autocorrectFeedbackPath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
    })
    .catch(err => console.error(err));
  },

  shouldNotify(editor) {
    const filepath = editor.getPath();
    const path = shouldNotifyPath(filepath);

    return promisifyRequest(StateController.client.request({path}))
    .then(resp => resp.statusCode === 200)
    .catch(() => false);
  },

  getStatus(editor) {
    if (!editor) { return Promise.resolve({status: 'ready'}); }

    const filepath = editor.getPath();
    const path = statusPath(filepath);

    return promisifyRequest(StateController.client.request({path}))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode === 200) {
        return promisifyReadResponse(resp)
        .then(json => parseJSON(json))
        .catch(() => ({status: 'ready'}));
      }
      return {status: 'ready'};
    })
    .catch(() => ({status: 'ready'}));
  },

  getCompletionsAtPosition(editor, position) {
    ensureKite();

    const buffer = editor.getBuffer();
    const text = buffer.getText();

    if (text.length > MAX_FILE_SIZE) {
      Logger.warn('buffer contents too large, not attempting completions');
      return Promise.resolve([]);
    }

    const cursorPosition = buffer.characterIndexForPosition(position);
    const payload = {
      text,
      editor: 'atom',
      filename: editor.getPath(),
      cursor_runes: cursorPosition,
    };

    return promisifyRequest(StateController.client.request({
      path: completionsPath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
      Kite.handle403Response(editor, resp);
      if (resp.statusCode === 404) {
        // This means we had no completions for this cursor position.
        // Do not call reject() because that will generate an error
        // in the console and lock autocomplete-plus
        return [];
      } else if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp);
      }
    })
    .then(data => {
      data = parseJSON(data, {});
      data.completions = data.completions || [];

      return data.completions.map((c) => {
        return {
          text: c.insert || c.display,
          displayText: c.display,
          type: c.hint,
          rightLabel: c.hint,
          descriptionHTML: this.appendCompletionsFooter(c,
            c.documentation_html !== ''
              ? c.documentation_html
              : c.documentation_text),
        };
      });
    })
    .catch(err => {
      console.error(err);
      return [];
    });
  },

  appendCompletionsFooter(completion, descriptionHTML) {
    const id = completion.symbol && completion.symbol.value &&
        completion.symbol.value[0] && completion.symbol.value[0].id;
    const actions = id
      ? `<a href="${openDocumentationInWebURL(id)}">Web</a>
         <a href="${internalExpandURL(id)}">More</a>`
      : '';

    return `
    <div class="kite-completions">
      <div class="kite-completion-description">${descriptionHTML}</div>
      <div class="kite-completion-footer">
        <kite-links class="one-line" metric="Suggestion">
          ${actions}
          <div class="flex-separator"></div>
          <kite-logo small title="Powered by Kite" class="badge"></kite-logo>
        </kite-links>
      </div>
    </div>`;
  },

  getSignaturesAtPosition(editor, position) {
    ensureKite();

    const buffer = editor.getBuffer();
    const text = buffer.getText();

    if (text.length > MAX_FILE_SIZE) {
      Logger.warn('buffer contents too large, not attempting signatures');
      return Promise.resolve([]);
    }

    const cursorPosition = buffer.characterIndexForPosition(position);
    const payload = {
      text,
      editor: 'atom',
      filename: editor.getPath(),
      cursor_runes: cursorPosition,
    };

    return promisifyRequest(StateController.client.request({
      path: signaturePath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
      Kite.handle403Response(editor, resp);
      if (resp.statusCode === 404) {
        // This means we had no completions for this cursor position.
        // Do not call reject() because that will generate an error
        // in the console and lock autocomplete-plus
        return null;
      } else if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp);
      }
    })
    .then(data => parseJSON(data, {}))
    .catch(err => console.error(err));
  },

  getAutocorrectData(editor) {
    ensureKite();

    const buffer = editor.getBuffer();
    const text = buffer.getText();

    if (text.length > MAX_FILE_SIZE) {
      Logger.warn('buffer contents too large, not attempting signatures');
      return Promise.resolve();
    }
    const payload = {
      metadata: this.getAutocorrectMetadata('autocorrect_request'),
      buffer: text,
      filename: editor.getPath(),
      language: 'python',
    };

    return promisifyRequest(StateController.client.request({
      path: autocorrectPath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
      Kite.handle403Response(editor, resp);
      if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp);
      }
    })
    .then(data => parseJSON(data, {}))
    .catch(err => console.error(err));
  },

  getAutocorrectModelInfo(version) {
    ensureKite();

    const payload = {
      metadata: this.getAutocorrectMetadata('autocorrect_request'),
      language: 'python',
      version,
    };

    return promisifyRequest(StateController.client.request({
      path: autocorrectModelInfoPath(),
      method: 'POST',
    }, JSON.stringify(payload)))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode !== 200) {
        return promisifyReadResponse(resp).then(data => {
          throw new Error(`Error ${resp.statusCode}: ${data}`);
        });
      } else {
        return promisifyReadResponse(resp);
      }
    })
    .then(data => parseJSON(data, {}))
    .catch(err => console.error(err));
  },

  getAutocorrectMetadata(event) {
    return {
      event,
      source: 'atom',
      os_name: metrics.getOsName(),
      plugin_version: metrics.version,
    };
  },

  getHoverDataAtRange(editor, range) {
    const path = hoverPath(editor, range);
    return promisifyRequest(StateController.client.request({path}))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode !== 200) {
        throw new Error(`${resp.statusCode} status at ${path}`);
      }
      return promisifyReadResponse(resp);
    })
    .then(data => parseJSON(data));
  },

  getHoverDataAtPosition(editor, position) {
    const path = hoverPositionPath(editor, position);
    return promisifyRequest(StateController.client.request({path}))
    .then(resp => {
      Logger.logResponse(resp);
      if (resp.statusCode !== 200) {
        throw new Error(`${resp.statusCode} status at ${path}`);
      }
      return promisifyReadResponse(resp);
    })
    .then(data => parseJSON(data));
  },

  getReportDataAtRange(editor, range) {
    return this.getHoverDataAtRange(editor, range)
    .then(data => this.getReportDataFromHover(data));
  },
  getReportDataAtPosition(editor, range) {
    return this.getHoverDataAtPosition(editor, range)
    .then(data => this.getReportDataFromHover(data));
  },

  getReportDataFromHover(data) {
    const id = head(data.symbol).id;
    return !idIsEmpty(id)
      ? this.getSymbolReportDataForId(id)
        .then(report => [data, report])
        .catch(err => [data])
      : [data];
  },

  getValueReportDataForId(id) {
    const path = valueReportPath(id);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report))
      .then(report => {
        if (report.value && idIsEmpty(report.value.id)) {
          report.value.id = id;
        }
        return report;
      });
  },

  getSymbolReportDataForId(id) {
    const path = symbolReportPath(id);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report));
  },

  getMembersDataForId(id) {
    const path = membersPath(id);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report));
  },

  getUsagesDataForValueId(id, page, limit) {
    const path = usagesPath(id, page, limit);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report));
  },

  getUsageDataForId(id) {
    const path = usagePath(id);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        Logger.logResponse(resp);
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report))
      .then(report => {
        if (report.value && idIsEmpty(report.value.id)) { report.value.id = id; }
        return report;
      });
  },

  getExampleDataForId(id) {
    const path = examplePath(id);

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(report => parseJSON(report));
  },

  getUserAccountInfo() {
    const path = accountPath();

    return promisifyRequest(StateController.client.request({path}))
      .then(resp => {
        if (resp.statusCode !== 200) {
          throw new Error(`${resp.statusCode} at ${path}`);
        }
        return promisifyReadResponse(resp);
      })
      .then(account => parseJSON(account));
  },

  openInWebAtPosition(editor, position) {
    metrics.featureRequested('open_in_web');
    return this.getHoverDataAtPosition(editor, position)
    .then(data => {
      this.openInWebForId(symbolId(head(data.symbol)));
      metrics.featureFulfilled('open_in_web');
    });
  },

  openInWebAtRange(editor, range) {
    metrics.featureRequested('open_in_web');
    return this.getHoverDataAtRange(editor, range)
    .then(data => {
      this.openInWebForId(symbolId(head(data.symbol)));
      metrics.featureFulfilled('open_in_web');
    });
  },

  openInWebForId(id) {
    atom.applicationDelegate.openExternal(openDocumentationInWebURL(id));
  },
};

module.exports = DataLoader;
